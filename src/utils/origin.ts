import type { Content } from '@/types'

/** 제작국 구분 — 지금은 둘뿐이다(한국 / 그 밖) */
export type Origin = 'kr' | 'foreign'

const HANGUL = /[가-힣]/

/**
 * 이 작품이 한국 작품인가 — **원어 제목의 한글 여부**로 가른다.
 *
 * DB 에 제작국·원어 컬럼이 없다. TMDB 응답에는 original_language 가 있지만
 * 수집 스크립트가 저장하지 않는다(scripts/sync-tmdb-ott.mjs 는 originalTitle 까지만 담는다).
 * 컬럼을 새로 만들어 2,400편을 TMDB 에 다시 물어 채울 수도 있지만, 그 전에
 * **이미 갖고 있는 값으로 되는지**부터 봤다 — 된다:
 *   원어 제목에 한글 있음 1,046편 · 없음 1,264편 (2026-09-16 실측)
 * 이 판별법은 이 repo 에서 이미 쓰고 있다(scripts/collect-signals.mjs 의 화제성 가중치).
 *
 * originalTitle 이 비어 있는 109편은 대부분 손으로 넣은 국내 작품이다
 * (나의 해방일지 · 카지노 · 형사록 · 웹툰/웹소설). 그래서 **제목으로 한 번 더** 본다.
 *
 * ⚠️ 틀리는 경우: 원어 제목이 영어인 한국 작품('Between Doors' 같은 숏폼).
 *    그런 건 외국으로 잡힌다. 정확히 하려면 original_language 컬럼을 만들어야 하는데,
 *    그건 마이그레이션 + 2,400건 재수집이라 값이 그만큼 나올 때 하는 게 맞다.
 */
export function originOf(c: Pick<Content, 'title' | 'originalTitle'>): Origin {
  const orig = c.originalTitle?.trim()
  if (orig) return HANGUL.test(orig) ? 'kr' : 'foreign'
  // 원어 제목이 없으면 화면에 쓰는 제목으로 — 손으로 넣은 국내 작품이 여기 걸린다
  return HANGUL.test(c.title || '') ? 'kr' : 'foreign'
}

export const ORIGIN_FILTERS: { code: Origin; label: string }[] = [
  { code: 'kr', label: '한국' },
  { code: 'foreign', label: '외국' },
]
