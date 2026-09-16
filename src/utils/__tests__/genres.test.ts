import { describe, it, expect } from 'vitest'
import { normalizeGenres, matchesGenres, BROWSE_GENRES, GENRE_ALIASES } from '../genres'
import type { Content } from '@/types'

const work = (genres: string[]) => ({ genres } as Content)

/**
 * 둘러보기 장르 필터. 2026-09-16 실측에서 공개 작품 2,423편 중 806편(33%)이
 * **어떤 칩으로도 안 나오는** 상태였다. 아래 규칙들이 그 원인이었다.
 */
describe('합성 장르를 부분으로도 찾는다', () => {
  it('SF·판타지 는 SF 로도 판타지 로도 걸린다 (171편이 둘 다 안 걸렸다)', () => {
    const c = work(['SF·판타지', '드라마'])
    expect(matchesGenres(c, ['SF'])).toBe(true)
    expect(matchesGenres(c, ['판타지'])).toBe(true)
  })

  it('액션·모험 은 액션 으로 걸린다 (137편)', () => {
    expect(matchesGenres(work(['액션·모험']), ['액션'])).toBe(true)
    expect(matchesGenres(work(['액션·모험']), ['모험'])).toBe(true)
  })

  it('ko-KR 번역이 안 온 옛 이름도 받는다', () => {
    expect(matchesGenres(work(['Sci-Fi & Fantasy']), ['SF'])).toBe(true)
  })

  it('멜로는 로맨스로, 토크쇼는 예능으로 모은다', () => {
    expect(matchesGenres(work(['멜로']), ['로맨스'])).toBe(true)
    expect(matchesGenres(work(['토크쇼']), ['예능'])).toBe(true)
  })

  it('TV영화는 장르가 아니라 편성 형태다 — 거르기에 안 쓴다', () => {
    expect(normalizeGenres(['TV영화'])).toEqual([])
  })

  it('같은 말이 두 번 나오지 않는다', () => {
    expect(normalizeGenres(['SF·판타지', 'SF']).filter(g => g === 'SF')).toHaveLength(1)
  })
})

describe('고르지 않았을 때', () => {
  it('장르를 하나도 안 고르면 전부 통과한다', () => {
    expect(matchesGenres(work([]), [])).toBe(true)
    expect(matchesGenres(work(['드라마']), [])).toBe(true)
  })

  it('장르가 없는 작품은 어떤 칩에도 안 걸린다 (없는 걸 지어내지 않는다)', () => {
    expect(matchesGenres(work([]), ['드라마'])).toBe(false)
  })

  it('genres 가 null 이어도 죽지 않는다', () => {
    expect(normalizeGenres(null)).toEqual([])
    expect(matchesGenres({ genres: null } as unknown as Content, ['드라마'])).toBe(false)
  })
})

describe('칩 목록', () => {
  it('죽은 칩이 없다 — 별칭이 가리키는 말은 전부 칩에 있다', () => {
    // 별칭이 'SF' 로 펼쳐지는데 정작 'SF' 칩이 없으면 그 171편은 영영 못 찾는다
    for (const parts of Object.values(GENRE_ALIASES)) {
      for (const p of parts) expect(BROWSE_GENRES).toContain(p)
    }
  })

  it('칩 이름이 곧 거르는 값이다 — 별칭 왼쪽(합성 이름)이 칩에 섞이면 안 된다', () => {
    for (const compound of Object.keys(GENRE_ALIASES)) {
      expect(BROWSE_GENRES).not.toContain(compound)
    }
  })
})
