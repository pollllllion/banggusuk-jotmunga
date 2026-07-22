/**
 * OTT / 캘린더 공용 헬퍼 (클라이언트).
 * TMDB 요청은 서버(sync 스크립트)에서만 하고, 여기서는 이미 저장된 데이터의 표시/가공만 담당.
 */
import type { Content, ContentProvider, ReleaseDateSource } from '@/types'

export const IMG_LOGO = 'https://image.tmdb.org/t/p/w92'
export const IMG_PROFILE = 'https://image.tmdb.org/t/p/w185'

/** 출연진 프로필 이미지 URL (없으면 null) */
export function castProfileUrl(profilePath: string | null | undefined): string | null {
  return profilePath ? IMG_PROFILE + profilePath : null
}

/* ─────────────────────────────────────────────────────────
   플랫폼/채널 로고 — 앱 아이콘 스타일로 자체 렌더링.
   TMDB 제공 로고(구버전·비일관)를 쓰지 않고, 브랜드 컬러 + 약칭을
   둥근 사각 아이콘으로 그려 모든 화면에서 동일하게 보이게 한다.
   ───────────────────────────────────────────────────────── */
interface LogoSpec { bg: string; fg: string; label: string; fs?: number }

/** 앱 아이콘 스타일 SVG data URI 생성 */
function appIcon({ bg, fg, label, fs }: LogoSpec): string {
  const size = fs ?? (label.length >= 4 ? 13 : label.length === 3 ? 15 : label.length === 2 ? 20 : 26)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">` +
    `<rect width="48" height="48" rx="11" fill="${bg}"/>` +
    `<text x="24" y="24" fill="${fg}" ` +
    `font-family="Arial,Helvetica,'Malgun Gothic','Apple SD Gothic Neo',sans-serif" ` +
    `font-size="${size}" font-weight="800" letter-spacing="-0.5" ` +
    `text-anchor="middle" dominant-baseline="central">${label}</text>` +
    `</svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

// 넷플릭스·티빙·디즈니+·웨이브는 TMDB 원래 로고를 그대로 사용한다(커스텀 아이콘 제외).
const TMDB_LOGO_PLATFORMS = new Set(['netflix', 'tving', 'disneyplus', 'wavve'])

// 이미지 파일로 대체하는 로고 (public/logos 아래 정적 자산)
const IMAGE_LOGOS: Record<string, string> = {
  coupangplay: '/logos/coupangplay.png',
}

// 앱 아이콘(브랜드 컬러 + 약칭)으로 그리는 플랫폼/채널 (normName 키)
const PLATFORM_SPECS: Record<string, LogoSpec> = {
  // ── OTT ──
  // 넷플릭스·티빙·디즈니+·웨이브: 평소엔 TMDB 로고를 쓰고, 로고 경로가 없을 때만 폴백으로 사용
  netflix:          { bg: '#000000', fg: '#E50914', label: 'N' },
  tving:            { bg: '#FF153C', fg: '#FFFFFF', label: 'T' },
  disneyplus:       { bg: '#0E1A4C', fg: '#FFFFFF', label: 'D+' },
  wavve:            { bg: '#1731C8', fg: '#FFFFFF', label: 'W' },
  watcha:           { bg: '#000000', fg: '#FF0558', label: 'W' },
  appletvplus:      { bg: '#000000', fg: '#FFFFFF', label: 'tv+' },
  amazonprimevideo: { bg: '#0F171E', fg: '#1F9FEF', label: 'P' },
  uplusmobiletv:    { bg: '#E6007E', fg: '#FFFFFF', label: 'U+' },
  // ── 방송 채널 ──
  tvn:   { bg: '#ED1C24', fg: '#FFFFFF', label: 'tvN' },
  jtbc:  { bg: '#1E1E1E', fg: '#FFFFFF', label: 'JTBC' },
  sbs:   { bg: '#00A2E0', fg: '#FFFFFF', label: 'SBS' },
  mbc:   { bg: '#000000', fg: '#FFFFFF', label: 'MBC' },
  kbs:   { bg: '#003D9A', fg: '#FFFFFF', label: 'KBS' },
  ena:   { bg: '#7A2FA0', fg: '#FFFFFF', label: 'ENA' },
  ebs:   { bg: '#0054A6', fg: '#FFFFFF', label: 'EBS' },
  ocn:   { bg: '#161616', fg: '#FFFFFF', label: 'OCN' },
  mnet:  { bg: '#EA0029', fg: '#FFFFFF', label: 'Mnet' },
  mbn:   { bg: '#C8102E', fg: '#FFFFFF', label: 'MBN' },
}

// 알 수 없는 채널용 배지 색상 팔레트 (이름 해시로 결정 → 일관)
const FALLBACK_BG = ['#3B4252', '#4C566A', '#5E6472', '#556270', '#41505E']

/** 이름 → 커스텀 로고(이미지/앱아이콘/배지). TMDB 사용 플랫폼은 여기서 처리하지 않음. */
function customLogo(name: string): string {
  const key = normName(name)
  const base = key.replace(/[0-9]+$/, '') // 'ebs1'→'ebs', 'kbs2'→'kbs'
  if (IMAGE_LOGOS[key] || IMAGE_LOGOS[base]) return IMAGE_LOGOS[key] || IMAGE_LOGOS[base]
  const spec = PLATFORM_SPECS[key] || PLATFORM_SPECS[base]
  if (spec) return appIcon(spec)
  // 미등록: 이름 앞 2글자 + 해시 색상 배지
  const label = name.trim().replace(/\s+/g, '').slice(0, 2) || '?'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return appIcon({ bg: FALLBACK_BG[h % FALLBACK_BG.length], fg: '#FFFFFF', label })
}

/**
 * provider/채널 로고 표시용 URL.
 * · 넷플릭스·티빙·디즈니+·웨이브 → TMDB 원래 로고
 * · 그 외(쿠팡플레이 이미지·왓챠/애플 등 앱아이콘·미등록 채널 배지) → 커스텀
 * providerName 이 없으면(구 호출) TMDB 경로로 폴백.
 */
export function providerLogoUrl(logoPath: string | null | undefined, providerName?: string): string | null {
  if (providerName) {
    const key = normName(providerName)
    if (TMDB_LOGO_PLATFORMS.has(key)) return logoPath ? IMG_LOGO + logoPath : customLogo(providerName)
    return customLogo(providerName)
  }
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

/** 이 작품의 OTT 목록(안전 접근) — 플랫폼 우선순위대로 정렬해서 반환 */
export function providersOf(c: Content): ContentProvider[] {
  return sortProviders(Array.isArray(c.providers) ? c.providers : [])
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

/** 개별 OTT 표시 우선순위: 넷플릭스 > 티빙 > 디즈니 > 웨이브 > 쿠팡 > 그 외 > 미상 */
const PROVIDER_ORDER = ['netflix', 'tving', 'disneyplus', 'wavve', 'coupangplay']
function providerRank(name: string): number {
  const n = normName(name)
  const i = PROVIDER_ORDER.indexOf(n)
  if (i >= 0) return i
  const fi = OTT_FILTERS.findIndex(o => normName(o.name) === n)
  return fi >= 0 ? PROVIDER_ORDER.length + fi : 999
}

/** OTT 로고 배열을 플랫폼 우선순위대로 정렬(원본 불변) */
export function sortProviders(list: ContentProvider[]): ContentProvider[] {
  return [...list].sort((a, b) => providerRank(a.providerName) - providerRank(b.providerName))
}

/** 작품이 특정 OTT(이름)에서 제공되는가 */
export function hasProvider(c: Content, providerName: string): boolean {
  const target = normName(providerName)
  return providersOf(c).some(p => normName(p.providerName) === target)
}

/**
 * 방영/공개 플랫폼 정렬 우선순위.
 * 넷플릭스(0) > 티빙(1) > 디즈니+(2) > 웨이브(3) > 쿠팡플레이(4) > 극장(5) > 기타 OTT(6) > 미상(7)
 * 여러 OTT를 가진 작품은 가장 앞선 플랫폼 기준.
 */
export function platformSortRank(c: Content): number {
  let best = Infinity
  for (const p of providersOf(c)) {
    const n = normName(p.providerName)
    if (n === 'netflix') best = Math.min(best, 0)
    else if (n === 'tving') best = Math.min(best, 1)
    else if (n === 'disneyplus') best = Math.min(best, 2)
    else if (n === 'wavve') best = Math.min(best, 3)
    else if (n === 'coupangplay') best = Math.min(best, 4)
    else best = Math.min(best, 6)
  }
  if (best !== Infinity) return best
  // OTT 정보가 없는 작품 — 극장 개봉작이면 극장(5), 그 외는 미상(7)
  const src = c.releaseDateSource
  if (src === 'kr_theatrical' || src === 'tmdb_release_date' || c.eventType === 'movie_release') return 5
  return 7
}

/** releaseDateSource 한글 라벨 (신뢰도 표시) */
export function releaseSourceLabel(src: ReleaseDateSource | null | undefined): string | null {
  switch (src) {
    case 'kr_digital': return '국내 OTT 공개일'
    case 'kr_ott_post_theatrical': return '극장 개봉작 · OTT 공개일'
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
