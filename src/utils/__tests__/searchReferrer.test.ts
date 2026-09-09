import { describe, it, expect } from 'vitest'
import { searchQueryFromReferrer, referrerHost } from '../searchReferrer'

/**
 * 검색엔진마다 검색어를 넘기는 규칙이 다르다. 여기가 틀리면
 * "네이버에서 뭘 검색해 들어왔나"가 통째로 비거나, 엉뚱한 값이 검색어로 쌓인다.
 */
describe('searchQueryFromReferrer', () => {
  it('네이버 — query 파라미터', () => {
    expect(searchQueryFromReferrer('https://search.naver.com/search.naver?where=nexearch&query=오징어게임'))
      .toBe('오징어게임')
  })

  it('네이버 모바일', () => {
    expect(searchQueryFromReferrer('https://m.search.naver.com/search.naver?query=넷플릭스 신작'))
      .toBe('넷플릭스 신작')
  })

  it('다음 — q 파라미터', () => {
    expect(searchQueryFromReferrer('https://search.daum.net/search?w=tot&q=디즈니플러스 공개일'))
      .toBe('디즈니플러스 공개일')
  })

  it('줌·네이트', () => {
    expect(searchQueryFromReferrer('https://search.zum.com/search.zum?query=개봉예정')).toBe('개봉예정')
    expect(searchQueryFromReferrer('https://search.nate.com/search/all?q=영화순위')).toBe('영화순위')
  })

  it('구글은 검색어를 안 넘긴다 — 넘겨도 파라미터가 없으니 null', () => {
    // 실제로 구글이 보내는 referrer 는 이 모양이다(검색어 없음)
    expect(searchQueryFromReferrer('https://www.google.com/')).toBeNull()
    expect(searchQueryFromReferrer('https://www.google.com/search')).toBeNull()
  })

  it('검색엔진이 아니면 검색어를 보지 않는다', () => {
    // 남의 사이트 URL 에 우연히 q= 가 있어도 검색어로 쌓으면 안 된다
    expect(searchQueryFromReferrer('https://example.com/page?q=비밀값')).toBeNull()
    expect(searchQueryFromReferrer('https://blog.naver.com/someone/12345?q=abc')).toBeNull()
  })

  it('없거나 깨진 값은 null', () => {
    expect(searchQueryFromReferrer(null)).toBeNull()
    expect(searchQueryFromReferrer(undefined)).toBeNull()
    expect(searchQueryFromReferrer('')).toBeNull()
    expect(searchQueryFromReferrer('그냥 문자열')).toBeNull()
  })

  it('빈 검색어·지나치게 긴 값은 버린다', () => {
    expect(searchQueryFromReferrer('https://search.naver.com/search.naver?query=')).toBeNull()
    expect(searchQueryFromReferrer('https://search.naver.com/search.naver?query=' + 'ㄱ'.repeat(200))).toBeNull()
  })

  it('연속 공백은 한 칸으로 정리한다', () => {
    expect(searchQueryFromReferrer('https://search.naver.com/search.naver?query=오징어   게임'))
      .toBe('오징어 게임')
  })
})

describe('referrerHost', () => {
  it('www 를 떼고 도메인만 남긴다', () => {
    expect(referrerHost('https://www.google.com/search?q=x', 'ottcal.com')).toBe('google.com')
    expect(referrerHost('https://search.naver.com/x', 'ottcal.com')).toBe('search.naver.com')
  })

  it('사이트 안 이동은 유입이 아니다', () => {
    expect(referrerHost('https://ottcal.com/talk', 'ottcal.com')).toBeNull()
    expect(referrerHost('https://www.ottcal.com/talk', 'ottcal.com')).toBeNull()
  })

  it('없거나 깨진 값은 null', () => {
    expect(referrerHost(null, 'ottcal.com')).toBeNull()
    expect(referrerHost('아무말', 'ottcal.com')).toBeNull()
  })
})
