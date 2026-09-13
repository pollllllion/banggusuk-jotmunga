/**
 * TMDB 검색 (등록 모달용 — 영화/드라마/예능 제목 검색)
 *
 * 키는 VITE_TMDB_API_KEY, 없으면 아래 기본값을 쓴다.
 * TMDB v3 키는 클라이언트 사용을 전제로 한 읽기 전용 공개키라 번들에 들어가도 안전하다
 * (supabaseClient.ts 의 publishable 키와 같은 성격).
 * 호스팅을 옮길 때마다 환경변수를 다시 심지 않아도 검색이 살아있게 하려는 목적.
 */
import type { ContentType } from '@/types'

const DEFAULT_TMDB_KEY = 'b3895231dd8a099e53e6ac823fae48b1'
const TMDB_KEY = (import.meta.env.VITE_TMDB_API_KEY as string | undefined) || DEFAULT_TMDB_KEY
const BASE = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p/w500'

export const tmdbEnabled = Boolean(TMDB_KEY)

/**
 * 앱 콘텐츠 타입 + TMDB id → 중복 안전한 content id.
 * ⚠️ 동기화 스크립트(scripts/tmdb-lib.mjs:contentId)와 반드시 동일 규칙이어야 중복이 안 생긴다:
 *   영화=`tmdb-mv-{id}`, 그 외(드라마·예능 = TMDB의 tv)=`tmdb-dr-{id}`.
 *   → 앱 타입(drama vs variety)은 id에 반영하지 않는다. TMDB는 둘 다 tv 한 종류이기 때문.
 */
export function tmdbContentId(type: ContentType, tmdbId: number, seasonNumber?: number | null): string {
  if (type === 'movie') return `tmdb-mv-${tmdbId}`
  // 시즌2+ 는 캘린더 동기화의 시즌 행과 같은 id(buildContentId). 시즌1 은 시리즈 행 자체다.
  return seasonNumber && seasonNumber >= 2 ? `tmdb-dr-${tmdbId}-s${seasonNumber}` : `tmdb-dr-${tmdbId}`
}

/**
 * TMDB 장르 id로 드라마/예능 구분 (10764=리얼리티, 10767=토크쇼).
 * ⚠️ 동기화 스크립트(scripts/tmdb-lib.mjs:tvContentType)와 같은 규칙이어야
 *    같은 작품이 한쪽은 drama, 한쪽은 variety 로 갈리지 않는다.
 */
export function tmdbTvType(genreIds: number[]): ContentType {
  return genreIds?.includes(10764) || genreIds?.includes(10767) ? 'variety' : 'drama'
}

export interface TmdbResult {
  tmdbId: number
  title: string
  originalTitle: string
  year: number | null
  posterUrl: string | null
  overview: string
  genreIds: number[]
  /** 이 결과가 어느 검색에서 왔는지. 통합 검색(searchTmdbAll)에서 앱 타입을 정하는 근거 */
  kind: 'movie' | 'tv'
  /** 통합 검색 결과를 한 줄로 섞을 때의 정렬 기준 */
  popularity: number
  /** tv 의 시즌2+ 항목. TMDB 검색은 시즌을 따로 주지 않아 withSeasons 가 펼쳐 만든다 */
  seasonNumber?: number | null
}

function mapResults(results: any[], kind: 'movie' | 'tv'): TmdbResult[] {
  return (results || []).map((m: any): TmdbResult => {
    const date = m.release_date || m.first_air_date || ''
    return {
      tmdbId: m.id,
      title: m.title || m.name || '(제목 없음)',
      originalTitle: m.original_title || m.original_name || '',
      year: date ? Number(date.slice(0, 4)) : null,
      posterUrl: m.poster_path ? IMG + m.poster_path : null,
      overview: m.overview || '',
      genreIds: m.genre_ids || [],
      kind,
      popularity: Number(m.popularity) || 0,
    }
  })
}

/**
 * 같은 요청은 한 번만 보낸다 — 실시간 검색이라 "배트맨 다" → "배트맨 다크" 처럼 앞 단어 검색이
 * 키마다 반복되고, 아래 단어별·띄어쓰기 변형 검색이 호출 수를 늘리기 때문.
 */
const pageCache = new Map<string, Promise<TmdbResult[]>>()

/** TMDB 검색 1페이지 */
function fetchSearchPage(kind: 'movie' | 'tv', query: string, page = 1): Promise<TmdbResult[]> {
  const key = `${kind}|${page}|${query}`
  const hit = pageCache.get(key)
  if (hit) return hit
  if (pageCache.size > 300) pageCache.clear()
  const p = (async () => {
    const url = new URL(`${BASE}/search/${kind}`)
    url.searchParams.set('api_key', TMDB_KEY!)
    url.searchParams.set('language', 'ko-KR')
    url.searchParams.set('query', query)
    url.searchParams.set('include_adult', 'false')
    url.searchParams.set('page', String(page))
    const res = await fetch(url)
    if (!res.ok) throw new Error(`TMDB ${kind} 검색 실패 (${res.status})`)
    const json = await res.json()
    return mapResults(json.results, kind)
  })()
  pageCache.set(key, p)
  p.catch(() => pageCache.delete(key)) // 실패는 캐시하지 않는다
  return p
}

/** 공백·문장부호(콜론·하이픈 등) 모두 제거한 느슨한 정규화 (한글/영문/숫자만 남김) */
const normLoose = (s: string) => (s || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()

const HANGUL = /\p{Script=Hangul}/u

/**
 * 검색 최소 글자수. 한글·한자는 한 글자도 제목이 된다(《놉》《곡성》의 '곡' 같은 경우) — 영문 1글자만 막는다.
 * 검색창마다 따로 `length < 2` 를 쓰면 "놉" 이 안 찾아지던 버그가 다시 생긴다.
 */
export function isSearchableQuery(query: string): boolean {
  const q = query.trim()
  return q.length >= 2 || (q.length === 1 && /[\p{Script=Hangul}\p{Script=Han}]/u.test(q))
}

const looseHas = (m: TmdbResult, qn: string) =>
  normLoose(m.title).includes(qn) || normLoose(m.originalTitle).includes(qn)

/** 영화와 tv 는 id 체계가 따로라 같은 숫자가 겹칠 수 있다 → 종류·시즌까지 키로 */
const dedupe = (list: TmdbResult[]) => {
  const seen = new Set<string>()
  return list.filter(m => {
    const key = `${m.kind}-${m.tmdbId}-${m.seasonNumber ?? ''}`
    return !seen.has(key) && seen.add(key)
  })
}

/** 앞 몇 글자까지 띄어쓰기 경우의 수를 펼치나. 4글자 = 8가지 */
const SPACING_HEAD = 4

/** 띄어쓰기 경우의 수 전부. "노웨이" → 노웨이 · 노 웨이 · 노웨 이 · 노 웨 이 */
function allSpacings(s: string): string[] {
  const chars = [...s]
  const out: string[] = []
  for (let mask = 0; mask < 1 << (chars.length - 1); mask++) {
    let t = chars[0]
    for (let i = 1; i < chars.length; i++) t += (mask & (1 << (i - 1)) ? ' ' : '') + chars[i]
    out.push(t)
  }
  return out
}

/**
 * 공백 없는 한 단어 검색 — **띄어쓰기를 몰라도 찾는다.**
 *
 * TMDB 는 띄어쓰기 단위로, 단어 앞부분 일치로 찾는다: "노 웨" 는 《노 웨이 아웃》을 찾지만
 * "노웨이아웃" · "노 웨이아웃" 은 0건. 어디를 띄어야 할지는 모르니, 앞 4글자를 가능한 띄어쓰기로
 * 전부 쳐 보고(8가지) 전체 검색어가 공백 무시로 들어 있는 제목만 남긴다. 앞 4글자의 단어 경계는
 * 8가지 중 하나에 반드시 들어 있으므로 제목의 실제 띄어쓰기와 상관없이 같은 작품이 걸린다.
 *  예) "노웨이아웃"→"노 웨이 아" · "다크나이트"→"다크 나이" · "유퀴즈온더블럭"→"유 퀴즈 온"
 *
 * 원쿼리 결과는 거르지 않는다 — "nope"→《놉》처럼 TMDB 가 다른 언어 제목으로 찾아 준 것.
 * 그래도 0건이면 짧은 접두어로 넓게 받아(최대 2페이지) 공백·문장부호 무시 부분일치로 필터.
 */
async function searchWord(kind: 'movie' | 'tv', word: string): Promise<TmdbResult[]> {
  const qn = normLoose(word)
  const chars = [...word]
  const variants = HANGUL.test(word) && chars.length >= 2
    ? allSpacings(chars.slice(0, SPACING_HEAD).join('')).filter(v => v !== word)
    : []
  const [direct, ...vs] = await Promise.all([
    fetchSearchPage(kind, word),
    ...variants.map(v => fetchSearchPage(kind, v).catch(() => [] as TmdbResult[])),
  ])
  const spaced = vs.flat().filter(m => looseHas(m, qn))
  if (direct.length || spaced.length) return dedupe([...direct, ...spaced])
  if ([...word].length < 2) return []

  // 접두어 길이 후보: 짧은 쿼리는 1~2글자, 길수록 첫 단어(≈4글자)까지 시도. 첫 히트에서 종료.
  const seeds = word.length <= 3 ? [1, 2] : word.length <= 5 ? [2, 3] : [2, 3, 4]
  for (const n of seeds) {
    let pool: TmdbResult[] = []
    for (let p = 1; p <= 2; p++) {
      const rp = await fetchSearchPage(kind, word.slice(0, n), p)
      pool = pool.concat(rp)
      if (rp.length < 20) break
    }
    const hit = pool.filter(m => looseHas(m, qn))
    if (hit.length) return dedupe(hit)
  }
  return []
}

/**
 * 검색어와 얼마나 맞나. 제목(또는 원제)이 통째로 같으면 최상위, 아니면 제목에 들어 있는
 * 검색 단어의 글자수 합. "배트맨 다크나이트" 에서 《다크 나이트》(5)가 《배트맨 비긴즈》(3)보다 위.
 */
function relevance(m: TmdbResult, query: string): number {
  const t = normLoose(m.title), o = normLoose(m.originalTitle)
  const qn = normLoose(query)
  if (t === qn || o === qn) return 1000
  if (t.includes(qn) || o.includes(qn)) return qn.length // 띄어 쳤든 붙여 쳤든 같은 점수
  let s = 0
  for (const k of query.split(/\s+/).map(normLoose).filter(Boolean)) if (t.includes(k) || o.includes(k)) s += k.length
  return s
}

/** 관련도 → 인기도 순 정렬 */
export function rankTmdbResults(list: TmdbResult[], query: string): TmdbResult[] {
  const q = query.trim()
  return list
    .map(m => ({ m, r: relevance(m, q) }))
    .sort((a, b) => b.r - a.r || b.m.popularity - a.m.popularity)
    .map(x => x.m)
}

/** 검색·단어별 검색을 합친 결과 (정렬 전) */
async function searchKind(kind: 'movie' | 'tv', raw: string): Promise<TmdbResult[]> {
  const words = raw.split(' ')
  if (words.length === 1) return searchWord(kind, raw)

  // 한글이면 띄어 친 검색어도 붙여서 똑같이 찾는다 — "노웨이 아웃" 과 "노웨이아웃" 이 같은 결과.
  // (영문은 띄어쓰기를 틀리게 치는 일이 드물고, 붙이면 접두어 폴백만 헛돈다)
  const joined = HANGUL.test(raw) ? searchWord(kind, words.join('')).catch(() => [] as TmdbResult[]) : Promise.resolve([])

  // 단어별 검색도 합친다. 사람들은 정식 제목에 없는 말을 붙여 친다 — "배트맨 다크나이트" 의
  // 정식 제목은 《다크 나이트》라 통째로는 절대 안 나온다. 다만 이게 띄어 친 검색에만 붙는 결과라
  // 붙여 친 검색과 달라지는 원인이 된다 → 검색어 글자의 60% 를 넘게 한 단어로 덮을 때만 남긴다.
  // "배트맨 다크나이트"(다크나이트 5/8)는 남고, "다크 나이트"(나이트 3/5)·"스파이더맨 노 웨이 홈"
  // (스파이더맨 5/9) 같은 흔한 띄어쓰기에선 안 붙어서 붙여 친 결과와 같아진다.
  const perWord = words.length <= 4
    ? words.filter(w => isSearchableQuery(w)).map(w => searchWord(kind, w).catch(() => [] as TmdbResult[]))
    : []
  const total = normLoose(raw).length
  const strong = (m: TmdbResult) => {
    const t = normLoose(m.title), o = normLoose(m.originalTitle)
    return words.map(normLoose).some(k => k.length / total > 0.6 && (t.includes(k) || o.includes(k)))
  }
  const hangul = HANGUL.test(raw)
  const [base, direct, ...extra] = await Promise.all([joined, fetchSearchPage(kind, raw).catch(() => [] as TmdbResult[]), ...perWord])
  const qn = normLoose(raw)
  return dedupe([
    ...base,
    // 한글은 붙여 친 검색(base)이 원쿼리 몫을 이미 한다 — 검색어가 통째로 든 것만 더한다
    ...(hangul ? direct.filter(m => looseHas(m, qn)) : direct),
    ...extra.flat().filter(strong),
  ])
}

const jsonCache = new Map<string, Promise<any>>()

/** 검색 외 TMDB GET (컬렉션). fetchSearchPage 와 같은 이유로 캐시한다 */
function tmdbGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('api_key', TMDB_KEY!)
  url.searchParams.set('language', 'ko-KR')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const key = url.toString()
  const hit = jsonCache.get(key)
  if (hit) return hit
  if (jsonCache.size > 100) jsonCache.clear()
  const p = fetch(url).then(res => {
    if (!res.ok) throw new Error(`TMDB ${path} 실패 (${res.status})`)
    return res.json()
  })
  jsonCache.set(key, p)
  p.catch(() => jsonCache.delete(key))
  return p
}

/** 제목 안에서 정규화 문자열 qn 에 해당하는 원문 구간(띄어쓰기·문장부호 포함). 없으면 null */
function spacedLike(title: string, qn: string): string | null {
  const chars = [...title]
  let norm = ''
  const pos: number[] = [] // norm 의 UTF-16 위치 → chars 인덱스
  chars.forEach((ch, i) => {
    if (!/[\p{L}\p{N}]/u.test(ch)) return
    const low = ch.toLowerCase()
    norm += low
    for (let k = 0; k < low.length; k++) pos.push(i)
  })
  const at = norm.indexOf(qn)
  return at < 0 ? null : chars.slice(pos[at], pos[at + qn.length - 1] + 1).join('')
}

/**
 * 시리즈 묶기. "듄" 을 치면 《듄》《듄: 파트 2》《듄: 파트 3》가 개봉순으로 붙어 나오게 한다.
 * 인기순으로만 섞으면 1984년판 《듄》이 사이에 끼고, "듄1" 처럼 치면 1편만 나온다.
 * TMDB 컬렉션(시리즈 묶음, 영화만 있음)을 찾아 가장 위에 걸린 편 자리에 전 편을 한 덩어리로 넣는다.
 * 실패해도 원래 결과는 그대로 돌려준다.
 */
async function withSeries(list: TmdbResult[], base: string, n: number | null): Promise<Expanded> {
  const bn = normLoose(base)
  if (!bn) return { out: list, picks: [] }
  try {
    // 컬렉션 검색도 띄어쓰기 단위라 "해리포터" 로는 《해리 포터 시리즈》가 안 나온다.
    // 이미 찾은 **영화** 제목에서 실제 띄어쓰기를 따온다: 《해리 포터와 마법사의 돌》 → "해리 포터".
    // (드라마 제목에서 따오면 "범죄도시4" 가 TV 《범죄 도시》의 띄어쓰기로 컬렉션을 찾다 놓친다)
    const spaced = list.filter(m => m.kind === 'movie').map(m => spacedLike(m.title, bn)).find(Boolean)
    const queries = [...new Set([spaced, base].filter(Boolean) as string[])]
    const found = await Promise.all(queries.map(q => tmdbGet('/search/collection', { query: q }).catch(() => null)))
    const seen = new Set<number>()
    const cols = found.flatMap(f => f?.results || [])
      .filter((c: any) => !seen.has(c.id) && seen.add(c.id))
      .filter((c: any) => normLoose(c.name).includes(bn) || normLoose(c.original_name).includes(bn))
      .slice(0, 2)
    let out = list
    const picks: TmdbResult[] = []
    for (const col of cols) {
      const detail = await tmdbGet(`/collection/${col.id}`)
      const parts = mapResults(detail?.parts || [], 'movie')
        .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
      if (parts.length < 2) continue
      const ids = new Set(parts.map(p => p.tmdbId))
      const isPart = (m: TmdbResult) => m.kind === 'movie' && ids.has(m.tmdbId)
      const at = out.findIndex(isPart)
      if (at < 0) continue // 검색에 한 편도 안 걸린 시리즈는 끼워 넣지 않는다(엉뚱한 묶음 방지)
      const rest = out.filter(m => !isPart(m))
      out = [...rest.slice(0, at), ...parts, ...rest.slice(at)]
      if (n && parts[n - 1]) picks.push(parts[n - 1]) // "범죄도시4" → 4편
    }
    return { out, picks }
  } catch {
    return { out: list, picks: [] }
  }
}

/** 시즌을 펼칠 드라마 수 (상위 몇 개). 작품마다 상세 조회가 1회 든다 */
const SEASON_EXPAND_TOP = 3

const isShow = (m: TmdbResult) => m.kind === 'tv' && !m.seasonNumber

/**
 * 시즌 펼치기. TMDB 검색은 드라마를 시즌 구분 없이 한 항목으로만 줘서 "피의 게임 시즌2" 는
 * 검색으로 절대 안 나왔다(우리 DB엔 캘린더로 들어온 최근 시즌만 있다).
 * 상위 드라마의 상세에서 시즌 목록을 받아 시즌2+ 를 작품 바로 밑에 붙인다.
 * 제목·id 는 캘린더 동기화(sync-tmdb-ott)와 같은 규칙 — "제목 시즌N" / tmdb-dr-{id}-s{N}.
 * 방영일 없는(발표만 된) 시즌은 뺀다. n 이 있으면("피의게임2") 그 시즌을 맨 앞으로.
 */
async function withSeasons(list: TmdbResult[], n: number | null): Promise<Expanded> {
  const shows = list.filter(isShow).slice(0, SEASON_EXPAND_TOP)
  if (!shows.length) return { out: list, picks: [] }
  const details = await Promise.all(shows.map(s => tmdbGet(`/tv/${s.tmdbId}`).catch(() => null)))
  const seasonsOf = new Map<number, TmdbResult[]>()
  shows.forEach((s, i) => {
    const seasons: TmdbResult[] = (details[i]?.seasons || [])
      .filter((x: any) => x.season_number >= 2 && x.air_date)
      .map((x: any): TmdbResult => ({
        ...s,
        title: `${s.title} 시즌${x.season_number}`,
        seasonNumber: x.season_number,
        year: Number(String(x.air_date).slice(0, 4)),
        posterUrl: x.poster_path ? IMG + x.poster_path : s.posterUrl,
        overview: x.overview || s.overview,
      }))
    if (seasons.length) seasonsOf.set(s.tmdbId, seasons)
  })
  const out = list.flatMap(m => isShow(m) ? [m, ...(seasonsOf.get(m.tmdbId) || [])] : [m])
  const picks = n
    ? out.filter(m => m.kind === 'tv' && seasonsOf.has(m.tmdbId) && (n === 1 ? !m.seasonNumber : m.seasonNumber === n))
    : []
  return { out, picks }
}

/** 시즌 펼치기·시리즈 묶기 결과. picks = 검색어 끝 번호("피의게임2" "범죄도시4")가 가리키는 항목 */
interface Expanded { out: TmdbResult[]; picks: TmdbResult[] }

const cleanQuery = (q: string) => q.trim().replace(/\s+/g, ' ')

/**
 * 끝의 시즌·편 번호를 떼어 낸다. "피의게임2" · "피의 게임 시즌 2" → { base: 피의게임/피의 게임, n: 2 }.
 * TMDB 엔 "피의 게임 2" 라는 제목이 없어서 번호째로 치면 0건이다 → 본제목으로 찾고 번호는 정렬에만 쓴다.
 * 숫자로 끝나는 숫자 제목("1917" "007" "2049")은 번호로 보지 않는다(앞이 숫자면 제외).
 */
function splitSeasonHint(raw: string): { base: string; n: number | null } {
  const m = raw.match(/(?<!\d)\s*(시즌|파트|season|part)?\s*(\d{1,2})$/i)
  if (!m || m.index === undefined) return { base: raw, n: null }
  const base = raw.slice(0, m.index).trim()
  return normLoose(base) ? { base, n: Number(m[2]) } : { base: raw, n: null }
}

/** 검색 → 관련도순 → 드라마 시즌 펼치기 → 영화 시리즈 묶기. 한쪽 종류가 실패해도 나머지는 살린다 */
async function searchPipeline(kinds: ('movie' | 'tv')[], query: string): Promise<TmdbResult[]> {
  const raw = cleanQuery(query)
  if (!TMDB_KEY || !raw) return []
  const { base, n } = splitSeasonHint(raw)
  const lists = await Promise.all(kinds.flatMap(k => n
    // 번호째 원쿼리는 TMDB 1회만("범죄도시4" 같은 제목 대비) — 띄어쓰기 변형은 본제목 쪽이 한다
    ? [searchKind(k, base), fetchSearchPage(k, raw)]
    : [searchKind(k, raw)]
  ).map(p => p.catch(() => [] as TmdbResult[])))
  let list = rankTmdbResults(dedupe(lists.flat()), base)
  const picks: TmdbResult[] = []
  if (kinds.includes('tv')) {
    const s = await withSeasons(list, n)
    list = s.out; picks.push(...s.picks)
  }
  if (kinds.includes('movie')) {
    const s = await withSeries(list, base, n)
    list = s.out; picks.push(...s.picks)
  }
  if (!picks.length) return list
  // 번호가 가리키는 항목을 맨 앞으로. 영화 4편과 드라마 시즌4 가 둘 다 있으면 검색어 그대로의
  // 제목이 먼저("범죄도시4" → 《범죄도시 4》가 《범죄 도시 시즌4》보다 위), 같으면 인기순.
  // 시즌 항목은 시리즈 인기도를 물려받아서 인기순만으로는 영화가 밀린다.
  const key = (m: TmdbResult) => `${m.kind}-${m.tmdbId}-${m.seasonNumber ?? ''}`
  const pickKeys = new Set(picks.map(key))
  const front = rankTmdbResults(list.filter(m => pickKeys.has(key(m))), raw)
  return [...front, ...list.filter(m => !pickKeys.has(key(m)))]
}

/** 띄어쓰기·문장부호에 관대한 검색 (한 종류) */
export function smartSearchTmdb(kind: 'movie' | 'tv', query: string): Promise<TmdbResult[]> {
  return searchPipeline([kind], query)
}

/** TMDB 결과 → 앱 콘텐츠 타입. 영화는 그대로, tv 는 장르로 드라마/예능을 가른다. */
export function tmdbResultType(r: TmdbResult): ContentType {
  return r.kind === 'movie' ? 'movie' : tmdbTvType(r.genreIds)
}

/**
 * 영화·TV 통합 검색 (2026-08-19).
 *
 * 등록 모달에서 카테고리를 먼저 고르게 하던 단계를 없애면서 필요해졌다. 예전엔 고른
 * 카테고리로 `movie` / `tv` 중 하나만 쳤다 — 그건 TMDB 사정이지 등록하는 사람의 관심사가
 * 아니다. 둘 다 쳐서 인기순으로 섞고, 드라마/예능 구분은 `tmdbResultType` 이 장르로 정한다.
 *
 * 한쪽이 실패해도 다른 쪽 결과는 살린다(검색이 통째로 죽는 것보다 낫다).
 */
export function searchTmdbAll(query: string): Promise<TmdbResult[]> {
  // 시즌·시리즈 묶기는 합쳐서 정렬한 **뒤에** 한다 — 먼저 묶으면 재정렬이 묶음을 흩어 놓는다
  return searchPipeline(['movie', 'tv'], query)
}
