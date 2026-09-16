import { describe, it, expect } from 'vitest'
// 생성된 .mjs 표 — scripts/fetch-holidays.mjs 가 만든다
import { HOLIDAYS, holidayOf } from '@/shared/holidays.mjs'

/**
 * 공휴일 표는 스크립트가 만든다(scripts/fetch-holidays.mjs). 사람이 안 고치는 파일이라
 * 조용히 틀려도 아무도 모른다 — 다시 만들었을 때 망가지지 않았는지 여기서 잡는다.
 * 달력이 틀리면 안 본 것만 못하다.
 */
describe('공휴일 표', () => {
  it('해마다 13일 이상 있다 — 통째로 비면 표가 깨진 것이다', () => {
    const byYear: Record<string, number> = {}
    for (const d of Object.keys(HOLIDAYS)) byYear[d.slice(0, 4)] = (byYear[d.slice(0, 4)] ?? 0) + 1
    const years = Object.keys(byYear).sort()
    expect(years.length).toBeGreaterThanOrEqual(8)
    for (const y of years) expect(byYear[y], `${y}년`).toBeGreaterThanOrEqual(13)
  })

  it('올해와 내년을 덮는다 — 범위가 끝나면 다시 받아야 한다', () => {
    const y = new Date().getFullYear()
    const has = (year: number) => Object.keys(HOLIDAYS).some(d => d.startsWith(String(year)))
    expect(has(y), '올해').toBe(true)
    expect(has(y + 1), '내년').toBe(true)
  })

  it('날짜마다 고정 공휴일이 맞다', () => {
    expect(holidayOf('2026-01-01')).toBe('새해')
    expect(holidayOf('2026-03-01')).toBe('삼일절')
    expect(holidayOf('2026-05-05')).toBe('어린이날')
    expect(holidayOf('2026-06-06')).toBe('현충일')
    expect(holidayOf('2026-08-15')).toBe('광복절')
    expect(holidayOf('2026-10-03')).toBe('개천절')
    expect(holidayOf('2026-10-09')).toBe('한글날')
    expect(holidayOf('2026-12-25')).toBe('크리스마스')
  })

  it('음력 공휴일과 연휴가 들어 있다', () => {
    // 2026 설날 2/17 · 추석 9/25 — 앞뒤 하루씩 연휴
    for (const d of ['2026-02-16', '2026-02-17', '2026-02-18']) expect(holidayOf(d)).toBe('설날')
    for (const d of ['2026-09-24', '2026-09-25', '2026-09-26']) expect(holidayOf(d)).toBe('추석')
    expect(holidayOf('2026-05-24')).toBe('부처님오신날')
  })

  it('대체공휴일이 들어 있다', () => {
    // 2026: 삼일절(일)→3/2 · 부처님오신날(일)→5/25 · 광복절(토)→8/17 · 개천절(토)→10/5
    expect(holidayOf('2026-03-02')).toBe('대체공휴일')
    expect(holidayOf('2026-05-25')).toBe('대체공휴일')
    expect(holidayOf('2026-10-05')).toBe('대체공휴일')
  })

  it('공휴일이 아닌 기념일은 안 들어 있다', () => {
    // 제헌절·국군의날은 국경일이지만 관공서가 쉬지 않는다. 크리스마스 이브도 아니다.
    expect(holidayOf('2026-07-17')).toBeNull()
    expect(holidayOf('2026-10-01')).toBeNull()
    expect(holidayOf('2026-12-24')).toBeNull()
  })

  it('평일은 null', () => {
    expect(holidayOf('2026-09-16')).toBeNull()
    expect(holidayOf('아무거나')).toBeNull()
  })
})
