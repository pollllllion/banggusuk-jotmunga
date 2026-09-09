import { describe, it, expect } from 'vitest'
import { parseYm, formatYm } from '../calendarMonth'

/**
 * ?ym= 은 남이 만들어 준 주소일 수도 있다(공유 링크·손으로 친 주소).
 * 이상한 값이 들어와도 화면이 깨지지 않고 '이번 달'로 떨어져야 한다.
 */
describe('parseYm', () => {
  it('정상 값', () => {
    expect(parseYm('2026-09')).toEqual({ y: 2026, m: 8 })   // m 은 0-based
    expect(parseYm('2026-01')).toEqual({ y: 2026, m: 0 })
    expect(parseYm('2026-12')).toEqual({ y: 2026, m: 11 })
  })

  it('앞뒤 공백은 무시한다', () => {
    expect(parseYm(' 2026-09 ')).toEqual({ y: 2026, m: 8 })
  })

  it('없거나 빈 값이면 null', () => {
    expect(parseYm(null)).toBeNull()
    expect(parseYm(undefined)).toBeNull()
    expect(parseYm('')).toBeNull()
  })

  it('형식이 어긋나면 null', () => {
    for (const bad of ['2026-9', '202609', '2026/09', '26-09', '2026-09-01', 'abcd-ef', '2026-']) {
      expect(parseYm(bad), bad).toBeNull()
    }
  })

  it('달 범위를 벗어나면 null', () => {
    expect(parseYm('2026-00')).toBeNull()
    expect(parseYm('2026-13')).toBeNull()
    expect(parseYm('2026-99')).toBeNull()
  })

  it('말도 안 되는 연도는 null', () => {
    expect(parseYm('0001-05')).toBeNull()
    expect(parseYm('9999-05')).toBeNull()
  })
})

describe('formatYm', () => {
  it('한 자리 달을 0으로 채운다', () => {
    expect(formatYm({ y: 2026, m: 0 })).toBe('2026-01')
    expect(formatYm({ y: 2026, m: 8 })).toBe('2026-09')
    expect(formatYm({ y: 2026, m: 11 })).toBe('2026-12')
  })

  it('parseYm 과 왕복한다', () => {
    for (const s of ['2025-01', '2026-06', '2027-12']) {
      expect(formatYm(parseYm(s)!)).toBe(s)
    }
  })
})
