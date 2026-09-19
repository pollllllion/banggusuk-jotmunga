import { describe, it, expect } from 'vitest'
import { shortPlatformOf, isShortForm, trustedEpisodeCount, isOnCalendar, shortPickScore, SHORT_PICK_MIN, SHORT_NETWORK_QUERY } from '../shortForm.mjs'
import { buildContentDescription, schemaTypeOf } from '../contentSeo.mjs'
import { contentBodyLines } from '../contentIndexable.mjs'
import { tvKind } from '../../../scripts/tmdb-lib.mjs'

const TODAY = '2026-09-19'

describe('shortPlatformOf', () => {
  it('TMDB 방영사 이름으로 숏폼 앱을 알아본다', () => {
    expect(shortPlatformOf({ networks: [{ name: 'DramaBox', id: 8989 }] })?.label).toBe('드라마박스')
  })

  it('방영사가 여럿이면 숏폼 앱 쪽을 고른다', () => {
    const c = { networks: [{ name: 'iQIYI International' }, { name: 'Shortime' }] }
    expect(shortPlatformOf(c)?.name).toBe('Shortime')
  })

  it('방영사가 안 실린 목록 로드에서는 플랫폼 칸으로 알아본다', () => {
    expect(shortPlatformOf({ platform: 'Vigloo' })?.label).toBe('비글루')
  })

  it('관리자가 한글로 적어도 알아본다', () => {
    expect(shortPlatformOf({ networks: [{ name: '드라마박스' }] })?.name).toBe('DramaBox')
  })

  it('일반 방송·OTT 는 숏폼이 아니다', () => {
    expect(shortPlatformOf({ networks: [{ name: 'tvN' }, { name: 'Netflix' }], platform: 'Netflix' })).toBeNull()
  })

  it('discover 에 넣을 방영사 id 는 중복 없이 | 로 잇는다', () => {
    const ids = SHORT_NETWORK_QUERY.split('|')
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('8989')
  })
})

describe('tvKind', () => {
  it('숏폼 앱이 방영사면 장르와 무관하게 shortform', () => {
    expect(tvKind([10764], [{ name: 'Vigloo' }])).toBe('shortform')
  })
  it('아니면 기존 규칙(예능/드라마) 그대로', () => {
    expect(tvKind([10764], [{ name: 'tvN' }])).toBe('variety')
    expect(tvKind([18], [])).toBe('drama')
  })
})

describe('trustedEpisodeCount', () => {
  it('숏폼의 1~2화는 TMDB 오기로 보고 숨긴다', () => {
    expect(trustedEpisodeCount({ type: 'shortform', numberOfEpisodes: 1 })).toBeNull()
  })
  it('숏폼이라도 10화 이상이면 쓴다', () => {
    expect(trustedEpisodeCount({ type: 'shortform', numberOfEpisodes: 56 })).toBe(56)
  })
  it('관리자가 고친 값은 믿는다', () => {
    expect(trustedEpisodeCount({ type: 'shortform', numberOfEpisodes: 8, manualOverride: true })).toBe(8)
  })
  it('일반 드라마는 그대로', () => {
    expect(trustedEpisodeCount({ type: 'drama', numberOfEpisodes: 2 })).toBe(2)
  })
})

describe('isOnCalendar', () => {
  it('숏폼이 아니면 늘 올린다', () => {
    expect(isOnCalendar({ type: 'drama', source: 'tmdb' })).toBe(true)
  })
  it('TMDB 수집 숏폼은 고른 것(calendarPick)만', () => {
    expect(isOnCalendar({ type: 'shortform', source: 'tmdb', verified: true })).toBe(false)
    expect(isOnCalendar({ type: 'shortform', source: 'tmdb', manualOverride: true })).toBe(false)
    expect(isOnCalendar({ type: 'shortform', source: 'tmdb', calendarPick: true })).toBe(true)
  })
  it('종류가 아직 drama 여도 숏폼 앱이면 같은 규칙', () => {
    expect(isOnCalendar({ type: 'drama', source: 'tmdb', platform: 'DramaBox' })).toBe(false)
  })
  it('직접 등록한 숏폼은 인증된 것만 (관리자 등록=인증, 이용자 등록=미인증)', () => {
    expect(isOnCalendar({ type: 'shortform', source: null, verified: true })).toBe(true)
    expect(isOnCalendar({ type: 'shortform', source: null, verified: false })).toBe(false)
  })
})

describe('shortPickScore', () => {
  const page = { hasSynopsis: true, hasPoster: true }
  const picked = s => shortPickScore({ ...page, ...s }) >= SHORT_PICK_MIN
  it('우리 사이트로 실제 검색 유입이 있으면 그것만으로 올린다', () => {
    expect(picked({ demandClicks: 1 })).toBe(true)
    expect(picked({ demandImpressions: 30 })).toBe(true)
    expect(picked({ demandImpressions: 29 })).toBe(false)
  })
  it('평가가 좋고 많으면 올린다', () => {
    expect(picked({ voteCount: 6, voteAverage: 7.5 })).toBe(true)
    expect(picked({ voteCount: 3, voteAverage: 6.5 })).toBe(false)   // 1점뿐
  })
  it('인기도·배우 하나씩으로는 부족하고 둘이 겹치면 올린다', () => {
    expect(picked({ popularity: 5 })).toBe(false)
    expect(picked({ popularity: 5, topCastPopularity: 1.5 })).toBe(true)
  })
  it('평가가 모였는데 5점 미만이면 무엇이 있어도 뺀다', () => {
    expect(picked({ demandClicks: 29, voteCount: 3, voteAverage: 4.3 })).toBe(false)
  })
  it('줄거리·포스터가 없으면 페이지가 빈약해 올리지 않는다', () => {
    expect(shortPickScore({ hasSynopsis: false, hasPoster: true, demandClicks: 10 })).toBe(0)
  })
})

describe('숏폼 검색 문구', () => {
  const c = {
    id: 'tmdb-dr-328189', type: 'shortform', title: '옆집 재벌과의 하룻밤 운명',
    releaseDate: '2026-07-02', platform: 'DramaBox', providers: [], reviewCount: 0,
  }
  it('설명문에 숏폼 드라마·앱 이름(한글·영문)이 들어간다', () => {
    const d = buildContentDescription(c, TODAY)
    expect(d).toContain('숏폼 드라마')
    expect(d).toContain('드라마박스(DramaBox)')
  })
  it('본문에 플랫폼 줄이 생긴다', () => {
    expect(contentBodyLines(c, TODAY)).toContain('플랫폼: 드라마박스(DramaBox)')
  })
  it('구조화 데이터는 TV 시리즈로', () => {
    expect(schemaTypeOf(c)).toBe('TVSeries')
  })
})
