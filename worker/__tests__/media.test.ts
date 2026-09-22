import { describe, it, expect } from 'vitest'
import { handleMedia, sniffImageType, isAllowedOrigin, publicUrl, MAX_BYTES, type Env, type R2BucketLike } from '../media'

/** 메모리 속 가짜 R2 */
function fakeBucket() {
  const store = new Map<string, { buf: ArrayBuffer; type?: string; uploaded: Date }>()
  const bucket: R2BucketLike = {
    async get(key) {
      const o = store.get(key)
      if (!o) return null
      return { key, size: o.buf.byteLength, uploaded: o.uploaded, httpEtag: `"${key}"`, httpMetadata: { contentType: o.type }, body: new Response(o.buf).body }
    },
    async put(key, value, opts) { store.set(key, { buf: value, type: opts?.httpMetadata?.contentType, uploaded: new Date() }) },
    async delete(keys) { for (const k of [keys].flat()) store.delete(k) },
    async list() {
      return { objects: [...store].map(([key, o]) => ({ key, size: o.buf.byteLength, uploaded: o.uploaded, httpEtag: '' })), truncated: false }
    },
  }
  return { bucket, store }
}
const env = (bucket: R2BucketLike, token?: string): Env => ({
  MEDIA: bucket, MEDIA_ADMIN_TOKEN: token, ASSETS: { fetch: async () => new Response('asset') },
})

const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0]).buffer
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).buffer
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer
const WEBP = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ').buffer
const HTML = new TextEncoder().encode('<html><script>alert(1)</script>').buffer

const post = (body: ArrayBuffer, origin = 'https://ottcal.com', kind = 'talk', type = 'image/gif') =>
  new Request(`https://ottcal.com/api/media?kind=${kind}`, { method: 'POST', body, headers: { Origin: origin, 'Content-Type': type } })

describe('sniffImageType', () => {
  it('파일 첫 바이트로 형식을 가린다', () => {
    expect(sniffImageType(GIF)).toBe('image/gif')
    expect(sniffImageType(PNG)).toBe('image/png')
    expect(sniffImageType(JPG)).toBe('image/jpeg')
    expect(sniffImageType(WEBP)).toBe('image/webp')
    expect(sniffImageType(HTML)).toBeNull()
    expect(sniffImageType(new ArrayBuffer(0))).toBeNull()
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
  it('본 도메인은 www 없이, 검증 주소는 그 주소 그대로', () => {
    expect(publicUrl('https://www.ottcal.com/api/media', 'talk/a.gif')).toBe('https://ottcal.com/media/talk/a.gif')
    expect(publicUrl('https://ottcal.x.workers.dev/api/media', 'talk/a.gif')).toBe('https://ottcal.x.workers.dev/media/talk/a.gif')
  })
})

describe('업로드 → 서빙', () => {
  it('GIF 를 올리면 R2 에 저장하고 /media 주소로 다시 받을 수 있다', async () => {
    const { bucket, store } = fakeBucket()
    const res = (await handleMedia(post(GIF), env(bucket)))!
    expect(res.status).toBe(201)
    const { url, key } = await res.json() as { url: string; key: string }
    expect(key).toMatch(/^talk\/[0-9a-f-]{36}\.gif$/)
    expect(url).toBe(`https://ottcal.com/media/${key}`)
    expect(store.get(key)?.type).toBe('image/gif')

    const got = (await handleMedia(new Request(url), env(bucket)))!
    expect(got.status).toBe(200)
    expect(got.headers.get('Content-Type')).toBe('image/gif')
    expect(got.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(got.headers.get('Cache-Control')).toContain('immutable')
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(new Uint8Array(GIF))
  })

  it('클라이언트가 붙인 Content-Type 이 아니라 실제 내용으로 형식을 정한다', async () => {
    const { bucket } = fakeBucket()
    const res = (await handleMedia(post(PNG, undefined, 'talk', 'image/gif'), env(bucket)))!
    const { key } = await res.json() as { key: string }
    expect(key.endsWith('.png')).toBe(true)
  })

  it('HTML 같은 비이미지는 415 로 거절한다 (우리 도메인에서 스크립트가 돌면 안 된다)', async () => {
    const { bucket, store } = fakeBucket()
    const res = (await handleMedia(post(HTML, undefined, 'talk', 'image/gif'), env(bucket)))!
    expect(res.status).toBe(415)
    expect(store.size).toBe(0)
  })

  it('남의 사이트에서 올리면 403', async () => {
    const { bucket } = fakeBucket()
    expect((await handleMedia(post(GIF, 'https://evil.com'), env(bucket)))!.status).toBe(403)
  })

  it('20MB 를 넘으면 413', async () => {
    const { bucket } = fakeBucket()
    const big = new Uint8Array(MAX_BYTES + 1)
    big.set(new Uint8Array(GIF))
    expect((await handleMedia(post(big.buffer), env(bucket)))!.status).toBe(413)
  })

  it('알 수 없는 kind 는 400, GET 업로드는 405', async () => {
    const { bucket } = fakeBucket()
    expect((await handleMedia(post(GIF, undefined, '../etc'), env(bucket)))!.status).toBe(400)
    expect((await handleMedia(new Request('https://ottcal.com/api/media'), env(bucket)))!.status).toBe(405)
  })

  it('키 모양이 틀린 경로는 R2 를 뒤지지 않고 404', async () => {
    const { bucket } = fakeBucket()
    // '/media/../x' 는 URL 이 알아서 '/x' 로 접는다 — 인코딩된 '..%2F' 가 실제 우회 시도 모양이다
    expect((await handleMedia(new Request('https://ottcal.com/media/..%2Fsecret'), env(bucket)))!.status).toBe(404)
    expect((await handleMedia(new Request('https://ottcal.com/media/talk/x.html'), env(bucket)))!.status).toBe(404)
    expect((await handleMedia(new Request('https://ottcal.com/media/talk/%E0.gif'), env(bucket)))!.status).toBe(404)
  })

  it('짤과 무관한 경로는 null (정적 자산으로 넘긴다)', async () => {
    const { bucket } = fakeBucket()
    expect(await handleMedia(new Request('https://ottcal.com/content/abc'), env(bucket))).toBeNull()
    expect(await handleMedia(new Request('https://ottcal.com/mediafoo'), env(bucket))).toBeNull()
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

  it('목록을 보고 지울 수 있다', async () => {
    const { bucket, store } = fakeBucket()
    const e = env(bucket, 's3cret')
    const { key } = await (await handleMedia(post(GIF), e))!.json() as { key: string }

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
