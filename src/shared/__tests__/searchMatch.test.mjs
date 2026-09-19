import { describe, it, expect } from 'vitest'
import { buildQueryMatcher, queryCore } from '../searchMatch.mjs'

const contents = [
  { id: 'a', title: '옆집 재벌과의 하룻밤 운명', type: 'shortform' },
  { id: 'b', title: '수영부 또라이에게 찍혀버렸다!', type: 'shortform' },
  { id: 'c', title: '재벌집 며느리 수행 일기', type: 'shortform' },
  { id: 'd', title: 'FBI 시즌9', type: 'drama', seasonNumber: 9 },
  { id: 'e', title: '강령사바', type: 'movie' },
  { id: 'f', title: '숨은 작품', type: 'drama', hidden: true },
]
const match = buildQueryMatcher(contents)

describe('queryCore', () => {
  it('붙은 의도어·시즌 표기를 뗀다', () => {
    expect(queryCore('강령사바 평점')).toBe('강령사바')
    expect(queryCore('리처 시즌4 몇부작')).toBe('리처')
    expect(queryCore('영화 피렌체 ott')).toBe('피렌체')
  })
})

describe('buildQueryMatcher', () => {
  it('띄어쓰기·기호가 달라도 같은 작품', () => {
    expect(match('재벌집 며느리 수행일기')?.id).toBe('c')
    expect(match('수영부또라이에게찍혀버렸다')?.id).toBe('b')
  })
  it('제목 앞부분만 쳐도 충분히 길면 잡는다', () => {
    expect(match('옆집 재벌과의 하룻밤')?.id).toBe('a')
    expect(match('수영부 또라이')?.id).toBe('b')
  })
  it('의도어가 붙어도 잡는다', () => {
    expect(match('강령사바 평점')?.id).toBe('e')
  })
  it('시즌 행만 있는 해외 시리즈도 잡는다', () => {
    expect(match('fbi 시즌 9')?.id).toBe('d')
  })
  it('짧은 조각은 엉뚱한 작품에 붙이지 않는다', () => {
    expect(match('옆집')).toBeNull()
    expect(match('재벌')).toBeNull()
  })
  it('숨긴 작품은 짝짓지 않는다', () => {
    expect(match('숨은 작품')).toBeNull()
  })
})
