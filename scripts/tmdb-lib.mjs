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
  'Apple TV Plus',
  'Amazon Prime Video',
  'U+ Mobile TV',
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
 * TMDB provider 목록에서 대상 OTT만 골라 정규화된 형태로 반환.
 * 대소문자·공백·'+' 차이를 무시하고 이름으로 매칭한다.
 * @returns {{providerId:number, providerName:string, logoPath:string|null}[]}
 */
export function matchTargetProviders(list, targetNames = TARGET_PROVIDER_NAMES) {
  const targets = new Set(targetNames.map(normName))
  const seen = new Set()
  const out = []
  for (const p of list || []) {
    const key = normName(p.provider_name)
    if (targets.has(key) && !seen.has(p.provider_id)) {
      seen.add(p.provider_id)
      out.push({
        providerId: p.provider_id,
        providerName: p.provider_name,
        logoPath: p.logo_path ?? null,
      })
    }
  }
  return out
}

/** watch/providers 응답의 results.KR.flatrate → ContentProvider[] */
export function extractKrFlatrate(watchProviders) {
  const kr = watchProviders?.results?.KR
  const flat = kr?.flatrate || []
  const seen = new Set()
  const out = []
  for (const p of flat) {
    if (seen.has(p.provider_id)) continue
    seen.add(p.provider_id)
    out.push({
      providerId: p.provider_id,
      providerName: p.provider_name,
      logoPath: p.logo_path ?? null,
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
    for (const p of priority) {
      if (earliestByType.has(p.type)) return { date: earliestByType.get(p.type), source: p.source }
    }
  }
  if (fallbackDate) return { date: String(fallbackDate).slice(0, 10), source: 'tmdb_release_date' }
  return { date: null, source: 'tmdb_estimated' }
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
