/**
 * 작품 평점 집계 규칙 — **한 곳에만 둔다.**
 *
 * 별점이 두 곳에 쌓인다: 토론글(discussions.rating)과 본 작품(watched.rating).
 * 둘을 어떻게 합치느냐가 규칙이고, 이 규칙이 세 군데(작품방 화면 · 캐시 재집계 ·
 * DB 트리거)에서 같아야 한다. 2026-09-16 에 실제로 갈렸다 — 목록·프리렌더는
 * '4.0 · 별점 1개'인데 작품방만 '아직 별점 없음'이라고 말했다. 작품방이 토론글
 * 별점만 세고 있었기 때문이다.
 *
 * DB 쪽 같은 규칙: supabase/migration_watched_rating.sql 의 recompute_content_rating.
 */

/** 별점 단 토론글 (이미 이 작품 것만 골라 놓은 것) */
export interface RatedPost { authorId: string | null; rating?: number | null }
/** 본 작품에서 바로 매긴 별점 (이미 이 작품 것만 골라 놓은 것) */
export interface RatedWatch { userId: string; rating?: number | null }

/**
 * 토론글 별점 + 본 작품 별점을 한 목록으로 합친다.
 *
 * **같은 사람이 둘 다 가지고 있으면 토론글 쪽만 센다.** 글로 남긴 평가가 더 무겁고,
 * 1작품 1별점 규칙과도 맞는다. 유동닉 글(authorId=null)의 별점은 묶을 상대가 없어
 * 그대로 센다 — 로그인한 사람의 본 작품 별점과 짝지을 방법이 없기 때문이다.
 */
export function mergeContentRatings(posts: RatedPost[], watched: RatedWatch[]): number[] {
  const rated = posts.filter(p => p.rating != null)
  const ratedAuthors = new Set(rated.map(p => p.authorId).filter(Boolean))
  const fromWatched = watched
    .filter(w => w.rating != null && !ratedAuthors.has(w.userId))
    .map(w => w.rating as number)
  return [...rated.map(p => p.rating as number), ...fromWatched]
}

/** 평균(소수 한 자리)과 개수. 별점이 없으면 0/0 */
export function summarizeRatings(scores: number[]): { avg: number; count: number } {
  const count = scores.length
  if (!count) return { avg: 0, count: 0 }
  return { avg: Math.round((scores.reduce((s, r) => s + r, 0) / count) * 10) / 10, count }
}
