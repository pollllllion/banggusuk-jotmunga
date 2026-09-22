/**
 * 토론글·댓글 첨부(사진·움짤·동영상) 업로드.
 *
 * 포스터(posterImage.ts)와 달리 base64 data URL 로 만들지 않는다.
 *  · GIF 는 canvas 로 다시 그리면 애니메이션이 죽는다 → 압축 불가
 *  · 앱 시작 시 discussions 전체를 캐시로 긁어오므로 본문/컬럼에 수 MB 짜리
 *    data URL 이 섞이면 첫 로딩이 통째로 무거워진다
 * → 파일은 저장소에 올리고 DB 엔 주소(동영상은 R2 키)만 담는다.
 *
 * 저장소 (2026-09-22~): Cloudflare R2 — 올리기는 worker 의 POST /api/media, 공개 주소는 media.ottcal.com.
 *   Supabase Storage 는 볼 때마다 무료 전송량(월 5GB)이 깎여 큰 움짤을 감당 못 한다. R2 는 전송 요금이 없다.
 *   R2 창구가 없을 때(npm run dev · 배포 전)만 사진·움짤을 예전 Supabase 'talk-media' 버킷으로 올린다.
 *   **동영상은 R2 전용** — Supabase 로 우회하면 전송량 문제가 그대로 돌아온다.
 *
 * 한도는 글·댓글 공통(mediaHost.ts): 사진 원본 50MB(줄여서 올라감) · 움짤 50MB · 동영상 100MB · 4개.
 * 한도보다 먼저 챙긴 건 **올리는 사람이 멈춘 줄 알고 떠나지 않는 것** — 큰 파일은 진행률(onProgress)을 보여 준다.
 */
import { supabase } from '@/lib/supabaseClient'
import { uuid } from '@/utils/helpers'
import {
  IMAGE_MAX_BYTES, GIF_MAX_BYTES, VIDEO_MAX_BYTES, IMAGE_TYPES, VIDEO_TYPES, MB, toMb,
} from '@/utils/mediaHost'

export { MAX_FILES } from '@/utils/mediaHost'

const BUCKET = 'talk-media'
/** 예전 Supabase 버킷의 서버 한도 — R2 창구가 없을 때만 의미가 있다 */
const SUPABASE_MAX_BYTES = 20 * 1024 * 1024

/** 올린 결과 — 사진·움짤은 주소를 <img> 로, 동영상은 R2 키를 <div data-vid> 로 본문에 넣는다 */
export type UploadedMedia = { kind: 'image'; url: string } | { kind: 'video'; key: string; url: string }
/** 진행률 0~1 */
export type OnProgress = (fraction: number) => void

const EXT: Record<string, string> = {
  'image/gif': 'gif', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
}

/** 파일 선택창의 accept — 사진·움짤·동영상 */
export const ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(',')

/** 형식별 한도와 사람 말 이름 */
function limitFor(type: string): { max: number; what: string } | null {
  if (type === 'image/gif') return { max: GIF_MAX_BYTES, what: '움짤' }
  if (IMAGE_TYPES.includes(type)) return { max: IMAGE_MAX_BYTES, what: '사진' }
  if (VIDEO_TYPES.includes(type)) return { max: VIDEO_MAX_BYTES, what: '동영상' }
  return null
}

/** "움짤은 50MB까지 올릴 수 있어요. 지금 파일은 63.2MB예요." — 무엇이 몇 MB 넘었는지 숫자로 */
function tooBig(what: string, max: number, size: number) {
  return new Error(`${what}은 ${Math.round(max / MB)}MB까지 올릴 수 있어요. 지금 파일은 ${toMb(size)}MB예요.`)
}

/** 주소 끝의 확장자로 MIME 추정 (?query 는 떼고 본다). 모르면 null. */
function typeFromUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0].toLowerCase()
  if (path.endsWith('.gif')) return 'image/gif'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  return null
}

/** 문자열이 이미지로 쓸 만한 http(s) 주소인가 — 붙여넣기/드롭이 URL 인지 판별용 */
export function looksLikeImageUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim())
}

/**
 * 클립보드의 text/html 조각에서 원본 이미지 주소 뽑기.
 *
 * 크롬에서 웹 이미지를 "이미지 복사" 하면 클립보드에 정지 PNG 한 장(첫 프레임)과 함께
 * `<img src="원본주소">` HTML 조각이 같이 들어온다. GIF 를 붙여넣었는데 안 움직이는 건
 * 그 PNG 를 쓰기 때문 — 원본 주소를 살려 쓰면 움짤 그대로 가져올 수 있다.
 */
export function imgSrcFromHtml(html: string): string | null {
  const m = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(html)
  const src = m?.[1]
  return src && looksLikeImageUrl(src) ? src : null
}

/** 주소만 보고 움짤일 가능성이 큰가 (확장자 .gif 또는 경로에 gif 가 박힌 CDN 주소) */
export function isProbablyGifUrl(url: string): boolean {
  return typeFromUrl(url) === 'image/gif' || /gif/i.test(url.split(/[?#]/)[0])
}

/** 정지 이미지 축소 기준 — 화면에서 이보다 크게 볼 일이 없다 */
const MAX_DIM = 1600
const WEBP_QUALITY = 0.82

/**
 * 정지 이미지(PNG·JPG·WEBP)는 올리기 전에 줄인다. **GIF 는 손대지 않는다** —
 * canvas 로 다시 그리면 애니메이션이 첫 프레임만 남고 죽는다.
 * webp 로 내보내는 이유: PNG 의 투명 배경을 살리면서 JPEG 만큼 작아진다.
 * 어떤 이유로든 실패하거나 원본보다 커지면 원본을 그대로 쓴다(업로드 자체를 막지 않는다).
 */
async function shrinkIfStatic(file: File): Promise<File> {
  if (file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', WEBP_QUALITY))
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file
    return new File([blob], 'shrunk.webp', { type: 'image/webp' })
  } catch {
    return file
  }
}

/**
 * 사진·움짤·동영상 File → 올린 결과. 실패 시 사용자에게 보여줄 메시지로 throw.
 *
 * 한도는 형식별로 **원본에** 건다. 사진은 그 뒤 webp 로 줄여 올리므로 실제 크기는 훨씬 작다
 * (사진 한도가 50MB 로 넉넉한 건 폰 원본이 막히지 않게 — 수백 MB 를 디코딩하다 탭이 멎는 것만 막는다).
 * 움짤·동영상은 줄이지 않으므로 원본이 곧 결과다.
 */
export async function uploadTalkMedia(input: File, onProgress?: OnProgress): Promise<UploadedMedia> {
  const type = input.type || typeFromName(input.name)
  const limit = type ? limitFor(type) : null
  if (!type || !limit) throw new Error('사진(JPG·PNG·WEBP)·움짤(GIF)·동영상(MP4·MOV·WEBM)만 올릴 수 있어요.')
  if (input.size > limit.max) throw tooBig(limit.what, limit.max, input.size)

  if (VIDEO_TYPES.includes(type)) {
    const file = input.type ? input : new File([input], input.name, { type })
    const r = await storeR2('talk', file, onProgress)
    if (!r) throw new Error('동영상은 지금 올릴 수 없어요. 잠시 후 다시 시도해주세요.')
    return { kind: 'video', key: r.key, url: r.url }
  }

  const file = await shrinkIfStatic(input.type ? input : new File([input], input.name, { type }))
  const path = `talk/${uuid()}.${EXT[file.type]}`
  return { kind: 'image', url: await storeMedia('talk', path, file, onProgress) }
}

/** 확장자로 형식 추정 — 일부 브라우저가 .mov 등의 type 을 비워서 준다 */
function typeFromName(name: string): string | null {
  const n = name.toLowerCase()
  if (n.endsWith('.mp4') || n.endsWith('.m4v')) return 'video/mp4'
  if (n.endsWith('.mov')) return 'video/quicktime'
  if (n.endsWith('.webm')) return 'video/webm'
  return typeFromUrl(n)
}

/**
 * 다른 사이트의 이미지 주소 → 우리 버킷으로 다시 올린 URL.
 *
 * 가능하면 받아서 재업로드한다(원본이 지워지거나 핫링크가 막혀도 짤이 살아 있게).
 * 남의 서버가 CORS 를 안 열어두면 브라우저에서 받아올 방법이 없으므로,
 * 그때는 그 주소를 그대로 쓴다 — 원본이 사라지면 같이 깨진다.
 */
export async function uploadTalkMediaFromUrl(url: string, onProgress?: OnProgress): Promise<UploadedMedia> {
  const clean = url.trim()
  if (!looksLikeImageUrl(clean)) throw new Error('http(s):// 로 시작하는 이미지 주소를 넣어주세요.')

  let blob: Blob | null = null
  try {
    const res = await fetch(clean)
    if (res.ok) blob = await res.blob()
  } catch { /* CORS·네트워크 차단 → 아래 핫링크로 */ }

  if (!blob) {
    // 받아오지 못했다 — 주소만이라도 그림 파일처럼 생겼는지 확인하고 그대로 쓴다
    if (!typeFromUrl(clean)) throw new Error('이 주소는 가져올 수 없어요. GIF·PNG·JPG·WEBP 로 끝나는 이미지 주소인지 확인해주세요.')
    return { kind: 'image', url: clean }
  }

  const type = IMAGE_TYPES.includes(blob.type) ? blob.type : typeFromUrl(clean)
  if (!type) throw new Error('GIF·PNG·JPG·WEBP 이미지 주소만 받을 수 있어요.')
  return uploadTalkMedia(new File([blob], `remote.${EXT[type]}`, { type }), onProgress)
}

/**
 * 프로필 사진 업로드 → 공개 URL.
 *
 * 같은 버킷(talk-media)의 `avatars/` 아래를 쓴다 — 버킷을 하나 더 만들면 정책을
 * 한 벌 더 관리해야 하는데, 읽기 공개·쓰기 로그인이라는 조건이 똑같다.
 * 첨부(uploadTalkMedia)와 달리 **정사각형으로 잘라 작게 줄인다** — 원본을 그대로 두면
 * 34px 짜리 동그라미 하나 그리자고 몇 MB 를 받는다.
 */
const AVATAR_PX = 256

export async function uploadAvatar(input: File, opts?: { alreadySquare?: boolean }): Promise<string> {
  if (!input.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있어요.')
  if (input.size > IMAGE_MAX_BYTES) throw tooBig('사진', IMAGE_MAX_BYTES, input.size)

  // 자르기 창을 거쳐 온 그림은 이미 256px 정사각 webp 다 — 또 구우면 화질만 깎인다
  const file = opts?.alreadySquare ? input : await squareShrink(input)
  const path = `avatars/${uuid()}.webp`
  return storeMedia('avatars', path, file)
}

/** 가운데를 정사각형으로 잘라 AVATAR_PX 로 줄인 webp. 실패하면 원본 그대로 올린다. */
async function squareShrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - side) / 2
    const sy = (bitmap.height - side) / 2
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_PX; canvas.height = AVATAR_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return file }
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX)
    bitmap.close()
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', 0.85))
    if (!blob) return file
    return new File([blob], 'avatar.webp', { type: 'image/webp' })
  } catch {
    return file   // GIF 애니메이션 등 — 원본을 그대로 올린다
  }
}

/**
 * 사진·움짤 저장 → 공개 URL. **R2 가 먼저, 창구가 없으면 Supabase.**
 * path 는 Supabase 로 갈 때만 쓴다 (R2 는 서버가 키를 정한다).
 */
async function storeMedia(kind: 'talk' | 'avatars', path: string, file: File, onProgress?: OnProgress): Promise<string> {
  const r = await storeR2(kind, file, onProgress)
  if (r) return r.url

  if (file.size > SUPABASE_MAX_BYTES) throw new Error('지금은 20MB 넘는 파일을 올릴 수 없어요. 잠시 후 다시 시도해주세요.')
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
  })
  if (error) {
    console.error(`[${kind} upload]`, error)
    throw new Error('업로드에 실패했어요. 잠시 후 다시 시도해주세요.')
  }
  onProgress?.(1)
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * R2 창구(worker 의 POST /api/media)로 올린다. 창구가 없으면(vite 개발 서버·배포 전) null.
 *
 * 창구가 "크기 초과·형식 불가" 처럼 **판정을 내린** 거절(4xx + JSON)은 그대로 throw 한다 —
 * 거기서 Supabase 로 우회하면 서버 쪽 관문이 무의미해진다.
 * fetch 가 아니라 XHR 인 이유: fetch 는 올리는 진행률을 알려 주지 않는다.
 */
function storeR2(kind: 'talk' | 'avatars', file: File, onProgress?: OnProgress): Promise<{ url: string; key: string } | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/media?kind=${kind}`)
    xhr.setRequestHeader('Content-Type', file.type)
    if (onProgress) xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total) }
    xhr.onerror = () => resolve(null)         // 네트워크 문제 — 부르는 쪽이 판단
    xhr.onload = () => {
      const isJson = (xhr.getResponseHeader('Content-Type') || '').includes('application/json')
      if (!isJson) { resolve(null); return }   // 창구 없음 (SPA 의 index.html 이 돌아온다)
      let data: { url?: string; key?: string; error?: string } = {}
      try { data = JSON.parse(xhr.responseText) } catch { resolve(null); return }
      if (xhr.status >= 200 && xhr.status < 300 && data.url && data.key) {
        onProgress?.(1)
        resolve({ url: data.url, key: data.key })
        return
      }
      if (xhr.status >= 400 && xhr.status < 500 && xhr.status !== 404 && xhr.status !== 405) {
        reject(new Error(data.error || '업로드에 실패했어요.'))
        return
      }
      resolve(null)
    }
    xhr.send(file)
  })
}
