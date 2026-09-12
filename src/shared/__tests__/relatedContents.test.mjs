import { describe, it, expect } from 'vitest'
import { pickRelated, relatedScore, RELATED_LIMIT } from '../relatedContents.mjs'

const mk = (id, extra = {}) => ({ id, type: 'drama', title: id, ...extra })

describe('relatedScore', () => {
  it('겹치는 게 없으면 0 — 남남은 링크하지 않는다', () => {
    expect(relatedScore(mk('a', { type: 'movie' }), mk('b', { type: 'webtoon' }))).toBe(0)
  })

  it('장르가 가장 세다', () => {
    const a = mk('a', { genres: ['스릴러', '드라마'] })
    const sameGenre = mk('b', { type: 'movie', genres: ['스릴러'] })
    const samePlatform = mk('c', { type: 'movie', platform: 'Netflix' })
    expect(relatedScore(a, sameGenre)).toBeGreaterThan(relatedScore({ ...a, platform: 'Netflix' }, samePlatform))
  })

  it('providers 와 platform 을 같은 축으로 본다', () => {
    const a = mk('a', { type: 'movie', providers: [{ providerName: 'Netflix' }] })
    // 같은 OTT 2 + 같은 종류 1
    expect(relatedScore(a, mk('b', { type: 'movie', platform: 'Netflix' }))).toBe(3)
  })

  it('같은 OTT 가 여러 개 겹쳐도 한 번만 센다', () => {
    const two = [{ providerName: 'Netflix' }, { providerName: 'Wavve' }]
    const a = mk('a', { type: 'movie', providers: two })
    // 둘이 겹쳐도 OTT 는 2점 한 번 (+ 같은 종류 1)
    expect(relatedScore(a, mk('b', { type: 'movie', providers: two }))).toBe(3)
  })

  it('공개일이 가까울수록 높다', () => {
    const a = mk('a', { type: 'movie', releaseDate: '2026-09-01' })
    const near = relatedScore(a, mk('b', { type: 'movie', releaseDate: '2026-09-20' }))
    const far = relatedScore(a, mk('c', { type: 'movie', releaseDate: '2026-12-01' }))
    const gone = relatedScore(a, mk('d', { type: 'movie', releaseDate: '2024-01-01' }))
    expect(near).toBeGreaterThan(far)
    expect(far).toBeGreaterThan(gone)
  })

  it('수기 공개일(manualOverride)이 있으면 그걸 쓴다', () => {
    const a = mk('a', { type: 'movie', releaseDate: '2020-01-01', manualOverride: true, manualReleaseDate: '2026-09-01' })
    expect(relatedScore(a, mk('b', { type: 'movie', releaseDate: '2026-09-10' }))).toBe(3)
  })
})

describe('pickRelated', () => {
  const pool = [
    mk('self', { genres: ['스릴러'] }),
    mk('hit', { genres: ['스릴러'], platform: 'Netflix' }),
    mk('mid', { genres: ['스릴러'] }),
    mk('none', { type: 'webtoon' }),
  ]
  const target = mk('self', { genres: ['스릴러'], platform: 'Netflix' })

  it('자기 자신은 빼고 점수 높은 순으로', () => {
    const got = pickRelated(target, pool, 2).map(c => c.id)
    expect(got).toEqual(['hit', 'mid'])
  })

  it('점수 0 인 작품은 자리가 남을 때만 뒤에 채워진다', () => {
    const got = pickRelated(target, pool).map(c => c.id)
    expect(got.slice(0, 2)).toEqual(['hit', 'mid'])   // 점수순이 먼저
    expect(got).toContain('none')                      // 남은 자리는 채움
  })

  it('이웃이 없으면 같은 종류로 채운다 — 장르·공개일이 빈 수기 등록 작품 때문', () => {
    const bare = mk('bare', { type: 'webtoon' })
    const sameType = [mk('w2', { type: 'webtoon' }), mk('w1', { type: 'webtoon' }), mk('movie1', { type: 'movie' })]
    const got = pickRelated(bare, sameType).map(c => c.id)
    expect(got).toEqual(['w1', 'w2', 'movie1'])   // 같은 종류 먼저, 모자라면 아무거나
  })

  it('채움이 자기 자신이나 이미 고른 것을 다시 넣지 않는다', () => {
    const got = pickRelated(target, pool).map(c => c.id)
    expect(new Set(got).size).toBe(got.length)
    expect(got).not.toContain('self')
  })

  it('개수를 넘지 않는다', () => {
    const many = Array.from({ length: 30 }, (_, i) => mk(`x${i}`, { genres: ['스릴러'] }))
    expect(pickRelated(target, many)).toHaveLength(RELATED_LIMIT)
  })

  it('점수가 같으면 id 순 — 빌드마다 링크가 흔들리면 안 된다', () => {
    const tie = [mk('c2', { genres: ['스릴러'] }), mk('c1', { genres: ['스릴러'] })]
    expect(pickRelated(target, tie, 1).map(c => c.id)).toEqual(['c1'])
  })

  it('빈 pool 이나 없는 작품에도 죽지 않는다', () => {
    expect(pickRelated(target, [])).toEqual([])
    expect(pickRelated(null, pool)).toEqual([])
  })
})
