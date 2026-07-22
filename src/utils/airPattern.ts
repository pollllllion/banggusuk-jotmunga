/**
 * 공개 패턴 유추 — 캘린더 작품 모달용.
 * TMDB 회차별 방영일(air_date)을 읽어 "한번에 공개 / 매주 수·목 공개 · 주 2화" 같은 문구를 만든다.
 * DB·동기화에 저장하지 않고, 모달을 열 때 그때그때 TMDB 시즌 API를 호출해 계산한다(세션 캐시).
 * 영화(tmdb-mv-)·수기작·비TMDB 작품은 패턴이 없으므로 null.
 */
const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined
const BASE = 'https://api.themoviedb.org/3'
const WD = ['일', '월', '화', '수', '목', '금', '토']
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const cache = new Map<string, string | null>()

/** content.id → TMDB TV id/season. `tmdb-dr-{id}`=시즌1, `tmdb-dr-{id}-s{n}`=시즌n. 그 외 null */
function parseTv(id: string): { tvId: string; season: number } | null {
  const m = id.match(/^tmdb-dr-(\d+)(?:-s(\d+))?$/)
  if (!m) return null
  return { tvId: m[1], season: m[2] ? Number(m[2]) : 1 }
}

async function fetchSeason(tvId: string, season: number): Promise<any> {
  const url = new URL(`${BASE}/tv/${tvId}/season/${season}`)
  url.searchParams.set('api_key', TMDB_KEY!)
  url.searchParams.set('language', 'ko-KR')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return res.json()
}

/** 회차 방영일 목록 → 공개 패턴 문구. 판단 근거 부족(방영일 2개 미만)이면 null */
function deriveLabel(episodes: any[]): string | null {
  const dated = (episodes || [])
    .filter(e => e.air_date)
    .map(e => ({ d: e.air_date as string, wd: new Date(e.air_date + 'T00:00:00').getDay() }))
  if (dated.length < 2) return null

  // 방영일이 사실상 하나 → 전편 동시 공개(넷플릭스 등)
  if (new Set(dated.map(e => e.d)).size <= 1) return '한번에 공개'

  // 등장 요일(중복 제거·정렬)
  const weekdays = [...new Set(dated.map(e => e.wd))].sort((a, b) => a - b).map(d => WD[d])

  // 주당 편수: 주 단위로 묶은 카운트의 최빈값(첫/막주 부분 방영에 흔들리지 않게)
  const perWeek = new Map<number, number>()
  for (const e of dated) {
    const wk = Math.floor(new Date(e.d + 'T00:00:00').getTime() / WEEK_MS)
    perWeek.set(wk, (perWeek.get(wk) || 0) + 1)
  }
  const counts = [...perWeek.values()]
  const freq = new Map<number, number>()
  counts.forEach(c => freq.set(c, (freq.get(c) || 0) + 1))
  let mode = counts[0]
  for (const [c, f] of freq) if (f > (freq.get(mode) || 0)) mode = c

  const days = `매주 ${weekdays.join('·')} 공개`
  return mode > 1 ? `${days} · 주 ${mode}화` : days
}

/** 캘린더 모달용 공개 패턴 문구(없으면 null). 같은 작품 재조회는 세션 캐시. */
export async function getAirPattern(contentId: string): Promise<string | null> {
  if (!TMDB_KEY) return null
  const tv = parseTv(contentId)
  if (!tv) return null
  const cacheKey = `${tv.tvId}-${tv.season}`
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null
  try {
    const season = await fetchSeason(tv.tvId, tv.season)
    const label = deriveLabel(season.episodes || [])
    cache.set(cacheKey, label)
    return label
  } catch {
    cache.set(cacheKey, null)
    return null
  }
}
