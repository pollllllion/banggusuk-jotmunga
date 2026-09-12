import { describe, it, expect } from 'vitest'
import { parseNaverKeywords } from '../naverKeywords.mjs'

describe('parseNaverKeywords', () => {
  it('탭으로 나뉜 표 — 순위·검색어·클릭·노출', () => {
    expect(parseNaverKeywords('1\t방구석좆문가\t12\t340\n2\t넷플릭스 공개일\t8\t210')).toEqual([
      { query: '방구석좆문가', clicks: 12, impressions: 340 },
      { query: '넷플릭스 공개일', clicks: 8, impressions: 210 },
    ])
  })

  it('공백만 있는 붙여넣기에서도 검색어의 공백을 살린다', () => {
    expect(parseNaverKeywords('1 넷플릭스 공개일 8 210')).toEqual([
      { query: '넷플릭스 공개일', clicks: 8, impressions: 210 },
    ])
  })

  it('숫자가 하나면 클릭수로 읽는다', () => {
    expect(parseNaverKeywords('오늘 뭐 보지\t5')).toEqual([
      { query: '오늘 뭐 보지', clicks: 5, impressions: 0 },
    ])
  })

  it('천 단위 쉼표를 읽는다', () => {
    expect(parseNaverKeywords('인기 드라마\t1,204\t12,340')[0]).toEqual(
      { query: '인기 드라마', clicks: 1204, impressions: 12340 },
    )
  })

  it('머리글·빈 줄처럼 숫자가 없는 줄은 버린다', () => {
    expect(parseNaverKeywords('순위\t검색어\t클릭수\n\n1\t방좋\t3\t9')).toEqual([
      { query: '방좋', clicks: 3, impressions: 9 },
    ])
  })

  it('순위 번호가 없어도 읽는다', () => {
    expect(parseNaverKeywords('방좋\t3\t9')).toEqual([{ query: '방좋', clicks: 3, impressions: 9 }])
  })

  it('같은 검색어가 두 번 나오면 한 번만', () => {
    expect(parseNaverKeywords('방좋\t3\t9\n방좋\t4\t10')).toHaveLength(1)
  })

  it('검색어가 숫자뿐인 줄은 버린다 — 표 꼬리의 합계 같은 것', () => {
    expect(parseNaverKeywords('123\t456')).toEqual([])
  })

  it('빈 입력에도 죽지 않는다', () => {
    expect(parseNaverKeywords('')).toEqual([])
    expect(parseNaverKeywords(null)).toEqual([])
  })
})
