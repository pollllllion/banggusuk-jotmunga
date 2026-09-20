import { describe, it, expect } from 'vitest'
import { buildIndex, matchOne, mergeBoxOffice, planUpdates, openYear } from '../kofic-lib.mjs'

const movie = (id, title, extra = {}) => ({
  id, type: 'movie', title, originalTitle: null, releaseDate: null, releaseYear: null,
  hidden: false, koficAudience: null, koficMovieCd: null, ...extra,
})
const kf = (movieNm, openDt, audiAcc, movieCd = '2026' + movieNm.length) => ({ movieCd, movieNm, openDt, audiAcc })

describe('matchOne', () => {
  it('제목·연도가 맞으면 그 행', () => {
    const idx = buildIndex([movie('tmdb-mv-1', '파묘', { releaseYear: 2026, releaseDate: '2026-02-22' })])
    expect(matchOne(kf('파묘', '2026-02-22', 1000), idx).row.id).toBe('tmdb-mv-1')
  })

  it('띄어쓰기·문장부호가 달라도 붙는다', () => {
    const idx = buildIndex([movie('tmdb-mv-2', '범죄도시 4', { releaseYear: 2026 })])
    expect(matchOne(kf('범죄도시4', '2026-04-24', 1000), idx).row.id).toBe('tmdb-mv-2')
  })

  it('원제로도 찾는다', () => {
    const idx = buildIndex([movie('tmdb-mv-3', 'Wicked', { originalTitle: '위키드', releaseYear: 2026 })])
    expect(matchOne(kf('위키드', '2026-11-20', 1000), idx).row.id).toBe('tmdb-mv-3')
  })

  it('12월 개봉작이 다음 해로 적혀 있어도 ±1년은 받아 준다', () => {
    const idx = buildIndex([movie('tmdb-mv-4', '하얼빈', { releaseYear: 2026 })])
    expect(matchOne(kf('하얼빈', '2025-12-24', 1000), idx).row.id).toBe('tmdb-mv-4')
  })

  it('동명이작 후보가 둘이면 적지 않는다', () => {
    const idx = buildIndex([
      movie('tmdb-mv-5', '기프트', { releaseYear: 2026 }),
      movie('tmdb-mv-6', '기프트', { releaseYear: 2026 }),
    ])
    expect(matchOne(kf('기프트', '2026-03-01', 1000), idx).ambiguous).toHaveLength(2)
  })

  it('연도가 한참 다르면 같은 제목이어도 단정하지 않는다', () => {
    const idx = buildIndex([movie('tmdb-mv-7', '아이언맨', { releaseYear: 2008 })])
    expect(matchOne(kf('아이언맨', '2026-05-01', 1000), idx).ambiguous).toHaveLength(1)
  })

  it('드라마·숨긴 행은 아예 후보가 아니다', () => {
    const idx = buildIndex([
      { ...movie('tmdb-dr-8', '전지적 독자 시점'), type: 'drama' },
      movie('tmdb-mv-9', '숨긴영화', { hidden: true, releaseYear: 2026 }),
    ])
    expect(matchOne(kf('전지적 독자 시점', '2026-07-23', 1000), idx)).toBeNull()
    expect(matchOne(kf('숨긴영화', '2026-07-23', 1000), idx)).toBeNull()
  })
})

describe('mergeBoxOffice', () => {
  it('같은 영화는 가장 큰 누적관객만 남는다', () => {
    const agg = mergeBoxOffice([
      [{ movieCd: '1', movieNm: 'A', openDt: '2026-09-01', audiAcc: '100' }],
      [{ movieCd: '1', movieNm: 'A', openDt: '2026-09-01', audiAcc: '250' }],
      [{ movieCd: '1', movieNm: 'A', openDt: '2026-09-01', audiAcc: '180' }],
    ])
    expect(agg.get('1').audiAcc).toBe(250)
  })

  it('값이 없거나 0인 줄은 버린다', () => {
    expect(mergeBoxOffice([[{ movieCd: '2', movieNm: 'B', audiAcc: '0' }, { movieNm: '코드없음', audiAcc: '5' }]]).size).toBe(0)
  })
})

describe('planUpdates', () => {
  const rows = [movie('tmdb-mv-1', '파묘', { releaseYear: 2026, koficAudience: 1000, koficMovieCd: '20260001' })]

  it('늘어난 값만 적는다', () => {
    const grow = planUpdates(mergeBoxOffice([[{ movieCd: '20260001', movieNm: '파묘', openDt: '2026-02-22', audiAcc: 2000 }]]), rows)
    expect(grow.updates).toHaveLength(1)
    const same = planUpdates(mergeBoxOffice([[{ movieCd: '20260001', movieNm: '파묘', openDt: '2026-02-22', audiAcc: 900 }]]), rows)
    expect(same.updates).toHaveLength(0)
  })

  it('다른 영화코드가 더 작은 값을 들고 오면 덮지 않는다 (잘못 붙은 신호)', () => {
    const { updates } = planUpdates(mergeBoxOffice([[{ movieCd: '20269999', movieNm: '파묘', openDt: '2026-02-22', audiAcc: 500 }]]), rows)
    expect(updates).toHaveLength(0)
  })

  it('우리에게 없는 영화는 unmatched', () => {
    const { unmatched } = planUpdates(mergeBoxOffice([[{ movieCd: '3', movieNm: '없는영화', openDt: '2026-01-01', audiAcc: 10 }]]), rows)
    expect(unmatched).toHaveLength(1)
  })
})

describe('openYear', () => {
  it('YYYY-MM-DD 와 YYYYMMDD 를 모두 읽는다', () => {
    expect(openYear('2026-02-22')).toBe(2026)
    expect(openYear('20260222')).toBe(2026)
    expect(openYear('')).toBeNull()
  })
})
