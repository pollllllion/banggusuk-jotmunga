import { describe, it, expect } from 'vitest'
import {
  normName, matchTargetProviders, extractKrFlatrate, networksToProviders, pickKrMovieDate,
  withinRange, buildContentId, mergeProviders, fetchWithRetry,
  pickGenres, tvContentType, extractCast, extractDirectors, mapNetworks,
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

describe('networksToProviders (KR watch-provider 폴백)', () => {
  it('대상 OTT 네트워크를 정규명 provider로 변환한다 (예: 동궁 = Netflix)', () => {
    const nets = [{ id: 213, name: 'Netflix', logo_path: '/n.png', origin_country: '' }]
    const out = networksToProviders(nets)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ providerName: 'Netflix', logoPath: '/n.png', monetizationType: 'flatrate' })
  })

  it('providerDir이 있으면 watch-provider 표준 id·로고로 통일한다', () => {
    const nets = [{ id: 213, name: 'Netflix', logo_path: '/network-logo.png' }]
    const dir = new Map([['netflix', { providerId: 8, logoPath: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg' }]])
    const out = networksToProviders(nets, dir)
    expect(out[0]).toMatchObject({ providerId: 8, logoPath: '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg', providerName: 'Netflix' })
  })

  it('네트워크명↔provider명 별칭을 보정한다 (Prime Video → Amazon Prime Video, Disney+ → Disney Plus)', () => {
    const out = networksToProviders([
      { id: 1024, name: 'Prime Video', logo_path: '/a.png' },
      { id: 2739, name: 'Disney+', logo_path: '/d.png' },
    ])
    expect(out.map(p => p.providerName).sort()).toEqual(['Amazon Prime Video', 'Disney Plus'])
  })

  it('방송 네트워크(tvN·JTBC 등 비대상)는 무시한다', () => {
    const out = networksToProviders([
      { id: 1, name: 'tvN', logo_path: '/t.png' },
      { id: 2, name: 'JTBC', logo_path: '/j.png' },
    ])
    expect(out).toEqual([])
  })

  it('같은 OTT 중복은 한 번만', () => {
    const out = networksToProviders([
      { id: 213, name: 'Netflix', logo_path: '/n.png' },
      { id: 9999, name: 'Netflix', logo_path: '/n2.png' },
    ])
    expect(out).toHaveLength(1)
  })
})

describe('상세정보 추출 (장르·타입·출연·연출·채널)', () => {
  it('pickGenres: detail.genres 한글명 우선, 없으면 id 매핑', () => {
    expect(pickGenres([{ id: 18, name: '드라마' }, { id: 9648, name: '미스터리' }], [])).toEqual(['드라마', '미스터리'])
    expect(pickGenres(null, [28, 878])).toEqual(['액션', 'SF'])
    expect(pickGenres([], [10764])).toEqual(['예능'])
    // TV 장르 영어명은 id 한글맵으로 교체
    expect(pickGenres([{ id: 10759, name: 'Action & Adventure' }, { id: 10765, name: 'Sci-Fi & Fantasy' }], [])).toEqual(['액션·모험', 'SF·판타지'])
  })

  it('tvContentType: 리얼리티(10764)·토크(10767)는 예능, 그 외는 드라마', () => {
    expect(tvContentType([10764])).toBe('variety')
    expect(tvContentType([10767])).toBe('variety')
    expect(tvContentType([18, 9648])).toBe('drama')
    expect(tvContentType([])).toBe('drama')
  })

  it('extractCast: 상위 N명 name/character/profilePath', () => {
    const credits = { cast: [
      { name: '가나다', character: '주인공', profile_path: '/p.jpg' },
      { name: '라마바', character: '조연', profile_path: null },
    ] }
    const out = extractCast(credits, 1)
    expect(out).toEqual([{ name: '가나다', character: '주인공', profilePath: '/p.jpg' }])
  })

  it('extractCast: TV aggregate 형태(roles[].character)도 처리', () => {
    const out = extractCast({ cast: [{ name: '홍길동', roles: [{ character: '길동' }], profile_path: null }] })
    expect(out[0]).toMatchObject({ name: '홍길동', character: '길동' })
  })

  it('extractDirectors: crew 에서 Director만', () => {
    const crew = [{ job: 'Director', name: '봉준호' }, { job: 'Writer', name: '한진원' }]
    expect(extractDirectors(crew)).toEqual(['봉준호'])
  })

  it('mapNetworks: name/logoPath 상위 N', () => {
    const nets = [{ name: 'tvN', logo_path: '/t.png' }, { name: 'Netflix', logo_path: '/n.png' }]
    expect(mapNetworks(nets, 1)).toEqual([{ name: 'tvN', logoPath: '/t.png' }])
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
  it('광고형 티어·비대상 서비스는 제외한다', () => {
    const wp = { results: { KR: { flatrate: [
      { provider_id: 8, provider_name: 'Netflix', logo_path: '/n.jpg' },
      { provider_id: 1796, provider_name: 'Netflix Standard with Ads', logo_path: '/na.jpg' },
      { provider_id: 999, provider_name: 'Some Niche Service', logo_path: null },
    ] } } }
    const out = extractKrFlatrate(wp)
    expect(out.map(p => p.providerName)).toEqual(['Netflix'])
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
  it('Digital(4)+Theatrical(3) 공존 → 극장개봉작 OTT 공개, 같은 타입은 가장 빠른 날짜', () => {
    expect(pickKrMovieDate(results, null)).toEqual({ date: '2026-04-20', source: 'kr_ott_post_theatrical' })
  })
  it('극장 이력 없는 Digital(4)만 → kr_digital (OTT 오리지널 영화)', () => {
    const r = [{ iso_3166_1: 'KR', release_dates: [{ type: 4, release_date: '2026-05-01' }] }]
    expect(pickKrMovieDate(r, null)).toEqual({ date: '2026-05-01', source: 'kr_digital' })
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
