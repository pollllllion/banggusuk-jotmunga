import { describe, it, expect } from 'vitest'
import { audienceLabel, buildContentDescription, buildContentJsonLd } from '../contentSeo.mjs'

const movie = (extra = {}) => ({
  id: 'tmdb-mv-1', type: 'movie', title: '오디세이', synopsis: '', genres: [], creators: [],
  platform: null, releaseYear: 2026, releaseDate: '2026-08-05', status: null,
  avgRating: 0, reviewCount: 0, ...extra,
})
const TODAY = '2026-09-20'

describe('audienceLabel', () => {
  it('만 단위로 줄인다 (설명은 110자쯤에서 잘린다)', () => {
    expect(audienceLabel(16928432)).toBe('1,692만 명')
    expect(audienceLabel(11124870)).toBe('1,112만 명')
  })
  it('만 미만은 원수 그대로', () => {
    expect(audienceLabel(9050)).toBe('9,050명')
  })
  it('없거나 0이면 null', () => {
    expect(audienceLabel(0)).toBeNull()
    expect(audienceLabel(undefined)).toBeNull()
  })
})

describe('buildContentDescription — 누적관객', () => {
  it('평점 뒤·줄거리 앞에 들어간다', () => {
    const d = buildContentDescription(movie({ koficAudience: 11124870, voteAverage: 7.8, voteCount: 900, synopsis: '오디세우스의 항해.' }), TODAY)
    expect(d).toContain('누적관객 1,112만 명.')
    expect(d.indexOf('TMDB 평점')).toBeLessThan(d.indexOf('누적관객'))
    expect(d.indexOf('누적관객')).toBeLessThan(d.indexOf('오디세우스'))
  })

  it('관객수가 없으면 그 문장이 아예 없다', () => {
    expect(buildContentDescription(movie(), TODAY)).not.toContain('누적관객')
  })

  it('아직 공개 전이면 쓰지 않는다', () => {
    const d = buildContentDescription(movie({ releaseDate: '2026-12-25', koficAudience: 5000 }), TODAY)
    expect(d).not.toContain('누적관객')
  })
})

describe('buildContentJsonLd — 누적관객', () => {
  it('additionalProperty 로 붙는다', () => {
    const ld = buildContentJsonLd(movie({ koficAudience: 11124870 }), 'https://ottcal.com')
    expect(ld.additionalProperty).toEqual({ '@type': 'PropertyValue', name: '누적관객수', value: 11124870, unitText: '명' })
  })

  it('없으면 키 자체가 없다 (빈 값을 구조화하지 않는다)', () => {
    expect(buildContentJsonLd(movie(), 'https://ottcal.com').additionalProperty).toBeUndefined()
  })
})
