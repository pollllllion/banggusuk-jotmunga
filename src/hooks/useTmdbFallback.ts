import { useEffect, useState } from 'react'
import * as DS from '@/api/dataService'
import {
  smartSearchTmdb, isSearchableQuery, tmdbEnabled, tmdbContentId, tmdbTvType,
  type TmdbResult,
} from '@/utils/tmdb'
import type { Content, ContentType } from '@/types'

/** TMDB 검색 결과 한 건 + 우리 쪽 작품 종류 */
export type TmdbHit = { r: TmdbResult; type: ContentType }

/** 영화·TV 결과를 번갈아 섞는다 (한쪽이 목록을 다 잡아먹지 않게) */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i])
    if (b[i]) out.push(b[i])
  }
  return out
}

/**
 * **아직 우리 DB 에 없는 작품**을 TMDB 에서 한 번 더 찾는다.
 *
 * 우리 DB 는 개봉·공개 캘린더용이라 2026년 작품 위주다. '피의 게임 1~3' 같은 옛 시즌이나
 * 한참 전 영화는 우리 표에 없어서, 여기가 없으면 검색 결과가 0건으로 끝난다.
 *
 * 헤더 통합검색과 작품 둘러보기가 같이 쓴다 — 두 곳에 같은 디바운스·경합 처리를 복붙해 두면
 * 한쪽만 고쳐지는 날이 온다(2026-09-16 에 둘째 사본이 생길 뻔해 여기로 뺐다).
 *
 * @param query 사용자가 친 그대로. 짧거나 뜻 없는 입력은 알아서 건너뛴다(isSearchableQuery)
 * @param limit 돌려줄 최대 건수
 */
export function useTmdbFallback(query: string, limit = 6): { hits: TmdbHit[]; loading: boolean } {
  const [hits, setHits] = useState<TmdbHit[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!tmdbEnabled || !isSearchableQuery(q)) { setHits([]); setLoading(false); return }
    // alive 플래그로 늦게 도착한 이전 입력의 응답이 최신 결과를 덮지 않게 막는다
    let alive = true
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const [movies, tvs] = await Promise.all([smartSearchTmdb('movie', q), smartSearchTmdb('tv', q)])
        if (!alive) return
        const merged = interleave<TmdbHit>(
          movies.map(r => ({ r, type: 'movie' as ContentType })),
          tvs.map(r => ({ r, type: tmdbTvType(r.genreIds) })),
        )
        // 이미 DB 에 있는 작품은 위쪽 결과에 나오므로 뺀다 (시즌별 행이 있는 경우 포함)
        setHits(merged
          .filter(h => !DS.hasTmdbContent(h.type === 'movie' ? 'movie' : 'tv', h.r.tmdbId, h.r.seasonNumber))
          .slice(0, limit))
      } catch {
        if (alive) setHits([])   // 실시간이라 키마다 토스트는 안 띄운다
      } finally {
        if (alive) setLoading(false)
      }
    }, 350)
    return () => { alive = false; clearTimeout(timer) }
  }, [query, limit])

  return { hits, loading }
}

/**
 * TMDB 결과를 우리 표의 한 행으로 만든다 — 이미 있으면 그 행을 그대로 돌려준다.
 * 누른 쪽에서 이 작품으로 보내면 된다(`/content/${content.id}`).
 */
export function ensureFromTmdb(hit: TmdbHit): Promise<Content> {
  return DS.ensureContent({
    contentId: tmdbContentId(hit.type, hit.r.tmdbId, hit.r.seasonNumber),
    type: hit.type,
    title: hit.r.title,
    posterUrl: hit.r.posterUrl,
    releaseYear: hit.r.year,
    synopsis: hit.r.overview,
  })
}
