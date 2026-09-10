import { describe, it, expect, vi, afterEach } from 'vitest'
import { boardDate, fullDateTime, normalizeTitle } from '@/utils/helpers'

/** 기준 시각을 고정해 두고 그로부터 N분 전 ISO 를 만든다.
 *  boardDate 는 달력상 '같은 날'과 '시:분'을 보는데 둘 다 로컬 시간대 기준이다.
 *  그래서 기준 시각도 로컬로 짓는다(문자열 파싱이면 시간대에 따라 날짜가 하루 밀린다). */
const NOW = new Date(2026, 7, 27, 15, 0, 0)          // 2026-08-27 15:00 (로컬)
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60000).toISOString()
const at = (y: number, mo: number, d: number, h = 9) => new Date(y, mo - 1, d, h).toISOString()

afterEach(() => vi.useRealTimers())
const freeze = () => { vi.useFakeTimers(); vi.setSystemTime(NOW) }

describe('boardDate — 게시판 목록 날짜', () => {
  it('오늘 글은 시:분', () => {
    freeze()
    expect(boardDate(minsAgo(0))).toBe('15:00')
    expect(boardDate(minsAgo(1))).toBe('14:59')
    expect(boardDate(minsAgo(60))).toBe('14:00')
    expect(boardDate(minsAgo(60 * 15))).toBe('00:00')   // 오늘 자정도 오늘이다
  })

  it('날이 바뀌면 MM.DD — 몇 시간 전이든 상관없다', () => {
    freeze()
    // 어젯밤 11시. 경과로는 16시간이지만 달력상 어제라 날짜로 나온다
    expect(boardDate(at(2026, 8, 26, 23))).toBe('08.26')
    expect(boardDate(minsAgo(60 * 24))).toBe('08.26')
    expect(boardDate(minsAgo(60 * 24 * 2))).toBe('08.25')
    expect(boardDate(at(2026, 1, 5))).toBe('01.05')
  })

  it('월·일을 두 자리로 채운다 (열 폭이 흔들리지 않게)', () => {
    freeze()
    expect(boardDate(at(2026, 3, 7))).toBe('03.07')
  })

  it('해가 다를 때만 연도를 붙인다', () => {
    freeze()
    expect(boardDate(at(2025, 12, 31))).toBe('25.12.31')
    expect(boardDate(at(2025, 8, 27))).toBe('25.08.27')   // 날짜가 같아도 해가 다르면 붙는다
  })

  it('시계 오차로 미래가 찍혀도 깨지지 않는다', () => {
    freeze()
    expect(boardDate(minsAgo(-5))).toBe('15:05')
  })
})

describe('fullDateTime — 글 상세의 정확한 작성 시각', () => {
  it('YYYY.MM.DD HH:MM', () => {
    expect(fullDateTime(new Date(2026, 8, 9, 23, 59).toISOString())).toBe('2026.09.09 23:59')
    expect(fullDateTime(new Date(2026, 0, 5, 9, 5).toISOString())).toBe('2026.01.05 09:05')
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
