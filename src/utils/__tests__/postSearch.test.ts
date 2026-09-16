import { describe, it, expect } from 'vitest'
import { scorePost, snippet, SCORE } from '../postSearch'

describe('scorePost', () => {
  it('제목이 본문보다 앞선다', () => {
    const inTitle = scorePost('좀비', '좀비물 설정 얘기', '아무 말')
    const inBody = scorePost('좀비', '설정 얘기', '이건 좀비물이다')
    expect(inTitle).toBeGreaterThan(inBody)
  })

  it('완전일치 > 앞부분 > 포함 순', () => {
    expect(scorePost('좀비', '좀비', '')).toBe(SCORE.titleExact)
    expect(scorePost('좀비', '좀비물 후기', '')).toBe(SCORE.titlePrefix)
    expect(scorePost('좀비', '오늘 본 좀비물', '')).toBe(SCORE.titleIncludes)
  })

  it('대소문자를 가리지 않는다', () => {
    expect(scorePost('netflix', 'NETFLIX 신작', '')).toBe(SCORE.titlePrefix)
  })

  it('제목이 없는 옛 글도 본문으로 걸린다', () => {
    expect(scorePost('좀비', null, '좀비 나오는 거')).toBe(SCORE.bodyIncludes)
  })

  it('안 맞으면 0', () => {
    expect(scorePost('좀비', '로맨스', '달달하다')).toBe(0)
    expect(scorePost('   ', '좀비', '좀비')).toBe(0)
  })

  /**
   * 작품 검색과 달리 공백을 지우지 않는다 — 사람이 쓴 문장에서 공백을 지우면
   * 말이 뭉개져 엉뚱한 자리에 걸린다. 이 차이를 시험으로 박아 둔다.
   */
  it('띄어쓰기를 지우지 않는다 (작품 검색과 다른 점)', () => {
    expect(scorePost('이상', '이 상황이 웃김', '')).toBe(0)
  })
})

describe('snippet', () => {
  it('짧은 글은 그대로 (자르지 않는다)', () => {
    expect(snippet('짧은 글이다', '글')).toBe('짧은 글이다')
  })

  it('검색어가 뒤쪽에 있어도 그 자리를 잘라 온다', () => {
    const body = '가'.repeat(200) + '좀비' + '나'.repeat(200)
    const out = snippet(body, '좀비', 10)
    expect(out).toContain('좀비')
    expect(out.startsWith('…')).toBe(true)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThan(40)
  })

  it('줄바꿈·연속 공백을 한 칸으로 줄인다', () => {
    expect(snippet('앞\n\n  뒤', '앞')).toBe('앞 뒤')
  })

  it('검색어가 없으면 앞에서부터 자른다', () => {
    const out = snippet('가'.repeat(100), '없는말', 10)
    expect(out.endsWith('…')).toBe(true)
    expect(out.startsWith('…')).toBe(false)
  })
})
