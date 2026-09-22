import { describe, it, expect } from 'vitest'
import {
  handleMedia, sniff, sniffImageType, isAllowedOrigin, publicUrl,
  IMAGE_MAX_BYTES, GIF_MAX_BYTES, VIDEO_MAX_BYTES, type Env, type R2BucketLike,
} from '../media'

/** 메모리 속 가짜 R2 */
function fakeBucket() {
  const store = new Map<string, { buf: ArrayBuffer; type?: string; uploaded: Date }>()
  const bucket: R2BucketLike = {
    async put(key, value, opts) {
      if (!(value instanceof ArrayBuffer)) throw new Error('테스트에서는 ArrayBuffer 로 와야 한다')
      store.set(key, { buf: value, type: opts?.httpMetadata?.contentType, uploaded: new Date() })
    },
    async delete(keys) { for (const k of [keys].flat()) store.delete(k) },
    async list() {
      return { objects: [...store].map(([key, o]) => ({ key, size: o.buf.byteLength, uploaded: o.uploaded })), truncated: false }
    },
  }
  return { bucket, store }
}
const env = (bucket: R2BucketLike, token?: string): Env => ({
  MEDIA: bucket, MEDIA_ADMIN_TOKEN: token, MEDIA_PUBLIC_BASE: 'https://media.ottcal.com',
  ASSETS: { fetch: async () => new Response('asset') },
})

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap(p => typeof p === 'string' ? [...p].map(c => c.charCodeAt(0)) : p))
const GIF = bytes('GIF89a', [1, 0, 1, 0, 0, 0, 0, 0, 0, 0])
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 0, 0, 0, 0, 0])
const JPG = bytes([0xff, 0xd8, 0xff, 0xe0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const WEBP = bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ', [0, 0, 0, 0])
const MP4 = bytes([0, 0, 0, 0x20], 'ftypisom', [0, 0, 2, 0])
const MOV = bytes([0, 0, 0, 0x14], 'ftypqt  ', [0, 0, 0, 0])
const WEBM = bytes([0x1a, 0x45, 0xdf, 0xa3], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const HTML = bytes('<html><script>alert(1)</script>')

/** 본문이 여러 조각으로 나뉘어 와도(실제 네트워크처럼) 처리되는지 보려고 스트림으로 만든다 */
const streamOf = (data: Uint8Array, chunk = 5) => new ReadableStream<Uint8Array>({
  start(c) { for (let i = 0; i < data.length; i += chunk) c.enqueue(data.slice(i, i + chunk)); c.close() },
})

const post = (data: Uint8Array, opts: { origin?: string; kind?: string; length?: number | null } = {}) => {
  const headers: Record<string, string> = { Origin: opts.origin ?? 'https://ottcal.com' }
  if (opts.length !== null) headers['Content-Length'] = String(opts.length ?? data.byteLength)
  return new Request(`https://ottcal.com/api/media?kind=${opts.kind ?? 'talk'}`, {
    method: 'POST', body: streamOf(data), headers, duplex: 'half',
  } as RequestInit)
}

describe('sniff', () => {
  it('파일 첫 바이트로 형식을 가린다 (사진·움짤·동영상)', () => {
    expect(sniff(GIF)?.type).toBe('image/gif')
    expect(sniff(PNG)?.type).toBe('image/png')
    expect(sniff(JPG)?.type).toBe('image/jpeg')
    expect(sniff(WEBP)?.type).toBe('image/webp')
    expect(sniff(MP4)?.type).toBe('video/mp4')
    expect(sniff(MOV)?.type).toBe('video/quicktime')
    expect(sniff(WEBM)?.type).toBe('video/webm')
    expect(sniff(HTML)).toBeNull()
    expect(sniff(new Uint8Array(0))).toBeNull()
  })
  it('형식별 한도 — 사진·움짤 50MB, 동영상 100MB', () => {
    expect(sniff(PNG)?.max).toBe(IMAGE_MAX_BYTES)
    expect(sniff(GIF)?.max).toBe(GIF_MAX_BYTES)
    expect(sniff(MP4)?.max).toBe(VIDEO_MAX_BYTES)
    expect(IMAGE_MAX_BYTES).toBe(50_000_000)
    expect(VIDEO_MAX_BYTES).toBe(100_000_000)
  })
  it('sniffImageType 은 사진만', () => {
    expect(sniffImageType(GIF.buffer as ArrayBuffer)).toBe('image/gif')
    expect(sniffImageType(MP4.buffer as ArrayBuffer)).toBeNull()
  })
})

describe('isAllowedOrigin', () => {
  it('우리 사이트·검증 주소·로컬만 받는다', () => {
    expect(isAllowedOrigin('https://ottcal.com')).toBe(true)
    expect(isAllowedOrigin('https://www.ottcal.com')).toBe(true)
    expect(isAllowedOrigin('https://ottcal.someone.workers.dev')).toBe(true)
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true)
    expect(isAllowedOrigin('https://evil.com')).toBe(false)
    expect(isAllowedOrigin('https://ottcal.com.evil.com')).toBe(false)
    expect(isAllowedOrigin('http://ottcal.com')).toBe(false)
    expect(isAllowedOrigin(null)).toBe(false)
  })
})

describe('publicUrl', () => {
  it('R2 커스텀 도메인 뒤에 키를 붙인다', () => {
    expect(publicUrl({ MEDIA_PUBLIC_BASE: 'https://media.ottcal.com/' }, 'talk/a.gif')).toBe('https://media.ottcal.com/talk/a.gif')
    expect(publicUrl({}, 'talk/a.gif')).toBe('https://media.ottcal.com/talk/a.gif')
  })
})

describe('올리기', () => {
  it('GIF 를 올리면 R2 에 저장하고 media.ottcal.com 주소를 준다 (조각난 본문도 온전히)', async () => {
    const { bucket, store } = fakeBucket()
    const res = (await handleMedia(post(GIF), env(bucket)))!
    expect(res.status).toBe(201)
    const { url, key } = await res.json() as { url: string; key: string }
    expect(key).toMatch(/^talk\/[0-9a-f-]{36}\.gif$/)
    expect(url).toBe(`https://media.ottcal.com/${key}`)
    expect(store.get(key)?.type).toBe('image/gif')
    expect(new Uint8Array(store.get(key)!.buf)).toEqual(GIF)
  })

  it('동영상(MP4·MOV·WEBM)도 받는다', async () => {
    const { bucket, store } = fakeBucket()
    for (const [data, ext, type] of [[MP4, 'mp4', 'video/mp4'], [MOV, 'mov', 'video/quicktime'], [WEBM, 'webm', 'video/webm']] as const) {
      const { key } = await (await handleMedia(post(data), env(bucket)))!.json() as { key: string }
      expect(key.endsWith(`.${ext}`)).toBe(true)
      expect(store.get(key)?.type).toBe(type)
    }
  })

  it('HTML 같은 비이미지는 415 로 거절한다 (우리 도메인에서 스크립트가 돌면 안 된다)', async () => {
    const { bucket, store } = fakeBucket()
    expect((await handleMedia(post(HTML), env(bucket)))!.status).toBe(415)
    expect(store.size).toBe(0)
  })

  it('프로필 사진 자리에 동영상은 안 된다', async () => {
    const { bucket } = fakeBucket()
    expect((await handleMedia(post(MP4, { kind: 'avatars' }), env(bucket)))!.status).toBe(415)
  })

  it('남의 사이트에서 올리면 403', async () => {
    const { bucket } = fakeBucket()
    expect((await handleMedia(post(GIF, { origin: 'https://evil.com' }), env(bucket)))!.status).toBe(403)
  })

  it('형식별 크기 한도 — 움짤 50MB 초과·동영상 100MB 초과는 413 (본문을 다 받기 전에)', async () => {
    const { bucket, store } = fakeBucket()
    const gif = (await handleMedia(post(GIF, { length: GIF_MAX_BYTES + 1 }), env(bucket)))!
    expect(gif.status).toBe(413)
    expect((await gif.json() as { error: string }).error).toContain('움짤은 50MB')
    expect((await handleMedia(post(MP4, { length: VIDEO_MAX_BYTES + 1 }), env(bucket)))!.status).toBe(413)
    expect(store.size).toBe(0)
  })

  it('60MB 사진은 막힌다 (동영상이면 들어갈 크기 — 한도는 형식을 본 뒤에 정한다)', async () => {
    const { bucket } = fakeBucket()
    // 선언 길이만 60MB — 본문은 짧아서 저장 단계(길이 불일치)까지 가지 않고 판정만 본다
    const png = (await handleMedia(post(PNG, { length: 60_000_000 }), env(bucket)))!
    expect(png.status).toBe(413)
  })

  it('Content-Length 가 없으면 411, 알 수 없는 kind 는 400, GET 은 405', async () => {
    const { bucket } = fakeBucket()
    expect((await handleMedia(post(GIF, { length: null }), env(bucket)))!.status).toBe(411)
    expect((await handleMedia(post(GIF, { kind: '../etc' }), env(bucket)))!.status).toBe(400)
    expect((await handleMedia(new Request('https://ottcal.com/api/media'), env(bucket)))!.status).toBe(405)
  })

  it('첨부와 무관한 경로는 null (정적 자산으로 넘긴다)', async () => {
    const { bucket } = fakeBucket()
    expect(await handleMedia(new Request('https://ottcal.com/content/abc'), env(bucket))).toBeNull()
    expect(await handleMedia(new Request('https://ottcal.com/media/talk/x.gif'), env(bucket))).toBeNull()
  })
})

describe('관리 API', () => {
  const auth = { Authorization: 'Bearer s3cret' }

  it('토큰이 설정 안 됐으면 꺼져 있다', async () => {
    const { bucket } = fakeBucket()
    const res = (await handleMedia(new Request('https://ottcal.com/api/media-admin/list', { headers: auth }), env(bucket)))!
    expect(res.status).toBe(503)
  })

  it('틀린 토큰은 401', async () => {
    const { bucket } = fakeBucket()
    const res = (await handleMedia(new Request('https://ottcal.com/api/media-admin/list', { headers: { Authorization: 'Bearer nope' } }), env(bucket, 's3cret')))!
    expect(res.status).toBe(401)
  })

  it('목록을 보고 지울 수 있다 (동영상 키 포함)', async () => {
    const { bucket, store } = fakeBucket()
    const e = env(bucket, 's3cret')
    const { key } = await (await handleMedia(post(MP4), e))!.json() as { key: string }

    const list = await (await handleMedia(new Request('https://ottcal.com/api/media-admin/list', { headers: auth }), e))!.json() as { objects: { key: string }[]; cursor: null }
    expect(list.objects.map(o => o.key)).toEqual([key])
    expect(list.cursor).toBeNull()

    const del = (await handleMedia(new Request('https://ottcal.com/api/media-admin/delete', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: [key] }),
    }), e))!
    expect(del.status).toBe(200)
    expect(store.size).toBe(0)
  })

  it('키 모양이 틀리면 하나도 지우지 않는다', async () => {
    const { bucket, store } = fakeBucket()
    const e = env(bucket, 's3cret')
    await handleMedia(post(GIF), e)
    const del = (await handleMedia(new Request('https://ottcal.com/api/media-admin/delete', {
      method: 'POST', headers: auth, body: JSON.stringify({ keys: ['../../x'] }),
    }), e))!
    expect(del.status).toBe(400)
    expect(store.size).toBe(1)
  })
})
