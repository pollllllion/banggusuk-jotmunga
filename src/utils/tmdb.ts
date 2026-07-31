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
export function tmdbContentId(type: ContentType, tmdbId: number): string {
  return type === 'movie' ? `tmdb-mv-${tmdbId}` : `tmdb-dr-${tmdbId}`
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
}

function mapResults(results: any[]): TmdbResult[] {
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
    }
  })
}

/** TMDB 검색 1페이지 */
async function fetchSearchPage(kind: 'movie' | 'tv', query: string, page = 1): Promise<TmdbResult[]> {
  const url = new URL(`${BASE}/search/${kind}`)
  url.searchParams.set('api_key', TMDB_KEY!)
  url.searchParams.set('language', 'ko-KR')
  url.searchParams.set('query', query)
  url.searchParams.set('include_adult', 'false')
  url.searchParams.set('page', String(page))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TMDB ${kind} 검색 실패 (${res.status})`)
  const json = await res.json()
  return mapResults(json.results)
}

/** 공백·문장부호(콜론·하이픈 등) 모두 제거한 느슨한 정규화 (한글/영문/숫자만 남김) */
const normLoose = (s: string) => (s || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()

/**
 * 띄어쓰기·문장부호에 관대한 검색.
 *  1) 원쿼리로 검색 → 결과 있으면 그대로 반환(대부분 여기서 끝, API 1회).
 *  2) 결과 0 + 공백 없음 + 2글자 이상이면: 짧은 접두어로 넓게 받아(최대 2페이지)
 *     공백·문장부호 무시 부분일치로 필터. (폴백 시에만 2~5회 호출)
 *  예) "블러드다이아"→"블러드 다이아몬드", "어벤져스인피니티"→"어벤져스: 인피니티 워"
 */
export async function smartSearchTmdb(kind: 'movie' | 'tv', query: string): Promise<TmdbResult[]> {
  if (!TMDB_KEY) return []
  const raw = query.trim()
  if (!raw) return []
  const direct = await fetchSearchPage(kind, raw)
  if (direct.length) return direct
  if (/\s/.test(raw) || raw.length < 2) return []

  const qn = normLoose(raw)
  // 접두어 길이 후보: 짧은 쿼리는 1~2글자, 길수록 첫 단어(≈4글자)까지 시도. 첫 히트에서 종료.
  const seeds = raw.length <= 3 ? [1, 2] : raw.length <= 5 ? [2, 3] : [2, 3, 4]
  for (const n of seeds) {
    let pool: TmdbResult[] = []
    for (let p = 1; p <= 2; p++) {
      const rp = await fetchSearchPage(kind, raw.slice(0, n), p)
      pool = pool.concat(rp)
      if (rp.length < 20) break
    }
    const hit = pool.filter(m => normLoose(m.title).includes(qn) || normLoose(m.originalTitle).includes(qn))
    if (hit.length) {
      const seen = new Set<number>()
      return hit.filter(m => !seen.has(m.tmdbId) && seen.add(m.tmdbId))
    }
  }
  return []
}
