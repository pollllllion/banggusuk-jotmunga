import { describe, it, expect } from 'vitest'
import { originOf } from '@/utils/origin'

/** 판별에 쓰이는 네 칸만 담은 최소 행 */
const c = (x: {
  title: string
  originalTitle?: string | null
  originalLanguage?: string | null
  originCountries?: string[] | null
}) => ({
  title: x.title,
  originalTitle: x.originalTitle ?? null,
  originalLanguage: x.originalLanguage ?? null,
  originCountries: x.originCountries ?? null,
})

describe('originOf — 제작국·원어로 판별', () => {
  it('제작국에 KR 이 있으면 한국', () => {
    expect(originOf(c({ title: '폭싹 속았수다', originalLanguage: 'ko', originCountries: ['KR'] }))).toBe('kr')
  })

  it('공동제작이어도 KR 이 끼어 있으면 한국', () => {
    // 실제 데이터: 로스트 호라이즌 — 남아공·미국·캐나다·한국 공동제작, 원어는 영어
    expect(originOf(c({
      title: '로스트 호라이즌', originalTitle: 'Lost Horizon',
      originalLanguage: 'en', originCountries: ['ZA', 'US', 'CA', 'KR'],
    }))).toBe('kr')
  })

  it('제작국이 있으면 그것만 본다 — 원어가 ko 로 잘못 들어와 있어도 제작국이 이긴다', () => {
    // 실측: TMDB 가 original_language 를 자주 틀린다. 둘을 OR 로 묶었더니
    // 아르헨티나·네덜란드 영화와 일본·중국 영화가 '한국' 칸에 앉았다.
    expect(originOf(c({
      title: '아틀라스 마리아', originalTitle: 'Atlas María',
      originalLanguage: 'ko', originCountries: ['AR', 'NL'],
    }))).toBe('foreign')
    expect(originOf(c({
      title: '밤이 내릴 때', originalTitle: 'The Night Fall',
      originalLanguage: 'ko', originCountries: ['JP', 'CN'],
    }))).toBe('foreign')
  })

  it('제작국이 비어 있을 때만 원어를 본다', () => {
    // 실제 데이터: 콘서트 실황은 TMDB 에 제작국이 없는 경우가 잦다
    expect(originOf(c({
      title: '2026 aespa LIVE TOUR - SYNK : COMPLaeXITY',
      originalTitle: '2026 aespa LIVE TOUR - SYNK : COMPLaeXITY',
      originalLanguage: 'ko', originCountries: [],
    }))).toBe('kr')
  })

  it('원어 제목이 영어인 한국 작품도 이제 한국으로 잡힌다 (옛 판별이 틀리던 자리 ①)', () => {
    expect(originOf(c({
      title: 'K-Beauty Pop Up', originalTitle: 'K-Beauty Pop Up',
      originalLanguage: 'ko', originCountries: ['KR'],
    }))).toBe('kr')
    expect(originOf(c({
      title: 'see your eyes', originalTitle: 'see your eyes',
      originalLanguage: 'ko', originCountries: ['KR'],
    }))).toBe('kr')
  })

  it('원어 제목이 없는 외국 영화도 이제 외국으로 잡힌다 (옛 판별이 틀리던 자리 ②)', () => {
    // 옛 판별은 원어 제목이 없으면 한국어 **번역** 제목을 봤다 → 전부 '한국'이 됐다
    expect(originOf(c({ title: '킬 빌: 2부', originalLanguage: 'en', originCountries: ['US'] }))).toBe('foreign')
    expect(originOf(c({ title: '파이트 클럽', originalLanguage: 'en', originCountries: ['DE', 'US'] }))).toBe('foreign')
    expect(originOf(c({ title: '장고: 분노의 추적자', originalLanguage: 'en', originCountries: ['US'] }))).toBe('foreign')
  })

  it('한국어 제목으로 들어온 외국 작품은 외국', () => {
    expect(originOf(c({ title: '아우터뱅크스 시즌5', originalTitle: 'Outer Banks', originalLanguage: 'en', originCountries: ['US'] }))).toBe('foreign')
    expect(originOf(c({ title: '원피스 시즌2', originalTitle: 'ONE PIECE', originalLanguage: 'ja', originCountries: ['JP'] }))).toBe('foreign')
  })

  /**
   * 근거가 둘 다 없는 행 = TMDB 가 없는 수기 등록 작품(웹툰·웹소설·숏폼·유튜브).
   * 거기서는 예전처럼 제목의 한글로 본다 — 더 나은 근거가 없다.
   * migration_origin 을 적용하기 전의 모든 행도 이 길로 간다.
   */
  describe('제작국·원어가 둘 다 없으면 제목의 한글로 (수기 등록 작품)', () => {
    it('한글 제목이면 한국', () => {
      expect(originOf(c({ title: '카지노' }))).toBe('kr')
      expect(originOf(c({ title: '전지적독자시점' }))).toBe('kr')
      expect(originOf(c({ title: '나노마신', originalTitle: '' }))).toBe('kr')
    })

    it('원어 제목이 있으면 그쪽을 먼저 본다', () => {
      expect(originOf(c({ title: '나의 해방일지', originalTitle: '나의 해방일지' }))).toBe('kr')
      expect(originOf(c({ title: '문호 스트레이독스 멍! 시즌2', originalTitle: '文豪ストレイドッグス わん!' }))).toBe('foreign')
    })

    it('둘 다 외국어면 외국', () => {
      expect(originOf(c({ title: 'Between Doors' }))).toBe('foreign')
    })
  })

  it('빈 배열은 "제작국을 모른다"는 뜻 — 그때는 원어로 넘어간다', () => {
    expect(originOf(c({ title: 'Some Show', originalLanguage: 'en', originCountries: [] }))).toBe('foreign')
    expect(originOf(c({ title: 'Some K-Show', originalLanguage: 'ko', originCountries: [] }))).toBe('kr')
  })
})
