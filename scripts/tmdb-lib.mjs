/**
 * TMDB OTT 캘린더 — 순수 헬퍼 모듈 (네트워크/DB 의존 없음)
 * ------------------------------------------------------------
 * sync-tmdb-ott.mjs 와 유닛 테스트(scripts/__tests__)가 함께 import 합니다.
 * 여기 있는 함수는 전부 부수효과가 없어 테스트하기 쉽습니다.
 */

// 대상 OTT 이름 후보 (provider_id 하드코딩 금지 → 이름으로 자동 매칭)
export const TARGET_PROVIDER_NAMES = [
  'Netflix',
  'Disney Plus',
  'TVING',
  'Wavve',
  'Coupang Play',
  'Watcha',
  'Apple TV',        // 2025-10 'Apple TV+' → 'Apple TV' 리브랜딩. 별칭으로 옛 이름도 함께 매칭
  'Amazon Prime Video',
  'U+ Mobile TV',
  // 숏폼·웹드라마가 많이 올라오는 곳. TMDB 의 구독형 항목 이름은 'YouTube Premium' 이라
  // 아래 PROVIDER_NAME_ALIASES 로 흡수한다 — 그냥 'YouTube' 는 대여·구매라 flatrate 에 안 잡힌다.
  'YouTube',
]

export const IMG_POSTER = 'https://image.tmdb.org/t/p/w500'
export const IMG_BACKDROP = 'https://image.tmdb.org/t/p/w1280'
export const IMG_LOGO = 'https://image.tmdb.org/t/p/w92'

/** 이름 정규화: 소문자화 + '+' → 'plus' + 영숫자만. "Disney+"·"Disney Plus" 둘 다 "disneyplus" */
export function normName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * 정규화 + 별칭까지 적용한 정규 키.
 * "Apple TV" · "Apple TV+" · "Apple TV Plus" → 모두 "appletvplus".
 */
export function canonicalKey(name) {
  const k = normName(name)
  return PROVIDER_NAME_ALIASES[k] || k
}

/** 대상 OTT: 정규 키 → 정규명 */
function targetMap(targetNames) {
  return new Map(targetNames.map(n => [canonicalKey(n), n]))
}

/**
 * TMDB provider 목록에서 대상 OTT만 골라 정규화된 형태로 반환.
 * 대소문자·공백·'+' 차이를 무시하고 이름으로 매칭한다.
 * @returns {{providerId:number, providerName:string, logoPath:string|null}[]}
 */
export function matchTargetProviders(list, targetNames = TARGET_PROVIDER_NAMES) {
  const targets = targetMap(targetNames)
  const seen = new Set()
  const out = []
  for (const p of list || []) {
    const canonical = targets.get(canonicalKey(p.provider_name))
    if (!canonical || seen.has(p.provider_id)) continue
    seen.add(p.provider_id)
    out.push({
      providerId: p.provider_id,
      providerName: canonical,   // 앱의 필터·정렬이 쓰는 정규명으로 통일 (TMDB 개명에 흔들리지 않게)
      logoPath: p.logo_path ?? null,
    })
  }
  return out
}

/**
 * watch/providers 응답의 results.KR.flatrate → ContentProvider[].
 * 대상 OTT(TARGET_PROVIDER_NAMES)만 남긴다. "Netflix Standard with Ads" 같은
 * 광고형 티어·비대상 서비스는 노이즈라 제외한다.
 */
export function extractKrFlatrate(watchProviders, targetNames = TARGET_PROVIDER_NAMES) {
  const kr = watchProviders?.results?.KR
  const flat = kr?.flatrate || []
  const targets = targetMap(targetNames)
  const seen = new Set()
  const out = []
  for (const p of flat) {
    const canonical = targets.get(canonicalKey(p.provider_name))
    if (!canonical || seen.has(p.provider_id)) continue
    seen.add(p.provider_id)
    out.push({
      providerId: p.provider_id,
      providerName: canonical,
      logoPath: p.logo_path ?? null,
      monetizationType: 'flatrate',
    })
  }
  return out
}

// TMDB 이름 → 대상 OTT 정규 키 별칭.
// 네트워크명·watch-provider명이 서로 다르거나(예: "Prime Video" → "Amazon Prime Video"),
// 서비스가 개명했을 때(2025-10 "Apple TV+" → "Apple TV") 옛 이름을 새 이름으로 흡수한다.
// ⚠️ watch-provider 조회·작품별 flatrate 추출도 이 맵을 쓴다 — 여기 빠지면 그 OTT가 통째로 누락된다.
const PROVIDER_NAME_ALIASES = {
  primevideo: 'amazonprimevideo',
  amazon: 'amazonprimevideo',
  amazonprime: 'amazonprimevideo',
  disney: 'disneyplus',
  appletvplus: 'appletv',
  youtubepremium: 'youtube',
}

/**
 * TV 상세의 networks(방영사) → ContentProvider[].
 * watch/providers 의 KR 지역 정보가 비어 있을 때의 폴백.
 * 넷플릭스·디즈니+ 등 글로벌 OTT 오리지널은 KR watch-provider 등재가 늦어도
 * networks 에는 OTT가 잡히므로, 대상 OTT로 매칭되는 네트워크만 골라 provider로 변환한다.
 * (tvN·JTBC 같은 방송 네트워크는 대상 목록에 없으므로 무시된다.)
 * @returns {{providerId:number, providerName:string, logoPath:string|null, monetizationType:'flatrate'}[]}
 */
export function networksToProviders(networks, providerDir = null, targetNames = TARGET_PROVIDER_NAMES) {
  const targets = targetMap(targetNames)
  const seen = new Set()
  const out = []
  for (const net of networks || []) {
    const key = canonicalKey(net.name)
    const canonical = targets.get(key)
    if (!canonical || seen.has(canonical)) continue
    seen.add(canonical)
    // watch-provider 카탈로그가 있으면 그 id·로고를 사용해 다른 작품과 로고를 통일한다.
    // (network 로고와 watch-provider 로고가 달라 동일 OTT가 다른 로고로 보이는 문제 방지)
    const dir = providerDir?.get?.(key)
    out.push({
      providerId: dir?.providerId ?? net.id,
      providerName: canonical,     // 필터/정렬과 일치하도록 정규명 사용
      logoPath: dir?.logoPath ?? net.logo_path ?? null,
      monetizationType: 'flatrate',
    })
  }
  return out
}

/**
 * 영화 대한민국 공개일 우선순위 선택.
 *   1) type=4 Digital        → kr_digital
 *   2) type=3 Theatrical     → kr_theatrical
 *   3) type=2 Theatrical(제한) → kr_theatrical
 *   4) type=1 Premiere       → kr_theatrical
 *   5) fallback(discover release_date) → tmdb_release_date
 * 같은 타입 날짜가 여러 개면 가장 빠른 날짜.
 * @param releaseDatesResults movie detail 의 release_dates.results 배열
 * @returns {{date:string|null, source:string}}
 */
export function pickKrMovieDate(releaseDatesResults, fallbackDate) {
  const kr = (releaseDatesResults || []).find(r => r.iso_3166_1 === 'KR')
  if (kr && Array.isArray(kr.release_dates)) {
    const earliestByType = new Map()
    for (const rd of kr.release_dates) {
      const d = (rd.release_date || '').slice(0, 10)
      if (!d) continue
      const prev = earliestByType.get(rd.type)
      if (!prev || d < prev) earliestByType.set(rd.type, d)
    }
    const priority = [
      { type: 4, source: 'kr_digital' },
      { type: 3, source: 'kr_theatrical' },
      { type: 2, source: 'kr_theatrical' },
      { type: 1, source: 'kr_theatrical' },
    ]
    const hasTheatrical = earliestByType.has(3) || earliestByType.has(2) || earliestByType.has(1)
    for (const p of priority) {
      if (!earliestByType.has(p.type)) continue
      // 극장 개봉(type 3/2/1) 이력이 있는 영화의 디지털/OTT 공개(type 4)는 별도 소스로 표시
      const source = (p.type === 4 && hasTheatrical) ? 'kr_ott_post_theatrical' : p.source
      return { date: earliestByType.get(p.type), source }
    }
  }
  if (fallbackDate) return { date: String(fallbackDate).slice(0, 10), source: 'tmdb_release_date' }
  return { date: null, source: 'tmdb_estimated' }
}

// ── 상세정보 추출 (출연·연출·장르·채널) ────────────────────

/** TMDB 장르 id → 한글명 (detail.genres 가 없을 때의 폴백) */
export const TMDB_GENRE_KO = {
  28: '액션', 12: '모험', 16: '애니메이션', 35: '코미디', 80: '범죄', 99: '다큐멘터리',
  18: '드라마', 10751: '가족', 14: '판타지', 36: '역사', 27: '공포', 10402: '음악',
  9648: '미스터리', 10749: '로맨스', 878: 'SF', 10770: 'TV영화', 53: '스릴러',
  10752: '전쟁', 37: '서부',
  10759: '액션·모험', 10762: '키즈', 10763: '뉴스', 10764: '예능',
  10765: 'SF·판타지', 10766: '멜로', 10767: '토크쇼', 10768: '전쟁·정치',
}

/**
 * 장르 한글명 상위 max개.
 * TMDB의 TV 장르는 ko-KR 번역이 비어 영어로 오는 경우가 많아(id → 한글맵)을 우선하고,
 * 맵에 없으면 detail.genres 의 name 을 쓴다.
 */
export function pickGenres(genres, genreIds, max = 4) {
  const out = []
  const push = g => { if (g && !out.includes(g)) out.push(g) }
  if (Array.isArray(genres) && genres.length) {
    for (const g of genres) push(TMDB_GENRE_KO[g.id] || g.name)
  } else {
    for (const id of genreIds || []) push(TMDB_GENRE_KO[id])
  }
  return out.slice(0, max)
}

/** TV 장르로 예능/드라마 구분: 리얼리티(10764)·토크(10767) → variety */
export function tvContentType(genreIds) {
  const ids = new Set(genreIds || [])
  return (ids.has(10764) || ids.has(10767)) ? 'variety' : 'drama'
}

/** credits.cast → [{name, character, profilePath}] 상위 max명 */
export function extractCast(credits, max = 12) {
  const cast = credits?.cast || []
  return cast.slice(0, max).map(c => ({
    name: c.name,
    character: c.character || c.roles?.[0]?.character || null,
    profilePath: c.profile_path ?? null,
  }))
}

/** 영화 crew 에서 감독(Director) 이름 목록 */
export function extractDirectors(crew) {
  return (crew || []).filter(c => c.job === 'Director').map(c => c.name)
}

/** TV networks → [{name, logoPath}] 상위 max개 */
export function mapNetworks(networks, max = 3) {
  return (networks || []).slice(0, max).map(n => ({ name: n.name, logoPath: n.logo_path ?? null }))
}

/** date(YYYY-MM-DD)가 [start, end] 범위 안인가 (문자열 비교) */
export function withinRange(date, start, end) {
  if (!date) return false
  const d = String(date).slice(0, 10)
  return d >= start && d <= end
}

/**
 * contents.id (= 중복 방지 고유키) 생성.
 * 기존 ingest 스킴과 호환: 영화 tmdb-mv-*, 시리즈/시즌 tmdb-dr-*
 */
export function buildContentId({ mediaType, tmdbId, eventType, seasonNumber }) {
  if (eventType === 'season_release') return `tmdb-dr-${tmdbId}-s${seasonNumber}`
  return mediaType === 'movie' ? `tmdb-mv-${tmdbId}` : `tmdb-dr-${tmdbId}`
}

/** contents.id → { kind, tmdbId, seasonNumber }. TMDB 행이 아니면 null (buildContentId 의 역) */
export function parseContentId(id) {
  const m = /^tmdb-(mv|dr)-(\d+)(?:-s(\d+))?$/.exec(String(id ?? ''))
  if (!m) return null
  return { kind: m[1] === 'mv' ? 'movie' : 'tv', tmdbId: Number(m[2]), seasonNumber: m[3] ? Number(m[3]) : null }
}

/** 최근 공개작으로 치는 기간(일) — 이 안쪽은 TMDB 정보가 아직 채워지는 중이라 매일 다시 본다 */
export const ENRICH_FRESH_DAYS = 90

/**
 * 이 행을 이번 보강(enrich-tmdb)에서 TMDB 에 다시 물어볼 것인가.
 *
 * 작품 행을 만드는 길이 셋인데(ingest-tmdb · ensure_content RPC · sync-tmdb-ott) 상세를 채우는 건
 * sync 하나뿐이다. 나머지 둘이 만든 행은 채널·출연진이 빈 채로 남는다 — 보강이 그 뒤를 받친다.
 *
 * 빈 칸이 있다고 매일 다 물으면 900건 중 850건이 "TMDB 에도 없음" 으로 헛돈다. 그래서 평소엔
 *   · 한 번도 상세를 받은 적 없는 행 (tmdbUrl 이 비어 있다 — sync·enrich 만 이 칸을 쓴다)
 *   · 공개 전이거나 공개한 지 ENRICH_FRESH_DAYS 일이 안 된 행 (TMDB 쪽이 아직 채워지는 중)
 * 만 보고, 나머지 옛 행은 all(주 1회) 때 본다.
 */
export function needsEnrich(c, { today, all = false } = {}) {
  const ref = parseContentId(c?.id)
  if (!ref) return false
  const empty = v => !(Array.isArray(v) ? v.length : v)
  const stub = empty(c.releaseDate) || empty(c.castMembers) || empty(c.providers) || empty(c.genres) ||
    (ref.kind === 'tv' && empty(c.networks))
  if (!stub) return false
  if (all || empty(c.tmdbUrl) || empty(c.releaseDate)) return true
  const cutoff = new Date(new Date(`${today}T00:00:00Z`).getTime() - ENRICH_FRESH_DAYS * 86_400_000).toISOString().slice(0, 10)
  return String(c.releaseDate).slice(0, 10) >= cutoff
}

/**
 * 이 행에 적을 "다음 회차" — TMDB tv 상세의 next_episode_to_air 에서 고른다. 없으면 null.
 *
 * 한 시리즈가 시리즈 행(tmdb-dr-N)과 시즌 행(tmdb-dr-N-sK)으로 나뉘어 있을 수 있어서,
 * 회차가 속한 시즌의 행 **하나에만** 적는다 — 안 그러면 같은 회차가 달력에 두 번 뜬다.
 *   · 시즌 행   : 그 시즌의 회차일 때만
 *   · 시리즈 행 : 시즌1 회차이거나, 그 시즌의 행이 우리 표에 따로 없을 때(hasSeasonRow 가 false)
 * 1화는 적지 않는다 — 그날은 작품 공개일 그 자체로 이미 달력에 있다. 0 시즌(스페셜)도 뺀다.
 */
export function pickNextEpisode(detail, seasonNumber = null, hasSeasonRow = () => false) {
  const n = detail?.next_episode_to_air
  if (!n?.air_date || !(n.episode_number > 1)) return null
  const s = n.season_number
  if (!s) return null
  if (seasonNumber) { if (s !== seasonNumber) return null }
  else if (s >= 2 && hasSeasonRow(s)) return null
  return { date: String(n.air_date).slice(0, 10), number: n.episode_number }
}

/** providers 두 배열을 providerId 기준으로 합치기(중복 제거) */
export function mergeProviders(a = [], b = []) {
  const map = new Map()
  for (const p of [...(a || []), ...(b || [])]) {
    if (p && p.providerId != null && !map.has(p.providerId)) map.set(p.providerId, p)
  }
  return [...map.values()]
}

/** TMDB 상세 페이지 URL */
export function tmdbUrl(mediaType, tmdbId) {
  return `https://www.themoviedb.org/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}`
}

/** 이미지 경로 → 전체 URL (없으면 null) */
export function imgUrl(base, path) {
  return path ? base + path : null
}

/**
 * 이 작품이 TMDB 에 아직 존재하나 — '사라진 작품' 판정의 유일한 근거.
 *
 * ★ 왜 필요한가 (2026-08-05) ★
 * 전에는 "이번 동기화 쿼리에 안 걸림"을 곧 "사라진 작품"으로 보고 숨겼다. 그런데
 * sync 는 OTT 구독작과 한국어 영화만 수집한다 — 외화 극장 개봉작은 처음부터
 * 수집 대상이 아닌데 정리 대상에는 들어갔다. 그 결과 최근 3개월 극장 개봉작이
 * 사이트에서 통째로 사라졌고(스파이더맨: 브랜드 뉴 데이 등 213건), 리뷰가 달린
 * 작품까지 접근 불가가 됐다. 수집 범위와 정리 범위가 다른 것이 원인이므로,
 * 추측하지 말고 TMDB 에 직접 물어본다.
 *
 * @param {(path: string) => Promise<number>} getStatus 경로를 받아 HTTP 상태코드만 돌려주는 함수
 * @param {string} mediaType 'movie' | 'tv'(또는 'drama')
 * @param {number|string} tmdbId
 * @returns {Promise<boolean|null>} true=존재, false=삭제됨(404),
 *   **null=판단 불가**(네트워크·레이트리밋·기타 오류). null 은 절대 숨기면 안 된다 —
 *   일시적 장애로 멀쩡한 작품을 지우는 것이 이 버그의 본질이었다.
 */
export async function tmdbAlive(getStatus, mediaType, tmdbId) {
  if (!tmdbId) return null
  const kind = mediaType === 'tv' || mediaType === 'drama' ? 'tv' : 'movie'
  try {
    const status = await getStatus(`/${kind}/${tmdbId}`)
    if (status === 404) return false
    if (status >= 200 && status < 300) return true
    return null
  } catch {
    return null
  }
}

const defaultSleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * fetch 재시도 래퍼. 429는 Retry-After 우선, 그 외 실패는 지수 백오프.
 * doFetch()는 Response 를 반환해야 한다(테스트에서 주입 가능).
 * @param {() => Promise<Response>} doFetch
 */
export async function fetchWithRetry(doFetch, opts = {}) {
  const { retries = 3, baseDelay = 500, sleep = defaultSleep } = opts
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await doFetch()
      if (res.status === 429) {
        if (attempt >= retries) throw new Error('TMDB 429 rate limit (재시도 소진)')
        const ra = Number(res.headers?.get?.('retry-after')) || 0
        await sleep(ra > 0 ? ra * 1000 : baseDelay * 2 ** attempt)
        continue
      }
      if (!res.ok) {
        if (attempt >= retries) throw new Error(`HTTP ${res.status}`)
        await sleep(baseDelay * 2 ** attempt)
        continue
      }
      return res
    } catch (e) {
      lastErr = e
      if (attempt >= retries) throw lastErr
      await sleep(baseDelay * 2 ** attempt)
    }
  }
  throw lastErr
}

/** 동시 실행 수를 제한하며 items 를 worker(item, index)로 처리 */
export async function pMap(items, worker, concurrency = 4) {
  const results = new Array(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const i = cursor++
      try {
        results[i] = await worker(items[i], i)
      } catch (e) {
        results[i] = { __error: e?.message || String(e) }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return results
}
