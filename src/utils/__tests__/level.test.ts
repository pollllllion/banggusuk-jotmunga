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

const { LEVEL_TIERS, LEVEL_MINS, LEVELS_PER_TIER, MAX_LEVEL, XP_RULE, computeLevel, computeXp, qualityXp, isExpert } = await import('@/utils/level')

const user = (over: Partial<User> = {}): User => ({
  id: 'u1', nickname: '테스터', email: 't@t.com', role: 'user', banned: false,
  createdAt: new Date().toISOString(), ...over,
})

describe('활동 레벨 티어 (백수 → 한량 → 여포)', () => {
  it('3단계다 — 그 위 좋문가는 XP 티어가 아니다', () => {
    expect(LEVEL_TIERS.map(t => t.name)).toEqual(['백수', '한량', '여포'])
  })

  it.each([
    [0, '백수'], [1, '백수'], [79, '백수'],
    [80, '한량'], [81, '한량'], [309, '한량'],
    [310, '여포'], [10000, '여포'],
  ])('XP %i → %s', (xp, name) => {
    expect(computeLevel(xp).tier.name).toBe(name)
  })

  it('최고 등급에서는 다음 등급이 없다 — 진행도는 이제 레벨 기준이라 만렙에서만 1이다', () => {
    const top = computeLevel(1500)         // 여포지만 아직 Lv.29
    expect(top.next).toBeNull()
    expect(top.toNext).toBe(0)
    expect(top.progress).toBeLessThan(1)
    const max = computeLevel(99999)
    expect(max.progress).toBe(1)
    expect(max.toNextLevel).toBe(0)
  })
})

describe('숫자 레벨 Lv.1~30 (등급당 10칸)', () => {
  it('등급 경계와 레벨 경계가 어긋나지 않는다 — Lv.11 = 한량, Lv.21 = 여포', () => {
    expect(MAX_LEVEL).toBe(LEVEL_TIERS.length * LEVELS_PER_TIER)
    LEVEL_TIERS.forEach((t, i) => expect(LEVEL_MINS[i * LEVELS_PER_TIER]).toBe(t.min))
  })

  it('기준 XP 는 계속 오르고, 한 칸의 폭은 줄어들지 않는다 (위로 갈수록 어렵다)', () => {
    const gaps = LEVEL_MINS.slice(1).map((m, i) => m - LEVEL_MINS[i])
    gaps.forEach(g => expect(g).toBeGreaterThan(0))
    gaps.slice(1).forEach((g, i) => expect(g).toBeGreaterThanOrEqual(gaps[i]))
  })

  it.each([
    [0, 1, 0], [4, 1, 0], [5, 2, 1], [79, 10, 9],
    [80, 11, 0], [309, 20, 9],
    [310, 21, 0], [349, 21, 0], [350, 22, 1], [804, 26, 5], [805, 27, 6],
    [1564, 29, 8], [1565, 30, 9], [99999, 30, 9],
  ])('XP %i → Lv.%i (등급 안 %i번째 칸)', (xp, level, step) => {
    const info = computeLevel(xp)
    expect(info.level).toBe(level)
    expect(info.step).toBe(step)
    // 숫자 레벨이 속한 등급과 XP 로 정한 등급이 늘 같아야 한다
    expect(Math.ceil(info.level / LEVELS_PER_TIER) - 1).toBe(info.tierIndex)
  })

  it('만렙은 Lv.30 하나뿐이다 — 빨간 마크', () => {
    expect(computeLevel(1564).isMax).toBe(false)
    expect(computeLevel(1565).isMax).toBe(true)
  })

  it('진행바는 다음 **레벨**까지다', () => {
    const mid = computeLevel(326)         // Lv.21(310) → Lv.22(350) 의 중간쯤
    expect(mid.toNextLevel).toBe(24)
    expect(mid.progress).toBeCloseTo(16 / 40)
  })

  it('여포 안에서는 칸마다 폭이 **눈에 띄게** 불어난다 — 매 칸 직전의 1.25배 이상', () => {
    const yeopo = LEVEL_MINS.slice(2 * LEVELS_PER_TIER)
    const gaps = yeopo.slice(1).map((m, i) => m - yeopo[i])
    gaps.slice(1).forEach((g, i) => expect(g / gaps[i]).toBeGreaterThanOrEqual(1.25))
  })

  it('글 없이 얻는 XP 와 추천 상한을 다 채워도 한량 초입(Lv.13)을 못 넘는다', () => {
    const noPosts = XP_RULE.watchedCap + XP_RULE.commentCap + XP_RULE.attendanceCap + qualityXp(100000)
    expect(computeLevel(noPosts).level).toBeLessThanOrEqual(13)
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

  it('상한을 다 채워도 백수를 못 벗어난다 — 한량부터는 글을 써야 한다 (2026-09-17)', () => {
    const xp = computeXp({
      posts: 0, ratedPosts: 0, longPosts: 0,
      watched: 9999, comments: 9999, receivedNetLikes: 0,
      accountAgeDays: 9999, visitDays: 9999, streak: 0,
    })
    expect(xp).toBe(passiveCeiling)
    expect(computeLevel(xp).tier.name).toBe('백수')
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
