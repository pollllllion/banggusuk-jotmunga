import { describe, it, expect } from 'vitest'
import {
  normName, matchTargetProviders, extractKrFlatrate, pickKrMovieDate,
  withinRange, buildContentId, mergeProviders, fetchWithRetry,
} from '../tmdb-lib.mjs'

describe('normName / provider 이름 매칭', () => {
  it('대소문자·공백·+ 차이를 무시한다', () => {
    expect(normName('Disney+')).toBe('disneyplus')
    expect(normName('Disney Plus')).toBe('disneyplus')
    expect(normName('Apple TV+')).toBe(normName('Apple TV Plus'))
    expect(normName('U+ Mobile TV')).toBe('uplusmobiletv')
  })

  it('대상 OTT만 골라내고 그 외는 버린다', () => {
    const list = [
      { provider_id: 8, provider_name: 'Netflix', logo_path: '/n.jpg' },
      { provider_id: 337, provider_name: 'Disney Plus', logo_path: '/d.jpg' },
      { provider_id: 999, provider_name: 'Some Rental Store', logo_path: null },
    ]
    const m = matchTargetProviders(list)
    expect(m.map(p => p.providerId).sort((a, b) => a - b)).toEqual([8, 337])
    expect(m[0]).toHaveProperty('logoPath')
  })

  it('중복 provider_id는 한 번만', () => {
    const list = [
      { provider_id: 8, provider_name: 'Netflix' },
      { provider_id: 8, provider_name: 'Netflix' },
    ]
    expect(matchTargetProviders(list)).toHaveLength(1)
  })
})

describe('영화/TV provider ID 분리', () => {
  it('영화·TV provider 목록을 독립적으로 매칭한다(호출자가 mediaType별로 넘김)', () => {
    const movie = matchTargetProviders([{ provider_id: 8, provider_name: 'Netflix' }])
    const tv = matchTargetProviders([{ provider_id: 356, provider_name: 'Wavve' }])
    expect(movie[0].providerId).toBe(8)
    expect(tv[0].providerId).toBe(356)
  })
})

describe('extractKrFlatrate', () => {
  it('results.KR.flatrate 만 flatrate 로 뽑는다', () => {
    const wp = { results: { KR: {
      flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/n.jpg' }],
      rent: [{ provider_id: 3, provider_name: 'Google Play' }],
    } } }
    const out = extractKrFlatrate(wp)
    expect(out).toHaveLength(1)
    expect(out[0].monetizationType).toBe('flatrate')
  })
  it('KR 자료 없으면 빈 배열', () => {
    expect(extractKrFlatrate({ results: {} })).toEqual([])
    expect(extractKrFlatrate(undefined)).toEqual([])
  })
})

describe('영화 대한민국 공개일 우선순위', () => {
  const results = [{
    iso_3166_1: 'KR',
    release_dates: [
      { type: 3, release_date: '2026-03-10T00:00:00.000Z' },
      { type: 4, release_date: '2026-05-01T00:00:00.000Z' },
      { type: 4, release_date: '2026-04-20T00:00:00.000Z' }, // 같은 타입 → 더 빠른 날짜
    ],
  }]
  it('Digital(4)이 Theatrical(3)보다 우선, 같은 타입은 가장 빠른 날짜', () => {
    expect(pickKrMovieDate(results, null)).toEqual({ date: '2026-04-20', source: 'kr_digital' })
  })
  it('Digital 없으면 Theatrical 사용', () => {
    const r = [{ iso_3166_1: 'KR', release_dates: [{ type: 3, release_date: '2026-03-10' }] }]
    expect(pickKrMovieDate(r, null)).toEqual({ date: '2026-03-10', source: 'kr_theatrical' })
  })
  it('KR 정보 없으면 fallback → tmdb_release_date', () => {
    expect(pickKrMovieDate([], '2026-07-01')).toEqual({ date: '2026-07-01', source: 'tmdb_release_date' })
  })
  it('아무 날짜도 없으면 tmdb_estimated', () => {
    expect(pickKrMovieDate([], null)).toEqual({ date: null, source: 'tmdb_estimated' })
  })
})

describe('withinRange (2026 필터)', () => {
  it('범위 안/밖을 판정한다', () => {
    expect(withinRange('2026-01-01', '2026-01-01', '2026-12-31')).toBe(true)
    expect(withinRange('2025-12-31', '2026-01-01', '2026-12-31')).toBe(false)
    expect(withinRange('2027-01-01', '2026-01-01', '2026-12-31')).toBe(false)
    expect(withinRange(null, '2026-01-01', '2026-12-31')).toBe(false)
  })
})

describe('buildContentId (중복 방지 고유키)', () => {
  it('영화/시리즈/시즌 키를 만든다', () => {
    expect(buildContentId({ mediaType: 'movie', tmdbId: 123, eventType: 'movie_release' })).toBe('tmdb-mv-123')
    expect(buildContentId({ mediaType: 'tv', tmdbId: 456, eventType: 'series_release' })).toBe('tmdb-dr-456')
    expect(buildContentId({ mediaType: 'tv', tmdbId: 456, eventType: 'season_release', seasonNumber: 2 })).toBe('tmdb-dr-456-s2')
  })
})

describe('mergeProviders (여러 OTT 병합)', () => {
  it('providerId 기준 중복 없이 합친다', () => {
    const a = [{ providerId: 8, providerName: 'Netflix' }]
    const b = [{ providerId: 8, providerName: 'Netflix' }, { providerId: 337, providerName: 'Disney Plus' }]
    const m = mergeProviders(a, b)
    expect(m.map(p => p.providerId).sort((a, b) => a - b)).toEqual([8, 337])
  })
})

describe('fetchWithRetry (429/오류 재시도)', () => {
  const res = (status, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: k => headers[k] } })

  it('429 후 성공하면 최종 성공 응답을 반환한다', async () => {
    let calls = 0
    const doFetch = async () => { calls++; return calls < 2 ? res(429, { 'retry-after': '0' }) : res(200) }
    const out = await fetchWithRetry(doFetch, { retries: 3, baseDelay: 1, sleep: async () => {} })
    expect(out.status).toBe(200)
    expect(calls).toBe(2)
  })

  it('계속 429면 재시도 소진 후 throw', async () => {
    const doFetch = async () => res(429, { 'retry-after': '0' })
    await expect(fetchWithRetry(doFetch, { retries: 2, baseDelay: 1, sleep: async () => {} }))
      .rejects.toThrow(/429/)
  })

  it('5xx 후 성공도 재시도로 처리', async () => {
    let calls = 0
    const doFetch = async () => { calls++; return calls < 3 ? res(503) : res(200) }
    const out = await fetchWithRetry(doFetch, { retries: 3, baseDelay: 1, sleep: async () => {} })
    expect(out.status).toBe(200)
    expect(calls).toBe(3)
  })
})
