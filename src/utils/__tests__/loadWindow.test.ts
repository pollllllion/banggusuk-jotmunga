import { describe, it, expect } from 'vitest'

/**
 * 1단계 로드가 받아 올 공개일 범위 계산.
 * cache.ts 안의 windowRange 와 같은 규칙 — 여기가 틀리면 캘린더가 빈 달로 뜬다.
 * (cache.ts 는 supabase 를 import 해서 테스트에서 못 부른다 — 규칙만 복제해 고정한다)
 */
const BACK = 1, FWD = 2
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function windowRange(base: Date) {
  return {
    from: key(new Date(base.getFullYear(), base.getMonth() - BACK, 1)),
    to: key(new Date(base.getFullYear(), base.getMonth() + FWD + 1, 0)),
  }
}

describe('1단계 로드 범위', () => {
  it('이번 달 기준 지난달 1일 ~ 두 달 뒤 말일', () => {
    expect(windowRange(new Date(2026, 8, 15))).toEqual({ from: '2026-08-01', to: '2026-11-30' })
  })

  it('연말을 넘어가도 연도가 맞는다', () => {
    expect(windowRange(new Date(2026, 11, 1))).toEqual({ from: '2026-11-01', to: '2027-02-28' })
  })

  it('연초에서 뒤로 가도 전년도로 넘어간다', () => {
    expect(windowRange(new Date(2026, 0, 20))).toEqual({ from: '2025-12-01', to: '2026-03-31' })
  })

  it('윤년 2월 말일을 29일로 잡는다', () => {
    // 2028 은 윤년 — 두 달 뒤가 2월이 되는 2027-12 기준
    expect(windowRange(new Date(2027, 11, 5)).to).toBe('2028-02-29')
  })

  it('보고 있는 달이 이번 달이 아니어도(?ym=) 그 달을 덮는다', () => {
    const r = windowRange(new Date(2027, 5, 1))   // 2027-06
    expect(r.from <= '2027-06-01').toBe(true)
    expect(r.to >= '2027-06-30').toBe(true)
  })
})
