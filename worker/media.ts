/**
 * 짤 저장소(R2) 처리 — 업로드 · 서빙 · 청소용 관리 API.
 * 설명과 보안 원칙은 worker/index.ts 머리말 참고. 이 파일은 순수 로직이라 vitest 로 돌린다.
 */

// ── 필요한 만큼만 선언한 Workers 타입 (@cloudflare/workers-types 를 들이지 않으려고) ──
export interface R2ObjectLike {
  key: string
  size: number
  uploaded: Date
  httpEtag: string
  httpMetadata?: { contentType?: string }
}
export interface R2ObjectBodyLike extends R2ObjectLike {
  body: ReadableStream | null
}
export interface R2BucketLike {
  get(key: string): Promise<R2ObjectBodyLike | null>
  put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>
  delete(keys: string | string[]): Promise<void>
  list(opts?: { cursor?: string; limit?: number }): Promise<{ objects: R2ObjectLike[]; truncated: boolean; cursor?: string }>
}
export interface Env {
  MEDIA: R2BucketLike
  ASSETS: { fetch(req: Request): Promise<Response> }
  /** 고아 청소 스크립트용 비밀값 — `wrangler secret put MEDIA_ADMIN_TOKEN`. 없으면 관리 API 는 꺼진다 */
  MEDIA_ADMIN_TOKEN?: string
}
type Ctx = { waitUntil(p: Promise<unknown>): void }

/** 업로드 한도 — 앱의 talkMedia.ts MAX_BYTES 와 같은 값. 여기가 서버 쪽 최종 관문이다 */
export const MAX_BYTES = 20 * 1024 * 1024

const KINDS = ['talk', 'avatars'] as const
const EXT: Record<string, string> = { 'image/gif': 'gif', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const TYPE_BY_EXT: Record<string, string> = { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
/** R2 키 모양 — 이 밖의 키는 서빙·삭제 모두 거절한다 (경로 조작 방지) */
const KEY_RE = /^(talk|avatars)\/[A-Za-z0-9-]{8,64}\.(gif|png|jpg|webp)$/

const CACHE_FOREVER = 'public, max-age=31536000, immutable'

/** 파일 첫 바이트로 형식 판정. 클라이언트가 붙인 Content-Type 은 믿지 않는다 */
export function sniffImageType(buf: ArrayBuffer): string | null {
  const b = new Uint8Array(buf, 0, Math.min(buf.byteLength, 12))
  const at = (i: number, bytes: number[]) => bytes.every((v, k) => b[i + k] === v)
  if (at(0, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'                      // GIF8
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp' // RIFF....WEBP
  return null
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

/** 저장된 짤의 공개 주소. 본 도메인이면 www 없이 통일한다 (canonical 과 같은 쪽) */
export function publicUrl(requestUrl: string, key: string): string {
  const u = new URL(requestUrl)
  const base = u.hostname.endsWith('ottcal.com') ? 'https://ottcal.com' : u.origin
  return `${base}/media/${key}`
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
const fail = (status: number, message: string) => json({ error: message }, status)

/** 이 요청이 짤 관련이면 응답을, 아니면 null (정적 자산으로 넘긴다) */
export async function handleMedia(request: Request, env: Env, ctx?: Ctx): Promise<Response | null> {
  const url = new URL(request.url)
  const path = url.pathname

  if (path === '/api/media') {
    if (request.method !== 'POST') return fail(405, 'POST 만 됩니다.')
    return upload(request, env, url)
  }
  if (path.startsWith('/media/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'GET 만 됩니다.')
    let key: string
    try { key = decodeURIComponent(path.slice('/media/'.length)) } catch { return new Response('Not found', { status: 404 }) }
    return serve(request, env, key, ctx)
  }
  if (path.startsWith('/api/media-admin/')) return admin(request, env, path.slice('/api/media-admin/'.length))
  return null
}

async function upload(request: Request, env: Env, url: URL): Promise<Response> {
  if (!isAllowedOrigin(request.headers.get('Origin'))) return fail(403, '허용되지 않은 출처예요.')

  const kind = url.searchParams.get('kind') || 'talk'
  if (!(KINDS as readonly string[]).includes(kind)) return fail(400, '알 수 없는 업로드 종류예요.')

  // 본문을 다 받기 전에 선언된 길이로 먼저 거른다 (없거나 거짓이면 아래에서 실제 크기로 다시 본다)
  const declared = Number(request.headers.get('Content-Length') || 0)
  if (declared > MAX_BYTES) return fail(413, `파일이 너무 커요. ${MAX_BYTES / 1024 / 1024}MB 이하로 올려주세요.`)

  const buf = await request.arrayBuffer()
  if (buf.byteLength === 0) return fail(400, '빈 파일이에요.')
  if (buf.byteLength > MAX_BYTES) return fail(413, `파일이 너무 커요. ${MAX_BYTES / 1024 / 1024}MB 이하로 올려주세요.`)

  const type = sniffImageType(buf)
  if (!type) return fail(415, 'GIF·PNG·JPG·WEBP 만 올릴 수 있어요.')

  const key = `${kind}/${crypto.randomUUID()}.${EXT[type]}`
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type, cacheControl: CACHE_FOREVER } })
  return json({ url: publicUrl(request.url, key), key }, 201)
}

async function serve(request: Request, env: Env, key: string, ctx?: Ctx): Promise<Response> {
  if (!KEY_RE.test(key)) return new Response('Not found', { status: 404 })

  // 데이터센터 캐시 — R2 읽기 횟수를 아끼고 더 빨리 준다. (Node 테스트 환경엔 caches 가 없다)
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : null
  const cacheKey = new Request(new URL(request.url).origin + '/media/' + key)
  if (cache && request.method === 'GET') {
    const hit = await cache.match(cacheKey)
    if (hit) return notModified(request, hit) ?? hit
  }

  const obj = await env.MEDIA.get(key)
  if (!obj) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

  const ext = key.slice(key.lastIndexOf('.') + 1)
  const headers = new Headers({
    // 저장 때 시그니처로 정한 형식. 혹시 비어 있으면 확장자(역시 서버가 정한 것)로
    'Content-Type': obj.httpMetadata?.contentType || TYPE_BY_EXT[ext] || 'application/octet-stream',
    'Content-Length': String(obj.size),
    'Cache-Control': CACHE_FOREVER,
    ETag: obj.httpEtag,
    'X-Content-Type-Options': 'nosniff',
    // 혹시라도 문서로 열리면 스크립트·폼 전부 막힌 샌드박스로
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    // 글쓰기 창에서 "주소로 짤 가져오기" 가 우리 짤을 fetch 할 수 있게
    'Access-Control-Allow-Origin': '*',
  })
  const res = new Response(request.method === 'HEAD' ? null : obj.body, { status: 200, headers })
  if (cache && request.method === 'GET') ctx?.waitUntil(cache.put(cacheKey, res.clone()))
  return notModified(request, res) ?? res
}

function notModified(request: Request, res: Response): Response | null {
  const inm = request.headers.get('If-None-Match')
  const etag = res.headers.get('ETag')
  if (inm && etag && inm === etag) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': CACHE_FOREVER } })
  return null
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
