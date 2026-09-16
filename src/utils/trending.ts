import type { Discussion } from '@/types'

/**
 * 인기글(지금 뜨는 글) 점수 — 해커뉴스식 "참여도 가중합 ÷ 시간감쇠".
 *
 *   engagement = views*1 + likes*3 + comments*5
 *   score      = (engagement + FRESH_BONUS) / (경과시간h + 2)^GRAVITY
 *
 * 왜 이렇게 하나:
 *  - 추천·댓글은 조회보다 귀한 행동이라 가중치를 크게 준다.
 *  - 시간감쇠가 없으면 오래된 글이 계속 상단을 차지해 게시판이 굳는다.
 *  - FRESH_BONUS 는 참여가 아직 0인 갓 올라온 글도 잠깐은 노출시켜 준다
 *    (분자가 0이면 무슨 짓을 해도 순위가 안 잡힌다).
 */

export const TRENDING_WINDOW_DAYS = 7
export const TRENDING_W = { view: 1, like: 3, comment: 5 }
export const TRENDING_GRAVITY = 1.7
export const TRENDING_FRESH_BONUS = 5

/** 점수 내림차순, 동점이면 최신순 */
function byScore(commentCountOf: (post: Discussion) => number, now: number) {
  return <T extends { post: Discussion }>(a: T, b: T) =>
    trendingScore(b.post, commentCountOf(b.post), now) - trendingScore(a.post, commentCountOf(a.post), now) ||
    new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime()
}

export function trendingScore(
  post: Discussion,
  commentCount: number,
  now: number = Date.now(),
): number {
  const engagement =
    (post.views || 0) * TRENDING_W.view +
    (post.likes?.length || 0) * TRENDING_W.like +
    commentCount * TRENDING_W.comment
  const ageHours = Math.max(0, (now - new Date(post.createdAt).getTime()) / 3_600_000)
  return (engagement + TRENDING_FRESH_BONUS) / Math.pow(ageHours + 2, TRENDING_GRAVITY)
}

/**
 * 인기글 정렬. 최근 TRENDING_WINDOW_DAYS 일 글을 우선 후보로 삼고,
 * 그것만으로 limit 을 못 채우면 그 이전 글 중 점수 높은 순으로 뒤를 채운다.
 * (섹션이 늘 같은 개수로 차서 자리가 들쭉날쭉하지 않게)
 */
export function pickTrending<T extends { post: Discussion }>(
  items: T[],
  commentCountOf: (post: Discussion) => number,
  limit = 5,
  now: number = Date.now(),
): T[] {
  const cutoff = now - TRENDING_WINDOW_DAYS * 86_400_000
  const sort = byScore(commentCountOf, now)

  const recent = items.filter(x => new Date(x.post.createdAt).getTime() >= cutoff).sort(sort)
  if (recent.length >= limit) return recent.slice(0, limit)

  const older = items.filter(x => new Date(x.post.createdAt).getTime() < cutoff).sort(sort)
  return [...recent, ...older].slice(0, limit)
}

/**
 * 인기글을 **목록 위로 끌어올린다** — 따로 떼어 놓지 않고 한 목록에 섞는다.
 *
 * 2026-09-16 이전에는 '지금 뜨는 글' 칸과 '전체 글' 칸이 따로 있었고, 인기글은
 * 두 곳에 **똑같이 두 번** 나왔다. 게시판을 훑는 사람 입장에서는 같은 글을 두 번
 * 지나치는 셈이고, 칸이 둘이라 어디까지 봤는지도 헷갈린다.
 * 이제 목록은 하나다: 앞 limit 개가 인기글이고 그 뒤로 최신순이 이어진다.
 * **한 글은 한 번만 나온다** — 위로 올라온 글은 아래 최신순에서 빠진다.
 *
 * 끌어올린 글에는 hot 표시를 붙여 돌려준다. 안 그러면 "왜 오래된 글이 맨 위에 있지"가 된다.
 */
export function promoteTrending<T extends { post: Discussion }>(
  items: T[],
  commentCountOf: (post: Discussion) => number,
  limit = 10,
  now: number = Date.now(),
): (T & { hot: boolean })[] {
  const hot = pickTrending(items, commentCountOf, limit, now)
  const hotIds = new Set(hot.map(x => x.post.id))
  const rest = items.filter(x => !hotIds.has(x.post.id))
  return [
    ...hot.map(x => ({ ...x, hot: true })),
    ...rest.map(x => ({ ...x, hot: false })),
  ]
}
