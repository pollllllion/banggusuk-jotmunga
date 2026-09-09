import { describe, it, expect } from 'vitest'
import { clampPage } from '@/components/ui/Pager'

/**
 * ?p= 는 공유 링크·손으로 친 주소로도 들어오고,
 * 검색·필터로 결과가 줄면 멀쩡하던 값이 갑자기 범위를 넘는다.
 * 어느 경우에도 목록이 텅 비면 안 된다.
 */
describe('clampPage', () => {
  it('정상 범위는 그대로', () => {
    expect(clampPage('3', 10)).toBe(3)
    expect(clampPage(1, 10)).toBe(1)
    expect(clampPage('10', 10)).toBe(10)
  })

  it('없거나 이상한 값은 1쪽', () => {
    for (const bad of [null, undefined, '', 'abc', 'NaN', '1e', {} as any]) {
      expect(clampPage(bad, 10), String(bad)).toBe(1)
    }
  })

  it('0 이하는 1쪽', () => {
    expect(clampPage('0', 10)).toBe(1)
    expect(clampPage('-5', 10)).toBe(1)
  })

  it('범위를 넘으면 마지막 쪽 — 필터로 결과가 줄었을 때가 이 경우다', () => {
    expect(clampPage('30', 2)).toBe(2)
    expect(clampPage('9999', 1)).toBe(1)
  })

  it('결과가 0건이어도 1쪽 (0쪽은 없다)', () => {
    expect(clampPage('5', 0)).toBe(1)
    expect(clampPage('1', 0)).toBe(1)
  })

  it('소수점은 버린다', () => {
    expect(clampPage('2.9', 10)).toBe(2)
  })
})
