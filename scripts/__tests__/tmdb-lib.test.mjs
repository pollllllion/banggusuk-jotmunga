import { describe, it, expect } from 'vitest'
import {
  normName, matchTargetProviders, extractKrFlatrate, networksToProviders, pickKrMovieDate,
  withinRange, buildContentId, mergeProviders, fetchWithRetry,
  pickGenres, tvContentType, extractCast, extractDirectors, mapNetworks, tmdbAlive,
  parseContentId, needsEnrich, pickNextEpisode,
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

  // 2025-10 Apple TV+ → Apple TV 개명. 이걸 놓쳐서 애플TV+ 작품이 통째로 누락된 적이 있다.
  it('개명된 Apple TV 를 애플TV+ 로 매칭하고 정규명으로 저장한다', () => {
    for (const name of ['Apple TV', 'Apple TV+', 'Apple TV Plus']) {
      const out = matchTargetProviders([{ provider_id: 350, provider_name: name }])
      expect(out).toHaveLength(1)
      expect(out[0].providerName).toBe('Apple TV')
    }
  })

  it('작품별 flatrate 추출에도 같은 별칭이 걸린다', () => {
    const wp = { results: { KR: { flatrate: [{ provider_id: 350, provider_name: 'Apple TV', logo_path: '/a.jpg' }] } } }
    const out = extractKrFlatrate(wp)
    expect(out.map(p => p.providerName)).toEqual(['Apple TV'])
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

describe('tmdbAlive (작품이 TMDB 에 아직 있나)', () => {
  it('200 이면 존재', async () => {
    expect(await tmdbAlive(async () => 200, 'movie', 1368337)).toBe(true)
  })

  it('404 면 삭제됨', async () => {
    expect(await tmdbAlive(async () => 404, 'movie', 999999999)).toBe(false)
  })

  // ★ 이게 이 함수의 존재 이유다 ★ 일시적 장애를 '사라짐'으로 읽어서 멀쩡한 작품을
  // 숨긴 것이 2026-08-05 버그의 본질이었다. 확실하지 않으면 아무것도 하지 않는다.
  it('429·5xx·예외는 판단 불가(null) — 숨기면 안 된다', async () => {
    expect(await tmdbAlive(async () => 429, 'movie', 1)).toBeNull()
    expect(await tmdbAlive(async () => 503, 'movie', 1)).toBeNull()
    expect(await tmdbAlive(async () => { throw new Error('network') }, 'movie', 1)).toBeNull()
  })

  it('tmdbId 가 없으면 조회하지 않고 판단 불가', async () => {
    let called = false
    expect(await tmdbAlive(async () => { called = true; return 404 }, 'movie', null)).toBeNull()
    expect(called).toBe(false)
  })

  it('mediaType 에 따라 movie/tv 경로를 고른다 (drama 도 tv)', async () => {
    const seen = []
    const spy = async p => { seen.push(p); return 200 }
    await tmdbAlive(spy, 'movie', 11)
    await tmdbAlive(spy, 'tv', 22)
    await tmdbAlive(spy, 'drama', 33)
    expect(seen).toEqual(['/movie/11', '/tv/22', '/tv/33'])
  })
})

describe('parseContentId — buildContentId 의 역', () => {
  it('영화·시리즈·시즌 행을 가른다', () => {
    expect(parseContentId('tmdb-mv-12')).toEqual({ kind: 'movie', tmdbId: 12, seasonNumber: null })
    expect(parseContentId('tmdb-dr-293611')).toEqual({ kind: 'tv', tmdbId: 293611, seasonNumber: null })
    expect(parseContentId('tmdb-dr-54553-s2')).toEqual({ kind: 'tv', tmdbId: 54553, seasonNumber: 2 })
  })

  it('buildContentId 로 만든 id 를 그대로 되돌린다', () => {
    const id = buildContentId({ mediaType: 'tv', tmdbId: 7, eventType: 'season_release', seasonNumber: 3 })
    expect(parseContentId(id)).toEqual({ kind: 'tv', tmdbId: 7, seasonNumber: 3 })
  })

  it('수기 등록(uuid) 등 TMDB 행이 아니면 null', () => {
    expect(parseContentId('8b1f0c1e-aaaa-bbbb-cccc-000000000000')).toBeNull()
    expect(parseContentId('tmdb-dr-12-extra')).toBeNull()
    expect(parseContentId(null)).toBeNull()
  })
})

describe('needsEnrich — 보강 대상 판정', () => {
  const today = '2026-09-18'
  const full = {
    id: 'tmdb-dr-1', releaseDate: '2026-09-01', castMembers: [{ name: 'a' }], providers: [{ providerId: 8 }],
    genres: ['드라마'], networks: [{ name: 'SBS' }], tmdbUrl: 'https://www.themoviedb.org/tv/1',
  }

  it('다 채워진 행은 대상이 아니다', () => {
    expect(needsEnrich(full, { today })).toBe(false)
    expect(needsEnrich(full, { today, all: true })).toBe(false)
  })

  it('TV 행은 채널(networks)만 비어도 대상이다 — 영화는 채널이 없는 게 정상', () => {
    expect(needsEnrich({ ...full, networks: [] }, { today })).toBe(true)
    expect(needsEnrich({ ...full, id: 'tmdb-mv-1', networks: [] }, { today })).toBe(false)
  })

  it('시즌 행도 대상이다', () => {
    expect(needsEnrich({ ...full, id: 'tmdb-dr-1-s2', networks: [] }, { today })).toBe(true)
  })

  it('한 번도 상세를 받은 적 없는 행(tmdbUrl 없음)은 오래됐어도 본다', () => {
    const stub = { id: 'tmdb-dr-54553-s2', releaseDate: '2013-12-07', tmdbUrl: null }
    expect(needsEnrich(stub, { today })).toBe(true)
  })

  it('이미 물어본 옛 행은 평소엔 건너뛰고 all 일 때만 본다', () => {
    const old = { ...full, releaseDate: '2024-01-01', providers: [] }
    expect(needsEnrich(old, { today })).toBe(false)
    expect(needsEnrich(old, { today, all: true })).toBe(true)
  })

  it('공개 전·최근 공개작·날짜 미정은 매일 본다', () => {
    expect(needsEnrich({ ...full, releaseDate: '2027-01-15', networks: [] }, { today })).toBe(true)
    expect(needsEnrich({ ...full, releaseDate: '2026-06-20', providers: [] }, { today })).toBe(true)  // 딱 90일 전
    expect(needsEnrich({ ...full, releaseDate: '2026-06-19', providers: [] }, { today })).toBe(false) // 91일 전
    expect(needsEnrich({ ...full, releaseDate: null }, { today })).toBe(true)
  })

  it('TMDB 행이 아니면 대상이 아니다', () => {
    expect(needsEnrich({ id: 'some-uuid', networks: [] }, { today, all: true })).toBe(false)
  })
})

describe('pickNextEpisode — 어느 행에 다음 회차를 적나', () => {
  const detail = (season_number, episode_number, air_date = '2026-09-24') =>
    ({ next_episode_to_air: { season_number, episode_number, air_date } })

  it('시리즈 행은 시즌1 회차를 받는다', () => {
    expect(pickNextEpisode(detail(1, 7))).toEqual({ date: '2026-09-24', number: 7 })
  })

  it('다음 회차가 없으면 null', () => {
    expect(pickNextEpisode({ next_episode_to_air: null })).toBeNull()
    expect(pickNextEpisode({})).toBeNull()
    expect(pickNextEpisode(null)).toBeNull()
  })

  it('1화는 적지 않는다 — 그날은 공개일로 이미 달력에 있다', () => {
    expect(pickNextEpisode(detail(1, 1))).toBeNull()
    expect(pickNextEpisode(detail(2, 1), 2)).toBeNull()
  })

  it('시즌 행은 제 시즌의 회차만 받는다', () => {
    expect(pickNextEpisode(detail(2, 3), 2)).toEqual({ date: '2026-09-24', number: 3 })
    expect(pickNextEpisode(detail(3, 3), 2)).toBeNull()
  })

  it('시즌 행이 따로 있으면 시리즈 행에는 적지 않는다 (달력에 두 번 뜨지 않게)', () => {
    expect(pickNextEpisode(detail(2, 3), null, s => s === 2)).toBeNull()
  })

  it('시즌 행이 없으면 시리즈 행이 뒤 시즌 회차도 받는다 (장수 예능)', () => {
    expect(pickNextEpisode(detail(12, 40), null, () => false)).toEqual({ date: '2026-09-24', number: 40 })
  })

  it('스페셜(0 시즌)·날짜 없는 회차는 뺀다', () => {
    expect(pickNextEpisode(detail(0, 5))).toBeNull()
    expect(pickNextEpisode(detail(1, 5, null))).toBeNull()
  })
})
