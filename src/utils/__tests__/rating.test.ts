import { describe, it, expect } from 'vitest'
import { mergeContentRatings, summarizeRatings } from '../rating'

describe('mergeContentRatings — 토론글 별점 + 본 작품 별점', () => {
  it('두 곳의 별점을 모두 센다', () => {
    const out = mergeContentRatings(
      [{ authorId: 'u1', rating: 8 }],
      [{ userId: 'u2', rating: 6 }],
    )
    expect(out.sort()).toEqual([6, 8])
  })

  /** 2026-09-16 에 실제로 갈렸던 자리 — 작품방만 토론글 별점을 따로 세고 있었다 */
  it('토론글 별점이 없어도 본 작품 별점만으로 집계된다', () => {
    // 실제 데이터: 군체 — 토론글 별점 0개, 본 작품 별점 4점 하나
    expect(mergeContentRatings([], [{ userId: 'u1', rating: 4 }])).toEqual([4])
  })

  it('같은 사람이 둘 다면 토론글 쪽만 센다', () => {
    const out = mergeContentRatings(
      [{ authorId: 'u1', rating: 9 }],
      [{ userId: 'u1', rating: 3 }],
    )
    expect(out).toEqual([9])
  })

  it('유동닉 글(authorId=null)은 묶을 상대가 없어 그대로 센다', () => {
    const out = mergeContentRatings(
      [{ authorId: null, rating: 7 }],
      [{ userId: 'u1', rating: 5 }],
    )
    expect(out.sort()).toEqual([5, 7])
  })

  it('별점 없는 행은 빠진다', () => {
    const out = mergeContentRatings(
      [{ authorId: 'u1', rating: null }, { authorId: 'u2', rating: 8 }],
      [{ userId: 'u3' }, { userId: 'u4', rating: 6 }],
    )
    expect(out.sort()).toEqual([6, 8])
  })

  it('둘 다 비면 빈 목록', () => {
    expect(mergeContentRatings([], [])).toEqual([])
  })
})

describe('summarizeRatings', () => {
  it('평균은 소수 한 자리', () => {
    expect(summarizeRatings([8, 7])).toEqual({ avg: 7.5, count: 2 })
    expect(summarizeRatings([8, 7, 7])).toEqual({ avg: 7.3, count: 3 })
  })

  it('별점이 없으면 0/0 — "아직 별점 없음"으로 그릴 자리다', () => {
    expect(summarizeRatings([])).toEqual({ avg: 0, count: 0 })
  })
})
