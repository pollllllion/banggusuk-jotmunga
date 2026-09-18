import type { Discussion } from '@/types'

/**
 * 인기글(지금 뜨는 글) 점수 — 해커뉴스식 "참여도 가중합 ÷ 시간감쇠".
 *
 *   engagement = views*1 + likes*3 + comments*5
 *   score      = engagement / (경과시간h + 2)^GRAVITY
 *
 * 왜 이렇게 하나:
 *  - 추천·댓글은 조회보다 귀한 행동이라 가중치를 크게 준다.
 *  - 시간감쇠가 없으면 오래된 글이 계속 상단을 차지해 게시판이 굳는다.
 *
 * ★ 2026-09-18 — 갓 올라온 글이 쓰자마자 인기글이 되던 것을 막았다 ★
 * 예전엔 분자에 FRESH_BONUS(5)를 더해 참여 0인 새 글도 노출시켰다. 그런데 시간감쇠가 세서
 * (2h→26h 에 분모 78배) 참여 0인 새 글(1.54점)이 하루 된 댓글 4개짜리 글(0.1점대)을 늘 이겼다.
 * "인기"글인데 아무도 안 읽은 글이 맨 위에 서는 셈이다. 새 글은 어차피 최신순 목록 맨 위에 나온다.
 *  → 보너스를 없애고, 참여가 TRENDING_MIN_ENGAGEMENT 에 못 미치는 글은 후보에서 뺀다.
 *    (15 = 댓글 3개, 또는 댓글 2개 + 조회 5 쯤. 글쓴이 혼자 들락거린 조회수로는 못 넘는다)
 *    자격을 갖춘 글이 limit 보다 적으면 인기글이 그만큼 적게 나온다 — 억지로 채우지 않는다.
 */

export const TRENDING_WINDOW_DAYS = 7
export const TRENDING_W = { view: 1, like: 3, comment: 5 }
export const TRENDING_GRAVITY = 1.7
export const TRENDING_MIN_ENGAGEMENT = 15

/** 점수 내림차순, 동점이면 최신순 */
function byScore(commentCountOf: (post: Discussion) => number, now: number) {
  return <T extends { post: Discussion }>(a: T, b: T) =>
    trendingScore(b.post, commentCountOf(b.post), now) - trendingScore(a.post, commentCountOf(a.post), now) ||
    new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime()
}

export function engagementOf(post: Discussion, commentCount: number): number {
  return (post.views || 0) * TRENDING_W.view +
    (post.likes?.length || 0) * TRENDING_W.like +
    commentCount * TRENDING_W.comment
}

export function trendingScore(
  post: Discussion,
  commentCount: number,
  now: number = Date.now(),
): number {
  const engagement = engagementOf(post, commentCount)
  const ageHours = Math.max(0, (now - new Date(post.createdAt).getTime()) / 3_600_000)
  return engagement / Math.pow(ageHours + 2, TRENDING_GRAVITY)
}

/**
 * 인기글 정렬. 후보는 참여가 TRENDING_MIN_ENGAGEMENT 이상인 글뿐이다.
 * 최근 TRENDING_WINDOW_DAYS 일 글을 우선으로 삼고, 그것만으로 limit 을 못 채우면
 * 그 이전 글 중 점수 높은 순으로 뒤를 채운다.
 */
export function pickTrending<T extends { post: Discussion }>(
  items: T[],
  commentCountOf: (post: Discussion) => number,
  limit = 5,
  now: number = Date.now(),
): T[] {
  const cutoff = now - TRENDING_WINDOW_DAYS * 86_400_000
  const sort = byScore(commentCountOf, now)

  const eligible = items.filter(x => engagementOf(x.post, commentCountOf(x.post)) >= TRENDING_MIN_ENGAGEMENT)

  const recent = eligible.filter(x => new Date(x.post.createdAt).getTime() >= cutoff).sort(sort)
  if (recent.length >= limit) return recent.slice(0, limit)

  const older = eligible.filter(x => new Date(x.post.createdAt).getTime() < cutoff).sort(sort)
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
