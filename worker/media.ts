/**
 * 토론방 첨부(사진·움짤·동영상) 올리기 — R2 저장 + 청소용 관리 API.
 * 설명과 보안 원칙은 worker/index.ts 머리말 참고. 이 파일은 순수 로직이라 vitest 로 돌린다.
 *
 * 내보내기(보여 주기)는 여기서 하지 않는다 — R2 에 직접 붙인 media.ottcal.com 이 한다.
 * Worker 를 거치면 짤 한 번 볼 때마다 Worker 요청(무료 하루 10만)을 쓰고,
 * 아이폰 사파리가 요구하는 동영상 부분 요청(Range)도 직접 구현해야 한다.
 */

// ── 필요한 만큼만 선언한 Workers 타입 (@cloudflare/workers-types 를 들이지 않으려고) ──
export interface R2ObjectLike {
  key: string
  size: number
  uploaded: Date
}
export interface R2BucketLike {
  put(key: string, value: ArrayBuffer | ReadableStream, opts?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>
  delete(keys: string | string[]): Promise<void>
  list(opts?: { cursor?: string; limit?: number }): Promise<{ objects: R2ObjectLike[]; truncated: boolean; cursor?: string }>
}
export interface Env {
  MEDIA: R2BucketLike
  ASSETS: { fetch(req: Request): Promise<Response> }
  /** 올린 파일의 공개 주소 앞부분 (wrangler.jsonc vars) — R2 커스텀 도메인 */
  MEDIA_PUBLIC_BASE?: string
  /** 고아 청소 스크립트용 비밀값 — 대시보드 또는 `wrangler secret put MEDIA_ADMIN_TOKEN`. 없으면 관리 API 는 꺼진다 */
  MEDIA_ADMIN_TOKEN?: string
}

// ── 한도 — 앱의 src/utils/mediaHost.ts 와 반드시 같이 고친다. 여기가 서버 쪽 최종 관문이다 ──
const MB = 1_000_000
export const IMAGE_MAX_BYTES = 50 * MB
export const GIF_MAX_BYTES = 50 * MB
/** Cloudflare 무료 플랜의 요청 본문 한도(100MB)가 곧 이 한도다 */
export const VIDEO_MAX_BYTES = 100 * MB

const DEFAULT_PUBLIC_BASE = 'https://media.ottcal.com'
const KINDS = ['talk', 'avatars'] as const

interface Kind { type: string; ext: string; max: number; video: boolean }
const TYPES: Record<string, Kind> = {
  gif: { type: 'image/gif', ext: 'gif', max: GIF_MAX_BYTES, video: false },
  png: { type: 'image/png', ext: 'png', max: IMAGE_MAX_BYTES, video: false },
  jpg: { type: 'image/jpeg', ext: 'jpg', max: IMAGE_MAX_BYTES, video: false },
  webp: { type: 'image/webp', ext: 'webp', max: IMAGE_MAX_BYTES, video: false },
  mp4: { type: 'video/mp4', ext: 'mp4', max: VIDEO_MAX_BYTES, video: true },
  mov: { type: 'video/quicktime', ext: 'mov', max: VIDEO_MAX_BYTES, video: true },
  webm: { type: 'video/webm', ext: 'webm', max: VIDEO_MAX_BYTES, video: true },
}
/** R2 키 모양 — 이 밖의 키는 삭제를 거절한다 (경로 조작 방지) */
const KEY_RE = /^(talk|avatars)\/[A-Za-z0-9-]{8,64}\.(gif|png|jpg|webp|mp4|mov|webm)$/
const CACHE_FOREVER = 'public, max-age=31536000, immutable'
/** 형식 판정에 필요한 앞부분 길이 */
const HEAD_BYTES = 16

/**
 * 파일 첫 바이트로 형식 판정. 클라이언트가 붙인 Content-Type·확장자는 믿지 않는다.
 * 사용자 파일을 우리 도메인에서 내보내므로 HTML·SVG 가 섞이면 안 된다.
 */
export function sniff(head: Uint8Array): Kind | null {
  const at = (i: number, bytes: number[]) => bytes.every((v, k) => head[i + k] === v)
  const ascii = (i: number, s: string) => at(i, [...s].map(c => c.charCodeAt(0)))
  if (ascii(0, 'GIF8')) return TYPES.gif
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return TYPES.png
  if (at(0, [0xff, 0xd8, 0xff])) return TYPES.jpg
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return TYPES.webp
  if (at(0, [0x1a, 0x45, 0xdf, 0xa3])) return TYPES.webm                    // EBML (WebM)
  if (ascii(4, 'ftyp')) return ascii(8, 'qt  ') ? TYPES.mov : TYPES.mp4    // ISO BMFF (MP4·MOV)
  return null
}

/** 옛 이름 — 사진 형식만 판정 (테스트·호환용) */
export function sniffImageType(buf: ArrayBuffer): string | null {
  const k = sniff(new Uint8Array(buf, 0, Math.min(buf.byteLength, HEAD_BYTES)))
  return k && !k.video ? k.type : null
}

/** 올리기를 받아 줄 출처 — 우리 사이트(본 도메인·workers.dev 검증 주소)와 로컬 개발 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  let u: URL
  try { u = new URL(origin) } catch { return false }
  if (u.protocol === 'https:' && (u.hostname === 'ottcal.com' || u.hostname === 'www.ottcal.com')) return true
  if (u.protocol === 'https:' && /^ottcal\.[a-z0-9-]+\.workers\.dev$/.test(u.hostname)) return true
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true
  return false
}

export function publicUrl(env: Pick<Env, 'MEDIA_PUBLIC_BASE'>, key: string): string {
  return `${(env.MEDIA_PUBLIC_BASE || DEFAULT_PUBLIC_BASE).replace(/\/+$/, '')}/${key}`
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
const fail = (status: number, message: string) => json({ error: message }, status)
const mbText = (bytes: number) => `${Math.round(bytes / MB)}MB`

/** 이 요청이 첨부 관련이면 응답을, 아니면 null (정적 자산으로 넘긴다) */
export async function handleMedia(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname === '/api/media') {
    if (request.method !== 'POST') return fail(405, 'POST 만 됩니다.')
    return upload(request, env, url)
  }
  if (url.pathname.startsWith('/api/media-admin/')) return admin(request, env, url.pathname.slice('/api/media-admin/'.length))
  return null
}

/**
 * 본문 앞 HEAD_BYTES 를 읽어 형식을 정하고, 나머지는 **메모리에 모으지 않고 R2 로 흘려 보낸다.**
 * Worker 메모리는 128MB 라 100MB 영상을 통째로 들고 있을 수 없다.
 * R2 에 스트림을 넣으려면 길이를 미리 알아야 해서(FixedLengthStream) Content-Length 가 필수다 —
 * 브라우저가 File 을 보낼 때는 늘 붙는다.
 */
async function upload(request: Request, env: Env, url: URL): Promise<Response> {
  if (!isAllowedOrigin(request.headers.get('Origin'))) return fail(403, '허용되지 않은 출처예요.')

  const kind = url.searchParams.get('kind') || 'talk'
  if (!(KINDS as readonly string[]).includes(kind)) return fail(400, '알 수 없는 업로드 종류예요.')

  const length = Number(request.headers.get('Content-Length') || NaN)
  if (!Number.isFinite(length)) return fail(411, '파일 크기를 알 수 없어요.')
  if (length === 0 || !request.body) return fail(400, '빈 파일이에요.')
  if (length > VIDEO_MAX_BYTES) return fail(413, `파일이 너무 커요. 동영상은 ${mbText(VIDEO_MAX_BYTES)}, 사진·움짤은 ${mbText(IMAGE_MAX_BYTES)}까지 돼요.`)

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let got = 0
  while (got < Math.min(HEAD_BYTES, length)) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.byteLength
  }
  const head = concat(chunks, got).subarray(0, HEAD_BYTES)
  const k = sniff(head)
  if (!k) { reader.cancel().catch(() => {}); return fail(415, '사진(JPG·PNG·WEBP)·움짤(GIF)·동영상(MP4·MOV·WEBM)만 올릴 수 있어요.') }
  if (kind === 'avatars' && k.video) { reader.cancel().catch(() => {}); return fail(415, '프로필 사진은 이미지만 돼요.') }
  if (length > k.max) {
    reader.cancel().catch(() => {})
    const what = k.video ? '동영상' : k.type === 'image/gif' ? '움짤' : '사진'
    return fail(413, `${what}은 ${mbText(k.max)}까지 올릴 수 있어요.`)
  }

  const key = `${kind}/${crypto.randomUUID()}.${k.ext}`
  const opts = { httpMetadata: { contentType: k.type, cacheControl: CACHE_FOREVER } }
  try {
    await env.MEDIA.put(key, await bodyWithLength(chunks, reader, length), opts)
  } catch (e) {
    // 선언한 길이와 실제 본문이 다르면 FixedLengthStream 이 여기서 터진다
    console.error('[media upload]', e)
    return fail(400, '파일을 끝까지 받지 못했어요. 다시 시도해주세요.')
  }
  return json({ url: publicUrl(env, key), key }, 201)
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.byteLength }
  return out
}

/** 이미 읽은 앞부분 + 남은 본문을 길이가 정해진 스트림 하나로. (Node 테스트엔 FixedLengthStream 이 없어 모아서 넘긴다) */
async function bodyWithLength(head: Uint8Array[], rest: ReadableStreamDefaultReader<Uint8Array>, length: number): Promise<ReadableStream | ArrayBuffer> {
  const FLS = (globalThis as { FixedLengthStream?: new (n: number) => TransformStream }).FixedLengthStream
  if (!FLS) return collect(head, rest)
  const { readable, writable } = new FLS(length)
  const writer = writable.getWriter()
  ;(async () => {
    try {
      for (const c of head) await writer.write(c)
      for (;;) {
        const { done, value } = await rest.read()
        if (done) break
        await writer.write(value)
      }
      await writer.close()
    } catch (e) {
      await writer.abort(e).catch(() => {})
    }
  })()
  return readable
}

/** 테스트용 — 남은 본문까지 모아 ArrayBuffer 로 */
async function collect(head: Uint8Array[], rest: ReadableStreamDefaultReader<Uint8Array>): Promise<ArrayBuffer> {
  const all = [...head]
  let total = head.reduce((s, c) => s + c.byteLength, 0)
  for (;;) {
    const { done, value } = await rest.read()
    if (done) break
    all.push(value); total += value.byteLength
  }
  return concat(all, total).buffer as ArrayBuffer
}

/** 길이가 달라도 시간이 같게 비교 (토큰 추측 방지) */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

async function admin(request: Request, env: Env, action: string): Promise<Response> {
  const token = env.MEDIA_ADMIN_TOKEN
  if (!token) return fail(503, '관리 API 가 설정되지 않았어요 (MEDIA_ADMIN_TOKEN).')
  const auth = request.headers.get('Authorization') || ''
  if (!safeEqual(auth, `Bearer ${token}`)) return fail(401, 'unauthorized')

  if (action === 'list' && request.method === 'GET') {
    const cursor = new URL(request.url).searchParams.get('cursor') || undefined
    const page = await env.MEDIA.list({ cursor, limit: 1000 })
    return json({
      objects: page.objects.map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() })),
      cursor: page.truncated ? page.cursor : null,
    })
  }
  if (action === 'delete' && request.method === 'POST') {
    let keys: unknown
    try { keys = (await request.json() as { keys?: unknown }).keys } catch { return fail(400, 'JSON 본문이 필요해요.') }
    if (!Array.isArray(keys) || keys.length === 0 || keys.length > 1000) return fail(400, 'keys 는 1~1000개 배열이어야 해요.')
    if (!keys.every(k => typeof k === 'string' && KEY_RE.test(k))) return fail(400, '형식이 틀린 key 가 있어요.')
    await env.MEDIA.delete(keys as string[])
    return json({ deleted: keys.length })
  }
  return fail(404, 'unknown admin action')
}
