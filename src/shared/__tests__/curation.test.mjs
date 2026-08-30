import { describe, it, expect } from 'vitest'
import { publishBlockers, bodyParagraphs, curationBodyLines, MIN_BODY, MIN_NOTE } from '../curationSeo.mjs'
import { buildDraft, buildSlug, listCandidates, candidateCounts, monthRange, weekRange, slugify } from '../curationDraft.mjs'

/** 발행 조건을 다 채운 글 */
function full(over = {}) {
  return {
    id: '2026-09-netflix',
    title: '2026년 9월 넷플릭스 공개작 정리',
    summary: '9월 넷플릭스 공개작 5편을 공개일 순으로 정리했습니다.',
    body: '가'.repeat(MIN_BODY),
    items: [
      { contentId: 'a', note: '나'.repeat(MIN_NOTE) },
      { contentId: 'b', note: '다'.repeat(MIN_NOTE) },
      { contentId: 'c', note: '라'.repeat(MIN_NOTE) },
    ],
    status: 'draft',
    ...over,
  }
}

describe('publishBlockers', () => {
  it('다 채우면 통과', () => {
    expect(publishBlockers(full())).toEqual([])
  })

  it('초안 생성 직후(본문·코멘트 빈 상태)는 막는다 — 이게 이 가드의 존재 이유', () => {
    const draft = full({ body: '', items: [{ contentId: 'a', note: '' }, { contentId: 'b', note: '' }, { contentId: 'c', note: '' }] })
    const b = publishBlockers(draft)
    expect(b.length).toBe(2)
    expect(b.join()).toMatch(/본문/)
    expect(b.join()).toMatch(/코멘트/)
  })

  it('본문이 한 글자라도 모자라면 막는다', () => {
    expect(publishBlockers(full({ body: '가'.repeat(MIN_BODY - 1) }))).toHaveLength(1)
  })

  it('코멘트가 짧은 작품이 하나만 있어도 막는다', () => {
    const c = full()
    c.items[1].note = '짧음'
    expect(publishBlockers(c)).toHaveLength(1)
  })

  it('작품이 3편 미만이면 막는다', () => {
    expect(publishBlockers(full({ items: full().items.slice(0, 2) }))).toHaveLength(1)
  })

  it('공백만 채운 본문은 통과하지 못한다', () => {
    expect(publishBlockers(full({ body: ' '.repeat(MIN_BODY + 10) }))).toHaveLength(1)
  })
})

describe('bodyParagraphs', () => {
  it('빈 줄로 문단을 나눈다', () => {
    expect(bodyParagraphs({ body: '첫째.\n\n둘째.\n\n\n셋째.' })).toEqual(['첫째.', '둘째.', '셋째.'])
  })
  it('본문이 없으면 빈 배열', () => {
    expect(bodyParagraphs({})).toEqual([])
  })
})

describe('curationBodyLines', () => {
  const byId = new Map([['a', { id: 'a', title: '작품 A', posterUrl: 'p.jpg' }]])

  it('문단 다음에 작품이 온다 (앱 화면·프리렌더 순서가 같아야 한다)', () => {
    const lines = curationBodyLines({ body: '도입.', items: [{ contentId: 'a', note: '코멘트' }] }, byId)
    expect(lines.map(l => l.kind)).toEqual(['p', 'item'])
    expect(lines[1].title).toBe('작품 A')
    expect(lines[1].href).toBe('/content/a')
  })

  it('캐시에 없는 작품도 죽지 않는다', () => {
    const lines = curationBodyLines({ body: '', items: [{ contentId: 'zzz', note: 'n' }] }, byId)
    expect(lines[0].exists).toBe(false)
    expect(lines[0].title).toBe('zzz')
  })
})

describe('monthRange / weekRange', () => {
  it('윤년 2월 말일을 맞춘다', () => {
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
  it('평년 2월', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
  it('주간은 시작일 포함 7일', () => {
    expect(weekRange('2026-09-28')).toEqual({ from: '2026-09-28', to: '2026-10-04' })
  })
})

describe('slugify', () => {
  it('프리렌더 SAFE_ID 를 만족한다', () => {
    expect(slugify('a b/../c')).toMatch(/^[A-Za-z0-9._~-]+$/)
  })
  it('전부 걸러지면 기본값', () => {
    expect(slugify('한글만')).toBe('curation')
  })
})

describe('buildSlug', () => {
  it('월간 + OTT', () => {
    expect(buildSlug({ mode: 'month', from: '2026-09-01', ottName: 'Netflix' })).toBe('2026-09-netflix')
  })
  it('공백 있는 provider 이름도 처리한다', () => {
    expect(buildSlug({ mode: 'month', from: '2026-09-01', ottName: 'Disney Plus' })).toBe('2026-09-disney-plus')
  })
  it('주간은 시작일 전체를 쓴다', () => {
    expect(buildSlug({ mode: 'week', from: '2026-09-28', ottName: 'TVING', type: 'drama' })).toBe('2026-09-28-tving-drama')
  })
  it('필터가 없으면 기간만', () => {
    expect(buildSlug({ mode: 'month', from: '2026-09-01' })).toBe('2026-09')
  })
  it('한글 제목에서 만들지 않는다 — OTT 가 달라도 같은 슬러그가 되던 버그', () => {
    const a = buildSlug({ mode: 'month', from: '2026-09-01', ottName: 'Netflix' })
    const b = buildSlug({ mode: 'month', from: '2026-09-01', ottName: 'TVING' })
    expect(a).not.toBe(b)
  })
  it('프리렌더 SAFE_ID 를 만족한다', () => {
    expect(buildSlug({ mode: 'month', from: '2026-09-01', ottName: 'Amazon Prime Video' })).toMatch(/^[A-Za-z0-9._~-]+$/)
  })
})

describe('buildDraft', () => {
  const contents = [
    { id: 'm1', title: '9월작 인기', type: 'movie', releaseDate: '2026-09-10', popularity: 100, providers: [{ providerName: 'Netflix' }] },
    { id: 'm2', title: '9월작 앞날짜', type: 'movie', releaseDate: '2026-09-02', popularity: 50, providers: [{ providerName: 'Netflix' }] },
    { id: 'm3', title: '10월작', type: 'movie', releaseDate: '2026-10-02', popularity: 90, providers: [{ providerName: 'Netflix' }] },
    { id: 'd1', title: '9월 티빙 드라마', type: 'drama', releaseDate: '2026-09-05', popularity: 80, providers: [{ providerName: 'TVING' }] },
    { id: 'h1', title: '숨김작', type: 'movie', releaseDate: '2026-09-06', popularity: 999, hidden: true, providers: [{ providerName: 'Netflix' }] },
  ]
  const { from, to } = monthRange('2026-09')

  it('기간 밖·숨김 작품은 빠진다', () => {
    const d = buildDraft({ contents, from, to, periodLabel: '2026년 9월' })
    expect(d.items.map(i => i.contentId)).not.toContain('m3')
    expect(d.items.map(i => i.contentId)).not.toContain('h1')
  })

  it('OTT 필터가 걸린다', () => {
    const d = buildDraft({ contents, from, to, ottName: 'Netflix', ottLabel: '넷플릭스', periodLabel: '2026년 9월' })
    expect(d.items.map(i => i.contentId)).toEqual(['m2', 'm1'])
    expect(d.title).toBe('2026년 9월 넷플릭스 공개작 정리')
    expect(d.id).toBe('2026-09-netflix')
  })

  it('인기순으로 고르되 공개일 순으로 싣는다', () => {
    const d = buildDraft({ contents, from, to, limit: 2, periodLabel: '2026년 9월' })
    // 인기 100(m1) · 80(d1) 이 뽑히고, 실릴 땐 날짜순 d1(9/5) → m1(9/10)
    expect(d.items.map(i => i.contentId)).toEqual(['d1', 'm1'])
  })

  it('본문과 코멘트는 비워서 준다 — 자동 문장을 발행하지 못하게', () => {
    const d = buildDraft({ contents, from, to, periodLabel: '2026년 9월' })
    expect(d.body).toBe('')
    expect(d.items.every(i => i.note === '')).toBe(true)
    expect(publishBlockers(d).length).toBeGreaterThan(0)
  })

  it('contentIds 를 주면 그것만 싣고, 인기순 상한을 무시한다', () => {
    const d = buildDraft({ contents, from, to, contentIds: ['m1', 'd1'], limit: 1, periodLabel: '2026년 9월' })
    expect(d.items.map(i => i.contentId)).toEqual(['d1', 'm1'])   // 실릴 땐 공개일 순
  })

  it('contentIds 는 기간·필터 밖 작품도 실을 수 있다 (사람이 고른 것을 존중)', () => {
    const d = buildDraft({ contents, from, to, ottName: 'Netflix', contentIds: ['m3'], periodLabel: '2026년 9월' })
    expect(d.items.map(i => i.contentId)).toEqual(['m3'])
  })

  it('manualOverride 공개일을 우선한다', () => {
    const c = [{ id: 'x', title: 'x', type: 'movie', releaseDate: '2026-10-01', manualOverride: true, manualReleaseDate: '2026-09-15', popularity: 1 }]
    const d = buildDraft({ contents: c, from, to, periodLabel: '2026년 9월' })
    expect(d.items.map(i => i.contentId)).toEqual(['x'])
  })
})

describe('listCandidates', () => {
  const contents = [
    { id: 'm1', title: '인기작', type: 'movie', releaseDate: '2026-09-10', popularity: 100, voteAverage: 7.5, voteCount: 20, providers: [{ providerName: 'Netflix' }] },
    { id: 'm2', title: '비인기작', type: 'movie', releaseDate: '2026-09-02', popularity: 5, providers: [{ providerName: 'Netflix' }] },
    { id: 'd1', title: '티빙작', type: 'drama', releaseDate: '2026-09-05', popularity: 80, providers: [{ providerName: 'TVING' }] },
    { id: 'h1', title: '숨김작', type: 'movie', releaseDate: '2026-09-06', popularity: 999, hidden: true },
  ]
  const { from, to } = monthRange('2026-09')

  it('인기순으로 준다 — 고르기 위한 목록이라 날짜순이 아니다', () => {
    expect(listCandidates({ contents, from, to }).map(h => h.contentId)).toEqual(['m1', 'd1', 'm2'])
  })

  it('숨김 작품은 빠진다', () => {
    expect(listCandidates({ contents, from, to }).map(h => h.contentId)).not.toContain('h1')
  })

  it('OTT 필터가 걸린다', () => {
    expect(listCandidates({ contents, from, to, ottName: 'TVING' }).map(h => h.contentId)).toEqual(['d1'])
  })

  it('고를 때 판단할 값을 같이 준다', () => {
    const [top] = listCandidates({ contents, from, to })
    expect(top).toMatchObject({ title: '인기작', day: '9월 10일', popularity: 100, voteAverage: 7.5, voteCount: 20 })
  })

  it('평가가 없는 작품도 죽지 않는다', () => {
    const h = listCandidates({ contents, from, to }).find(x => x.contentId === 'm2')
    expect(h.voteCount).toBe(0)
  })
})

describe('candidateCounts', () => {
  const contents = [
    // 극장 개봉작 — providers 가 비어 있다 (JustWatch 는 OTT 제공 정보라 극장작이 없다)
    { id: 'th1', title: '극장영화1', type: 'movie', releaseDate: '2026-09-04', popularity: 60 },
    { id: 'th2', title: '극장영화2', type: 'movie', releaseDate: '2026-09-11', popularity: 50, providers: [] },
    { id: 'nf1', title: '넷플영화', type: 'movie', releaseDate: '2026-09-18', popularity: 40, providers: [{ providerName: 'Netflix' }] },
    { id: 'nd1', title: '넷플드라마', type: 'drama', releaseDate: '2026-09-20', popularity: 30, providers: [{ providerName: 'Netflix' }] },
    { id: 'h1', title: '숨김작', type: 'movie', releaseDate: '2026-09-06', popularity: 999, hidden: true },
  ]
  const { from, to } = monthRange('2026-09')

  it('단계마다 몇 편이 남는지 센다', () => {
    expect(candidateCounts({ contents, from, to })).toEqual({ inRange: 4, afterType: 4, afterOtt: 4, noProviders: 2 })
  })

  it('OTT + 영화를 겹치면 극장 개봉작이 빠지는 게 보인다 — 사용자가 신고한 그 상황', () => {
    const c = candidateCounts({ contents, from, to, ottName: 'Netflix', type: 'movie' })
    expect(c.afterType).toBe(3)     // 영화 3편
    expect(c.afterOtt).toBe(1)      // 그중 넷플릭스는 1편
    expect(c.noProviders).toBe(2)   // 나머지 2편은 OTT 정보 자체가 없다
  })

  it('providers 가 undefined 든 [] 든 똑같이 센다', () => {
    expect(candidateCounts({ contents, from, to, type: 'movie' }).noProviders).toBe(2)
  })
})
