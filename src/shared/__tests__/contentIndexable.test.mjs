import { describe, it, expect } from 'vitest'
import { contentBodyLines, contentTextLength, isIndexableContent, MIN_INDEXABLE_BODY_CHARS } from '../contentIndexable.mjs'

const TODAY = '2026-08-09'

/** 실제 DB 행을 축약한 것 — 필드가 빠져도 죽지 않아야 한다 */
const base = { id: 'x', type: 'drama', title: '테스트 작품' }

describe('contentBodyLines', () => {
  it('없는 필드는 줄을 만들지 않는다', () => {
    expect(contentBodyLines(base, TODAY)).toEqual(['드라마'])
  })

  it('원제가 제목과 같으면 중복해서 넣지 않는다', () => {
    expect(contentBodyLines({ ...base, originalTitle: '테스트 작품' }, TODAY)).toEqual(['드라마'])
    expect(contentBodyLines({ ...base, originalTitle: 'Test' }, TODAY)[0]).toBe('원제: Test')
  })

  it('공개일이 미래면 공개 예정으로 쓴다', () => {
    expect(contentBodyLines({ ...base, releaseDate: '2027-01-01' }, TODAY))
      .toContain('드라마 · 2027. 01. 01 공개 예정')
    expect(contentBodyLines({ ...base, releaseDate: '2026-01-01' }, TODAY))
      .toContain('드라마 · 2026. 01. 01 공개')
  })

  it('OTT 가 있으면 platform 대신 OTT 를 쓰고 중복 이름은 한 번만 넣는다', () => {
    const c = {
      ...base, platform: 'TV/OTT',
      providers: [{ providerName: 'Netflix' }, { providerName: 'Netflix' }, { providerName: 'Wavve' }],
    }
    expect(contentBodyLines(c, TODAY)).toContain('공개 플랫폼: Netflix, Wavve')
  })

  it('출연진은 8명까지만 넣는다', () => {
    const castMembers = Array.from({ length: 12 }, (_, i) => ({ name: `배우${i}` }))
    const line = contentBodyLines({ ...base, castMembers }, TODAY).find(l => l.startsWith('출연:'))
    expect(line.split(', ')).toHaveLength(8)
  })

  it('리뷰가 0건이면 평점 줄을 넣지 않는다', () => {
    expect(contentBodyLines({ ...base, reviewCount: 0, avgRating: 0 }, TODAY).some(l => l.includes('평점'))).toBe(false)
    expect(contentBodyLines({ ...base, reviewCount: 3, avgRating: 7.25 }, TODAY)).toContain('평점 7.3/10 (별점 3개)')
  })
})

describe('isIndexableContent', () => {
  const thin = { ...base, releaseDate: '2026-07-31' } // "숨바꼭질 2 드라마 · 2026. 07. 31 공개" 수준
  const rich = { ...base, releaseDate: '2026-07-31', synopsis: '가'.repeat(200) }

  it('본문이 얇으면 제외한다', () => {
    expect(contentTextLength(thin, TODAY)).toBeLessThan(MIN_INDEXABLE_BODY_CHARS)
    expect(isIndexableContent(thin, { today: TODAY })).toBe(false)
  })

  it('줄거리가 붙으면 색인한다', () => {
    expect(isIndexableContent(rich, { today: TODAY })).toBe(true)
  })

  it('토론글이 하나라도 있으면 길이와 무관하게 색인한다', () => {
    expect(isIndexableContent(thin, { today: TODAY, discussionCount: 1 })).toBe(true)
    expect(isIndexableContent(thin, { today: TODAY, discussionCount: 0 })).toBe(false)
  })

  it('별점이 달린 작품도 색인한다', () => {
    expect(isIndexableContent({ ...thin, reviewCount: 1, avgRating: 8 }, { today: TODAY })).toBe(true)
  })

  it('숨김 작품은 내용이 아무리 많아도 제외한다', () => {
    expect(isIndexableContent({ ...rich, hidden: true }, { today: TODAY })).toBe(false)
    expect(isIndexableContent({ ...rich, hidden: true, reviewCount: 5 }, { today: TODAY })).toBe(false)
  })

  it('작품이 없으면 false', () => {
    expect(isIndexableContent(null)).toBe(false)
  })
})
