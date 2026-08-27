import { describe, it, expect, vi } from 'vitest'
import type { User } from '@/types'

// level.ts → dataService → supabaseClient(createClient) 까지 딸려온다.
// createClient 는 Node 20 에서 WebSocket 이 없어 import 만으로 터진다.
// 여기서 검증하는 순수 함수(computeLevel·computeXp·qualityXp·isExpert)는 DS 를 쓰지 않으므로
// 모듈째 갈아끼워 import 사슬을 끊는다.
vi.mock('@/api/dataService', () => ({
  getDiscussions: () => [],
  getDiscussionsByAuthor: () => [],
  getComments: () => [],
  getWatched: () => [],
  getUserWatched: () => [],
  getUserById: () => null,
  isAccountId: () => false,
}))

const { LEVEL_TIERS, XP_RULE, computeLevel, computeXp, qualityXp, isExpert } = await import('@/utils/level')

const user = (over: Partial<User> = {}): User => ({
  id: 'u1', nickname: '테스터', email: 't@t.com', role: 'user', banned: false,
  createdAt: new Date().toISOString(), ...over,
})

describe('활동 레벨 티어 (백수 → 한량 → 여포)', () => {
  it('3단계다 — 그 위 좋문가는 XP 티어가 아니다', () => {
    expect(LEVEL_TIERS.map(t => t.name)).toEqual(['백수', '한량', '여포'])
  })

  it.each([
    [0, '백수'], [1, '백수'], [24, '백수'],
    [25, '한량'], [26, '한량'], [89, '한량'],
    [90, '여포'], [10000, '여포'],
  ])('XP %i → %s', (xp, name) => {
    expect(computeLevel(xp).tier.name).toBe(name)
  })

  it('최고 티어에서는 next 가 없고 진행도가 1이다', () => {
    const top = computeLevel(999)
    expect(top.next).toBeNull()
    expect(top.progress).toBe(1)
    expect(top.toNext).toBe(0)
  })
})

describe('무발화 상한 — 글 없이 여포가 되면 안 된다', () => {
  // 2026-08-27 간소화 이전엔 상한 합이 140 이라 로그인만 꾸준히 해도 상위 티어에 닿았다.
  // 이 테스트가 깨지면 상한을 올렸거나 여포 기준을 낮춘 것이다. 둘 다 설계 의도를 되돌린다.
  const passiveCeiling = XP_RULE.watchedCap + XP_RULE.commentCap + XP_RULE.attendanceCap

  it('시청·댓글·출석만으로 얻을 수 있는 XP 합이 여포 기준보다 낮다', () => {
    const yeopo = LEVEL_TIERS[2].min
    expect(passiveCeiling).toBeLessThan(yeopo)
  })

  it('상한을 다 채워도 한량까지만 간다', () => {
    const xp = computeXp({
      posts: 0, ratedPosts: 0, longPosts: 0,
      watched: 9999, comments: 9999, receivedNetLikes: 0,
      accountAgeDays: 9999, visitDays: 9999, streak: 0,
    })
    expect(xp).toBe(passiveCeiling)
    expect(computeLevel(xp).tier.name).toBe('한량')
  })
})

describe('받은 추천 품질 곡선', () => {
  it('증가폭이 줄어든다 (같은 10개를 더 받아도 뒤로 갈수록 덜 오른다)', () => {
    const first10 = qualityXp(10) - qualityXp(0)
    const next10 = qualityXp(20) - qualityXp(10)
    expect(next10).toBeLessThan(first10)
  })

  it('아무리 많이 받아도 상한이 있다', () => {
    expect(qualityXp(100)).toBe(qualityXp(100000))
  })

  it('음수는 0 으로 본다', () => {
    expect(qualityXp(-5)).toBe(0)
  })
})

describe('좋문가는 관리자 지정', () => {
  it('expert 플래그가 있어야 좋문가다', () => {
    expect(isExpert(user({ expert: true }))).toBe(true)
    expect(isExpert(user({ expert: false }))).toBe(false)
    expect(isExpert(user())).toBe(false)          // 마이그레이션 전 undefined
  })

  it('정지된 계정은 배지를 잃는다', () => {
    expect(isExpert(user({ expert: true, banned: true }))).toBe(false)
  })

  it('XP 가 아무리 높아도 저절로 좋문가가 되지 않는다', () => {
    expect(computeLevel(99999).tier.name).toBe('여포')
    expect(isExpert(user({ expert: false }))).toBe(false)
  })
})
