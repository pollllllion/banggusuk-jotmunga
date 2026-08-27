import { describe, it, expect, vi, afterEach } from 'vitest'
import { boardDate, normalizeTitle } from '@/utils/helpers'

/** 기준 시각을 고정해 두고 그로부터 N분 전 ISO 를 만든다 */
const NOW = new Date('2026-08-27T15:00:00+09:00')
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60000).toISOString()

afterEach(() => vi.useRealTimers())
const freeze = () => { vi.useFakeTimers(); vi.setSystemTime(NOW) }

describe('boardDate — 게시판 목록 날짜', () => {
  it('하루 안이면 경과 시간', () => {
    freeze()
    expect(boardDate(minsAgo(0))).toBe('방금')
    expect(boardDate(minsAgo(1))).toBe('1분')
    expect(boardDate(minsAgo(59))).toBe('59분')
    expect(boardDate(minsAgo(60))).toBe('1시간')
    expect(boardDate(minsAgo(60 * 23))).toBe('23시간')
  })

  it('하루가 지나면 YY.MM.DD', () => {
    freeze()
    expect(boardDate(minsAgo(60 * 24))).toBe('26.08.26')
    expect(boardDate(minsAgo(60 * 24 * 2))).toBe('26.08.25')
    expect(boardDate('2026-01-05T09:00:00+09:00')).toBe('26.01.05')
  })

  it('월·일을 두 자리로 채운다 (열 폭이 흔들리지 않게)', () => {
    freeze()
    expect(boardDate('2026-03-07T09:00:00+09:00')).toBe('26.03.07')
    expect(boardDate('2025-12-31T09:00:00+09:00')).toBe('25.12.31')   // 해가 바뀌어도 두 자리
  })

  it('시계 오차로 미래가 찍혀도 깨지지 않는다', () => {
    freeze()
    expect(boardDate(minsAgo(-5))).toBe('방금')
  })
})

describe('normalizeTitle — 공백·문장부호 무시', () => {
  it('띄어쓰기가 달라도 같아진다', () => {
    expect(normalizeTitle('유 퀴즈 온 더 블럭')).toBe(normalizeTitle('유퀴즈온더블럭'))
    expect(normalizeTitle('전지적 독자 시점')).toBe(normalizeTitle('전지적독자시점'))
  })

  it('문장부호를 떼고 소문자로 만든다', () => {
    expect(normalizeTitle('어벤져스: 인피니티 워')).toBe('어벤져스인피니티워')
    expect(normalizeTitle('Dune: Part Two')).toBe('duneparttwo')
  })

  it('빈 값은 빈 문자열', () => {
    expect(normalizeTitle('')).toBe('')
    expect(normalizeTitle('  ·  ')).toBe('')
  })
})
