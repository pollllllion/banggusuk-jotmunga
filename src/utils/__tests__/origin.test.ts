import { describe, it, expect } from 'vitest'
import { originOf } from '@/utils/origin'

const c = (title: string, originalTitle?: string | null) => ({ title, originalTitle: originalTitle ?? null })

describe('originOf — 제작국 판별', () => {
  it('원어 제목에 한글이 있으면 한국', () => {
    expect(originOf(c('나의 해방일지', '나의 해방일지'))).toBe('kr')
    expect(originOf(c('폭싹 속았수다', '폭싹 속았수다'))).toBe('kr')
  })

  it('원어 제목이 외국어면 외국 — 한국어 제목으로 들어와도 원어를 본다', () => {
    // 실제 데이터: 화면 제목은 한글이지만 원작은 미국·일본 작품이다
    expect(originOf(c('아우터뱅크스 시즌5', 'Outer Banks'))).toBe('foreign')
    expect(originOf(c('원피스 시즌2', 'ONE PIECE'))).toBe('foreign')
    expect(originOf(c('문호 스트레이독스 멍! 시즌2', '文豪ストレイドッグス わん!'))).toBe('foreign')
  })

  it('원어 제목이 없으면 제목으로 본다 — 손으로 넣은 국내 작품이 여기 걸린다', () => {
    expect(originOf(c('카지노'))).toBe('kr')
    expect(originOf(c('전지적독자시점'))).toBe('kr')
    expect(originOf(c('나노마신', ''))).toBe('kr')
  })

  it('제목도 원어도 외국어면 외국', () => {
    expect(originOf(c('Between Doors'))).toBe('foreign')
  })

  it('원어 제목이 한글 없는 한국 작품은 외국으로 잡힌다 — 알려진 한계', () => {
    // original_language 컬럼이 없어서 생기는 오판. 고치려면 마이그레이션 + 재수집이 필요하다.
    expect(originOf(c('팬서비스', 'Fan Service'))).toBe('foreign')
  })
})
