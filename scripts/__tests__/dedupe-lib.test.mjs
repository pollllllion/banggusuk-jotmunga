import { describe, it, expect } from 'vitest'
import { norm, keepScore, sameWork, planMerges } from '../dedupe-lib.mjs'

/** 2026-08-01 실제 병합했던 행들(요약) — 규칙이 바뀌어도 이 판정은 유지돼야 한다 */
const row = (id, extra = {}) => ({
  id, type: 'movie', title: '제목', posterUrl: null, synopsis: '', genres: [], creators: [],
  releaseYear: null, releaseDate: null, tmdbId: null, popularity: 0, reviewCount: 0, ...extra,
})

describe('norm', () => {
  it('공백·문장부호를 무시한다', () => {
    expect(norm('유 퀴즈 온 더 블럭')).toBe(norm('유퀴즈온더블럭'))
    expect(norm('미니언즈 & 몬스터즈')).toBe(norm('미니언즈몬스터즈'))
  })
})

describe('sameWork', () => {
  it('같은 tmdbId면 같은 작품', () => {
    expect(sameWork(row('tmdb-dr-1', { tmdbId: 327298 }), row('tmdb-tv-1b', { tmdbId: 327298 }))).toBeTruthy()
  })

  it('tmdbId가 비어 있어도 행 id 뒤 숫자가 같으면 같은 작품 (피의 게임 X)', () => {
    const a = row('tmdb-dr-327298', { tmdbId: 327298, releaseDate: '2026-07-03' })
    const b = row('tmdb-tv-327298')
    expect(sameWork(a, b)).toBeTruthy()
  })

  it('시드 행 + TMDB 행은 카탈로그 중복 (오디세이)', () => {
    const tmdb = row('tmdb-mv-1368337', { tmdbId: 1368337, releaseDate: '2026-08-05' })
    const seed = row('c3', { synopsis: '호메로스의 대서사시를 크리스토퍼 놀란이…' })
    expect(sameWork(tmdb, seed)).toBeTruthy()
  })

  it('시드 행이라도 개봉연도가 2년 넘게 벌어지면 보류', () => {
    const tmdb = row('tmdb-mv-1', { tmdbId: 1, releaseDate: '2026-08-05' })
    const seed = row('c9', { releaseYear: 2011 })
    expect(sameWork(tmdb, seed)).toBeNull()
  })

  it('TMDB 중복 등록은 줄거리가 같으면 병합 (러브포비아)', () => {
    const syn = '감성 100% 로맨스 소설 작가 선호와 감수성 0% AI 소개팅 프로그램 잇츠유 대표'
    const a = row('tmdb-dr-289690', { tmdbId: 289690, synopsis: syn, releaseDate: '2026-02-19' })
    const b = row('tmdb-dr-314466', { tmdbId: 314466, synopsis: syn, releaseDate: '2026-02-19' })
    expect(sameWork(a, b)).toBeTruthy()
  })

  it('동명이작은 병합하지 않는다 (기프트)', () => {
    const a = row('tmdb-dr-302987', { tmdbId: 302987, releaseDate: '2026-12-05', synopsis: '불의의 사고 이후 능력이 생긴 야구 코치' })
    const b = row('tmdb-dr-314647', { tmdbId: 314647, releaseDate: '2026-04-12', synopsis: '괴짜 우주 물리학자가 휠체어 럭비 팀을' })
    expect(sameWork(a, b)).toBeNull()
  })
})

describe('keepScore — 어느 행을 남기나', () => {
  it('숨긴 행보다 안 숨긴 행', () => {
    expect(keepScore(row('a'))).toBeGreaterThan(keepScore(row('b', { hidden: true, releaseDate: '2026-01-01', tmdbId: 1 })))
  })
  it('공개일·메타데이터가 있는 TMDB 행이 시드 행보다 우선', () => {
    const tmdb = row('tmdb-mv-1', { tmdbId: 1, releaseDate: '2026-08-05', posterUrl: 'x', castMembers: [{}] })
    expect(keepScore(tmdb)).toBeGreaterThan(keepScore(row('c3', { posterUrl: 'x', popularity: 95 })))
  })
})

describe('planMerges', () => {
  const contents = [
    row('c3', { title: '오디세이', popularity: 95, posterUrl: 'x', reviewCount: 2 }),
    row('tmdb-mv-1368337', { title: '오디세이', tmdbId: 1368337, releaseDate: '2026-08-05', posterUrl: 'x', popularity: 1154 }),
    row('tmdb-dr-302987', { type: 'drama', title: '기프트', tmdbId: 302987, releaseDate: '2026-12-05', synopsis: '야구 코치' }),
    row('tmdb-dr-314647', { type: 'drama', title: '기프트', tmdbId: 314647, releaseDate: '2026-04-12', synopsis: '휠체어 럭비', hidden: true }),
    row('tmdb-mv-999', { title: '단독 작품' }),
  ]
  const { plan, review, dupGroups } = planMerges(contents)

  it('중복 그룹을 찾고 리뷰가 있는 시드 행을 TMDB 행으로 합친다', () => {
    expect(dupGroups).toBe(2)
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ from: 'c3', into: 'tmdb-mv-1368337' })
  })

  it('동명이작은 자동 병합하지 않고 확인 목록으로 뺀다', () => {
    expect(review).toHaveLength(1)
    expect(review[0].title).toBe('기프트')
  })

  it('타입이 다르면 같은 제목이어도 묶지 않는다', () => {
    const { plan: p } = planMerges([
      row('a', { type: 'movie', title: '기프트' }),
      row('b', { type: 'webtoon', title: '기프트' }),
    ])
    expect(p).toHaveLength(0)
  })
})
