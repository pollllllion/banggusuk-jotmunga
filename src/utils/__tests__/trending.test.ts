import { describe, it, expect } from 'vitest'
import { pickTrending, promoteTrending, trendingScore } from '@/utils/trending'
import type { Discussion } from '@/types'

const NOW = new Date('2026-08-07T00:00:00Z').getTime()
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

function post(id: string, o: Partial<Discussion> = {}): Discussion {
  return {
    id, contentId: 'c', authorId: null, body: '본문', likes: [],
    createdAt: hoursAgo(1), ...o,
  } as Discussion
}

describe('trendingScore', () => {
  it('참여가 같으면 최신 글이 높다', () => {
    const fresh = trendingScore(post('a', { createdAt: hoursAgo(1) }), 0, NOW)
    const old = trendingScore(post('b', { createdAt: hoursAgo(48) }), 0, NOW)
    expect(fresh).toBeGreaterThan(old)
  })

  it('댓글이 추천보다, 추천이 조회보다 크게 반영된다', () => {
    const byView = trendingScore(post('v', { views: 1 }), 0, NOW)
    const byLike = trendingScore(post('l', { likes: ['u1'] }), 0, NOW)
    const byComment = trendingScore(post('c', {}), 1, NOW)
    expect(byComment).toBeGreaterThan(byLike)
    expect(byLike).toBeGreaterThan(byView)
  })

  it('참여가 0이어도 점수가 0은 아니다 (갓 올라온 글 노출)', () => {
    expect(trendingScore(post('n'), 0, NOW)).toBeGreaterThan(0)
  })

  it('참여가 충분하면 더 오래된 글도 최신 글을 이긴다', () => {
    const hot = trendingScore(post('h', { createdAt: hoursAgo(6), views: 200, likes: ['a', 'b'] }), 5, NOW)
    const empty = trendingScore(post('e', { createdAt: hoursAgo(1) }), 0, NOW)
    expect(hot).toBeGreaterThan(empty)
  })
})

describe('pickTrending', () => {
  const wrap = (p: Discussion) => ({ post: p })

  it('점수 내림차순으로 limit 개만 돌려준다', () => {
    const items = [
      wrap(post('a', { createdAt: hoursAgo(2) })),
      wrap(post('b', { createdAt: hoursAgo(2), views: 50 })),
      wrap(post('c', { createdAt: hoursAgo(2), likes: ['u1', 'u2'] })),
    ]
    const top = pickTrending(items, () => 0, 2, NOW)
    expect(top.map(t => t.post.id)).toEqual(['b', 'c'])
  })

  it('최근 글로 limit 을 못 채우면 오래된 글로 뒤를 채운다', () => {
    const items = [
      wrap(post('old1', { createdAt: hoursAgo(24 * 30) })),
      wrap(post('old2', { createdAt: hoursAgo(24 * 40) })),
      wrap(post('new1', { createdAt: hoursAgo(3) })),
    ]
    const top = pickTrending(items, () => 0, 5, NOW)
    expect(top).toHaveLength(3)
    expect(top[0].post.id).toBe('new1')
  })

  it('최근 글만으로 limit 이 차면 오래된 글은 참여가 많아도 빠진다', () => {
    const recent = Array.from({ length: 5 }, (_, i) =>
      wrap(post(`r${i}`, { createdAt: hoursAgo(i + 1) })))
    const items = [...recent, wrap(post('ancient', { createdAt: hoursAgo(24 * 60), views: 9999 }))]
    const top = pickTrending(items, () => 0, 5, NOW)
    expect(top.some(t => t.post.id === 'ancient')).toBe(false)
  })

  it('채워 넣는 오래된 글은 항상 최근 글 뒤에 온다 (참여가 많아도)', () => {
    const items = [
      wrap(post('recent', { createdAt: hoursAgo(2) })),
      wrap(post('ancientHot', { createdAt: hoursAgo(24 * 60), views: 9999, likes: ['a', 'b', 'c'] })),
    ]
    const top = pickTrending(items, () => 20, 5, NOW)
    expect(top.map(t => t.post.id)).toEqual(['recent', 'ancientHot'])
  })

  it('동점이면 최신 글이 앞선다', () => {
    const items = [
      wrap(post('older', { createdAt: hoursAgo(5) })),
      wrap(post('newer', { createdAt: hoursAgo(4) })),
    ]
    expect(pickTrending(items, () => 0, 2, NOW)[0].post.id).toBe('newer')
  })
})

describe('promoteTrending — 인기글을 한 목록 위로', () => {
  const rows = [
    // 시간감쇠(GRAVITY 1.7)가 세서, 나흘 전 글이 한 시간 전 글을 이기려면
    // 참여가 수천 단위여야 한다. 그 지점을 넘긴 글을 일부러 넣었다.
    { post: post('old-hot', { createdAt: hoursAgo(100), views: 5000, likes: ['a', 'b'] }) },
    { post: post('new1', { createdAt: hoursAgo(1) }) },
    { post: post('new2', { createdAt: hoursAgo(2) }) },
    { post: post('new3', { createdAt: hoursAgo(3) }) },
  ]
  const noComments = () => 0

  it('한 글은 한 번만 나온다 — 위로 올라간 글은 아래에서 빠진다', () => {
    const out = promoteTrending(rows, noComments, 2, NOW)
    const ids = out.map(x => x.post.id)
    expect(ids).toHaveLength(rows.length)
    expect(new Set(ids).size).toBe(rows.length)
  })

  it('앞 limit 개가 인기글이고 hot 표시가 붙는다', () => {
    const out = promoteTrending(rows, noComments, 2, NOW)
    expect(out.slice(0, 2).every(x => x.hot)).toBe(true)
    expect(out.slice(2).every(x => !x.hot)).toBe(true)
  })

  it('참여가 많은 옛 글도 위로 올라온다 — 그게 이 기능의 요지다', () => {
    const out = promoteTrending(rows, noComments, 2, NOW)
    expect(out.map(x => x.post.id)).toContain('old-hot')
    expect(out.findIndex(x => x.post.id === 'old-hot')).toBeLessThan(2)
  })

  it('limit 이 글 수보다 크면 전부 hot 이고 잃는 글이 없다', () => {
    const out = promoteTrending(rows, noComments, 99, NOW)
    expect(out).toHaveLength(rows.length)
    expect(out.every(x => x.hot)).toBe(true)
  })

  it('빈 목록도 빈 목록으로 돌아온다', () => {
    expect(promoteTrending([], noComments, 10, NOW)).toEqual([])
  })
})
