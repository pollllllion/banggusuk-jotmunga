/**
 * TMDB 검색 (등록 모달용 — 영화/드라마/예능 제목 검색)
 * 키는 VITE_TMDB_API_KEY (없으면 검색 비활성, 수기 입력으로 유도).
 * TMDB v3 키는 클라이언트 사용을 전제로 한 읽기 전용 키.
 */
const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined
const BASE = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p/w500'

export const tmdbEnabled = Boolean(TMDB_KEY)

export interface TmdbResult {
  tmdbId: number
  title: string
  year: number | null
  posterUrl: string | null
  overview: string
  genreIds: number[]
}

/** kind: 'movie' = 영화, 'tv' = 드라마·예능 */
export async function searchTmdb(kind: 'movie' | 'tv', query: string): Promise<TmdbResult[]> {
  if (!TMDB_KEY || !query.trim()) return []
  const url = new URL(`${BASE}/search/${kind}`)
  url.searchParams.set('api_key', TMDB_KEY)
  url.searchParams.set('language', 'ko-KR')
  url.searchParams.set('query', query.trim())
  url.searchParams.set('include_adult', 'false')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TMDB ${kind} 검색 실패 (${res.status})`)
  const json = await res.json()
  return (json.results || []).map((m: any): TmdbResult => {
    const date = m.release_date || m.first_air_date || ''
    return {
      tmdbId: m.id,
      title: m.title || m.name || '(제목 없음)',
      year: date ? Number(date.slice(0, 4)) : null,
      posterUrl: m.poster_path ? IMG + m.poster_path : null,
      overview: m.overview || '',
      genreIds: m.genre_ids || [],
    }
  })
}
