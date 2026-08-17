/**
 * 토론글 첨부(움짤·이미지) 업로드.
 *
 * 포스터(posterImage.ts)와 달리 base64 data URL 로 만들지 않는다.
 *  · GIF 는 canvas 로 다시 그리면 애니메이션이 죽는다 → 압축 불가
 *  · 앱 시작 시 discussions 전체를 캐시로 긁어오므로 본문/컬럼에 수 MB 짜리
 *    data URL 이 섞이면 첫 로딩이 통째로 무거워진다
 * → 파일은 Supabase Storage('talk-media') 에 올리고 DB 엔 공개 URL 만 담는다.
 */
import { supabase } from '@/lib/supabaseClient'
import { uuid } from '@/utils/helpers'

const BUCKET = 'talk-media'
export const MAX_FILES = 4
export const MAX_BYTES = 20 * 1024 * 1024 // 20MB — 버킷 file_size_limit 과 같은 값 (움짤은 압축이 안 돼 원본 그대로 올라간다)
export const MAX_MB = Math.round(MAX_BYTES / 1024 / 1024)

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
const ALLOWED = ['image/gif', 'image/png', 'image/jpeg', 'image/webp']

const EXT: Record<string, string> = {
  'image/gif': 'gif', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
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

/** 이미지/움짤 File → 업로드 후 공개 URL. 실패 시 사용자에게 보여줄 메시지로 throw. */
export async function uploadTalkMedia(input: File): Promise<string> {
  if (!ALLOWED.includes(input.type)) throw new Error('GIF·PNG·JPG·WEBP 만 올릴 수 있어요.')
  if (input.size > MAX_BYTES) throw new Error(`파일이 너무 커요 (${mb(input.size)}MB). ${MAX_MB}MB 이하로 올려주세요.`)

  const file = await shrinkIfStatic(input)
  const path = `talk/${uuid()}.${EXT[file.type]}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
  })
  if (error) {
    console.error('[talk-media upload]', error)
    throw new Error('업로드에 실패했어요. 잠시 후 다시 시도해주세요.')
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * 다른 사이트의 이미지 주소 → 우리 버킷으로 다시 올린 URL.
 *
 * 가능하면 받아서 재업로드한다(원본이 지워지거나 핫링크가 막혀도 짤이 살아 있게).
 * 남의 서버가 CORS 를 안 열어두면 브라우저에서 받아올 방법이 없으므로,
 * 그때는 그 주소를 그대로 쓴다 — 원본이 사라지면 같이 깨진다.
 */
export async function uploadTalkMediaFromUrl(url: string): Promise<string> {
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
    return clean
  }

  const type = ALLOWED.includes(blob.type) ? blob.type : typeFromUrl(clean)
  if (!type) throw new Error('GIF·PNG·JPG·WEBP 이미지 주소만 받을 수 있어요.')
  if (blob.size > MAX_BYTES) throw new Error(`파일이 너무 커요 (${mb(blob.size)}MB). ${MAX_MB}MB 이하만 됩니다.`)
  return uploadTalkMedia(new File([blob], `remote.${EXT[type]}`, { type }))
}
