import { describe, it, expect } from 'vitest'
import {
  isTheatricalRelease, hasMinorProvider, MINOR_OTT_NAMES,
  CALENDAR_OTT_FILTERS, OTT_FILTERS, hasProvider, providerLogoUrl,
} from '@/utils/ott'
import type { Content } from '@/types'

function content(o: Partial<Content> = {}): Content {
  return { id: 'c', type: 'movie', title: '작품', ...o } as Content
}

describe('isTheatricalRelease', () => {
  it('국내 극장 개봉일·TMDB 개봉일은 극장으로 본다', () => {
    expect(isTheatricalRelease(content({ releaseDateSource: 'kr_theatrical' }))).toBe(true)
    expect(isTheatricalRelease(content({ releaseDateSource: 'tmdb_release_date' }))).toBe(true)
  })

  it('OTT 공개일은 제외한다 — 극장 개봉작의 OTT 공개일도 마찬가지', () => {
    expect(isTheatricalRelease(content({ releaseDateSource: 'kr_digital' }))).toBe(false)
    expect(isTheatricalRelease(content({ releaseDateSource: 'kr_ott_post_theatrical' }))).toBe(false)
  })

  it('소스가 kr_digital 이면 영화라도 극장이 아니다', () => {
    const c = content({ releaseDateSource: 'kr_digital', eventType: 'movie_release' })
    expect(isTheatricalRelease(c)).toBe(false)
  })

  it('소스가 비었을 때만 eventType 으로 판단한다', () => {
    expect(isTheatricalRelease(content({ eventType: 'movie_release' }))).toBe(true)
    expect(isTheatricalRelease(content({ eventType: 'season_release' }))).toBe(false)
    expect(isTheatricalRelease(content())).toBe(false)
  })
})

describe('기타로 묶인 OTT', () => {
  const withOtt = (name: string) =>
    content({ providers: [{ providerId: 1, providerName: name }] } as Partial<Content>)

  it('기타 OTT를 가진 작품만 걸린다', () => {
    expect(hasMinorProvider(withOtt('U+ Mobile TV'))).toBe(true)
    expect(hasMinorProvider(withOtt('Netflix'))).toBe(false)
    expect(hasMinorProvider(content())).toBe(false)
  })

  it('기타로 묶인 OTT는 칩 목록에서 빠진다', () => {
    const chips = CALENDAR_OTT_FILTERS.map(o => o.name)
    for (const name of MINOR_OTT_NAMES) expect(chips).not.toContain(name)
    expect(CALENDAR_OTT_FILTERS).toHaveLength(OTT_FILTERS.length - MINOR_OTT_NAMES.length)
  })

  // OTT_FILTERS 는 관리자 태깅·큐레이션 드롭다운이 쓴다 — 칩에서 뺐다고 지우면 안 된다
  it('기타로 묶어도 OTT_FILTERS 원본에는 남아 있다', () => {
    const all = OTT_FILTERS.map(o => o.name)
    for (const name of MINOR_OTT_NAMES) expect(all).toContain(name)
  })
})

// 2025-10 "Apple TV+" → "Apple TV" 리브랜딩. DB 에는 재동기화 전까지 옛 이름이 남으므로
// 화면은 두 이름을 같은 OTT로 봐야 한다.
describe('애플TV 개명 흡수', () => {
  const withOtt = (name: string) =>
    content({ providers: [{ providerId: 350, providerName: name }] } as Partial<Content>)

  it('옛 이름으로 저장된 작품도 애플TV 필터에 걸린다', () => {
    for (const stored of ['Apple TV', 'Apple TV+', 'Apple TV Plus']) {
      expect(hasProvider(withOtt(stored), 'Apple TV')).toBe(true)
    }
  })

  it('이름·라벨 모두 + 를 뗀 신 표기다', () => {
    const apple = OTT_FILTERS.find(o => o.name === 'Apple TV')
    expect(apple?.label).toBe('애플TV')
    for (const o of OTT_FILTERS) {
      expect(o.label).not.toContain('애플TV+')
      expect(o.name).not.toContain('Apple TV Plus')
    }
  })

  it('로고는 두 이름 모두 같은 애플 아이콘으로 그린다', () => {
    expect(providerLogoUrl(null, 'Apple TV')).toBe(providerLogoUrl(null, 'Apple TV Plus'))
    // 미등록 이름으로 떨어져 해시 배지가 되지 않았는지 (애플 배지의 tv 라벨이 있어야 한다)
    expect(decodeURIComponent(providerLogoUrl(null, 'Apple TV') || '')).toContain('>tv<')
  })
})
