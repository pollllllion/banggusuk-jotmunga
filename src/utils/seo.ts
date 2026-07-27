/**
 * SEO 공통 상수·헬퍼
 *
 * 사이트 주소가 바뀌면 SITE_URL 한 곳만 고치면 됩니다.
 * (canonical / og:url / sitemap 이 전부 이 값을 씁니다)
 */

export const SITE_URL = 'https://ottcal.com'
export const SITE_NAME = '방구석좋문가'
export const SITE_TAGLINE = 'OTT 공개일·개봉일 캘린더'

export const DEFAULT_TITLE = `${SITE_NAME} - ${SITE_TAGLINE}`
export const DEFAULT_DESCRIPTION =
  '넷플릭스·디즈니+·티빙·웨이브 등 OTT 공개일과 영화 개봉일을 달력 하나로. ' +
  '공개 예정 작품의 D-day와 편성 정보, 기대평과 솔직 리뷰까지 한눈에 확인하세요.'
export const DEFAULT_OG_IMAGE = `${SITE_URL}/logo.png`

/** 상대경로 → 절대 URL (og:image·canonical 은 절대경로여야 함) */
export function absUrl(path: string | null | undefined): string {
  if (!path) return DEFAULT_OG_IMAGE
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

/** meta description 길이 제한 (구글 표시 한계 ~155자, 넘으면 '...' 처리) */
export function clampText(text: string | null | undefined, max = 155): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + '…'
}

/** '작품명' → '작품명 | 방구석좋문가' (홈은 사이트명만) */
export function buildTitle(pageTitle?: string | null): string {
  const t = (pageTitle || '').trim()
  if (!t) return DEFAULT_TITLE
  return `${t} | ${SITE_NAME}`
}
