import type { Content } from '@/types'

/**
 * 작품 둘러보기 장르 필터의 어휘.
 *
 * ── 왜 따로 두나 ─────────────────────────────────────────────
 * `constants.ts` 의 `GENRES` 는 **사람이 고르는 말**이다 — 취향 프로필의 '좋아하는 장르',
 * 관리자가 작품에 손으로 붙이는 태그. 무협·느와르·사극처럼 TMDB 에 없는 말도 뜻이 있다.
 *
 * 둘러보기 필터는 반대로 **데이터에 있는 말**이어야 한다. 그 둘을 한 목록으로 쓰다가
 * 2026-09-16 에 이런 상태가 됐다(실측):
 *
 *   · 칩 5개(무협·느와르·일상·성장·사극)는 눌러도 **0건** — 죽은 버튼
 *   · 다큐멘터리 292 · 애니메이션 277 · 범죄 263 · 예능 234편은 칩이 아예 없어 **접근 불가**
 *   · `SF·판타지` 171편은 'SF' 로도 '판타지' 로도 안 걸림 (정확일치라서)
 *   · `액션·모험` 137편은 '액션' 으로 안 걸림
 *   → 공개 작품 2,423편 중 **어떤 칩으로도 안 나오는 작품이 806편(33%)**
 *
 * 이 파일은 그 어휘를 데이터 쪽에 맞춘다. 정규화 후 94% 가 걸린다(남는 6% 는 장르가 아예 없는 행).
 */

/**
 * TMDB 가 영화/TV 에 다른 장르 체계를 쓰는 탓에 생기는 합성·변종 이름을 쪼갠다.
 * 화면에 보이는 이름은 안 바꾼다 — **거르는 데만** 쓴다(작품방은 TMDB 원문 그대로 보여준다).
 *
 * 빈 배열은 '거르기에 쓸 말이 아님'이라는 뜻이다(TV영화는 장르가 아니라 편성 형태다).
 */
export const GENRE_ALIASES: Record<string, string[]> = {
  'SF·판타지': ['SF', '판타지'],
  'Sci-Fi & Fantasy': ['SF', '판타지'],   // ko-KR 번역이 안 온 옛 행
  '액션·모험': ['액션', '모험'],
  '전쟁·정치': ['전쟁'],
  '멜로': ['로맨스'],
  '토크쇼': ['예능'],
  '키즈': ['가족'],
  'TV영화': [],
}

/** 거르기용 장르 목록 — 합성 이름을 부분으로 펼치고 중복을 없앤다 */
export function normalizeGenres(genres: string[] | null | undefined): string[] {
  const out = new Set<string>()
  for (const g of genres || []) {
    const alias = GENRE_ALIASES[g]
    if (alias) alias.forEach(a => out.add(a))
    else if (g) out.add(g)
  }
  return [...out]
}

/**
 * 둘러보기에 띄우는 칩. **작품 수가 많은 순**이고, 25편 미만은 뺐다(서부 6 · 뉴스 1).
 * 2026-09-16 실측 기준이다. 작품이 크게 늘면 다시 재 볼 것 —
 * 죽은 칩이 생기는 것보다 목록이 좀 낡은 편이 낫다.
 */
export const BROWSE_GENRES = [
  '드라마', '코미디', '다큐멘터리', '액션', '애니메이션', '예능', '범죄',
  '판타지', 'SF', '미스터리', '모험', '스릴러', '로맨스', '가족', '공포', '음악',
  '역사', '전쟁',
] as const

/** 이 작품이 고른 장르들 중 하나라도 해당하나 (하나도 안 고르면 통과) */
export function matchesGenres(content: Content, picked: string[]): boolean {
  if (!picked.length) return true
  const mine = normalizeGenres(content.genres)
  return picked.some(g => mine.includes(g))
}
