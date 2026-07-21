/**
 * OTT / 캘린더 공용 헬퍼 (클라이언트).
 * TMDB 요청은 서버(sync 스크립트)에서만 하고, 여기서는 이미 저장된 데이터의 표시/가공만 담당.
 */
import type { Content, ContentProvider, ReleaseDateSource } from '@/types'

export const IMG_LOGO = 'https://image.tmdb.org/t/p/w92'

/** TMDB 로고 경로 → 표시용 URL */
export function providerLogoUrl(logoPath: string | null | undefined): string | null {
  return logoPath ? IMG_LOGO + logoPath : null
}

/** 캘린더에 쓸 최종 공개일: 수동 고정이면 manualReleaseDate 우선 */
export function effectiveReleaseDate(c: Content): string | null {
  if (c.manualOverride && c.manualReleaseDate) return c.manualReleaseDate
  return c.releaseDate
}

/** 공개 예정 여부(오늘보다 미래) */
export function isUpcoming(c: Content, todayKey: string): boolean {
  const d = effectiveReleaseDate(c)
  return !!d && d > todayKey
}

/** 이 작품의 OTT 목록(안전 접근) */
export function providersOf(c: Content): ContentProvider[] {
  return Array.isArray(c.providers) ? c.providers : []
}

/** 캘린더 OTT 필터 칩 (자동 수집 대상 OTT) */
export const OTT_FILTERS: { name: string; label: string }[] = [
  { name: 'Netflix', label: '넷플릭스' },
  { name: 'Disney Plus', label: '디즈니+' },
  { name: 'TVING', label: '티빙' },
  { name: 'Wavve', label: '웨이브' },
  { name: 'Coupang Play', label: '쿠팡플레이' },
  { name: 'Watcha', label: '왓챠' },
  { name: 'Apple TV Plus', label: '애플TV+' },
  { name: 'Amazon Prime Video', label: '프라임비디오' },
  { name: 'U+ Mobile TV', label: 'U+모바일tv' },
]

function normName(s: string): string {
  return String(s ?? '').toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '')
}

/** 작품이 특정 OTT(이름)에서 제공되는가 */
export function hasProvider(c: Content, providerName: string): boolean {
  const target = normName(providerName)
  return providersOf(c).some(p => normName(p.providerName) === target)
}

/** releaseDateSource 한글 라벨 (신뢰도 표시) */
export function releaseSourceLabel(src: ReleaseDateSource | null | undefined): string | null {
  switch (src) {
    case 'kr_digital': return '국내 OTT 공개일'
    case 'kr_theatrical': return '국내 극장 개봉일'
    case 'tmdb_release_date': return 'TMDB 개봉일'
    case 'tmdb_first_air_date': return '최초 방영일'
    case 'tmdb_season_air_date': return '시즌 공개일'
    case 'tmdb_estimated': return '공개일 추정(미확정)'
    case 'manual': return '직접 확인한 공개일'
    default: return null
  }
}

/** 정확한 국내 OTT 공개일이 아니라서 '추정'으로 안내가 필요한 소스인지 */
export function isEstimatedSource(src: ReleaseDateSource | null | undefined): boolean {
  return src === 'tmdb_estimated' || src === 'tmdb_first_air_date' || src === 'tmdb_season_air_date' || src === 'tmdb_release_date'
}
