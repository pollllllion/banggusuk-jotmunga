/**
 * 작품 페이지를 검색엔진에 색인시킬지 판단한다 — 앱·sitemap·프리렌더 공용 단일 소스
 *
 * 왜 필요한가 (2026-08-09):
 *   서치콘솔이 ottcal.com 페이지 1,250개를 "발견됨 - 현재 색인이 생성되지 않음"으로
 *   묶어두고 색인은 1개만 만들었다. 신규 도메인의 크롤 예산이 적은 것도 있지만,
 *   TMDB 에서 긁어온 작품 중 상당수가 본문이 "제목 · 공개일" 두어 줄뿐인 얇은 페이지다.
 *   얇은 페이지를 대량으로 sitemap 에 밀어 넣으면 사이트 전체 평가가 깎이고,
 *   정작 색인시켜야 할 캘린더·토론글까지 뒤로 밀린다.
 *   → 알맹이가 없는 페이지는 sitemap 에서 빼고 noindex 를 단다. URL 자체는 살아 있다.
 *
 * 판단 기준은 "크롤러가 실제로 읽는 본문 글자수". 프리렌더가 그리는 본문과
 * 같은 함수(contentBodyLines)로 재는 것이 핵심이다. 여기서 갈리면 sitemap 에는
 * 있는데 페이지는 noindex 인 모순이 생긴다.
 */

import { TYPE_LABELS, todayKey, effectiveReleaseDate, isUpcoming } from './contentSeo.mjs'

/**
 * 색인 대상이 되기 위한 최소 본문 길이(자).
 *
 * 실측(2026-08-09, 작품 1,908개) 기준으로 정한 값이다.
 *   ~120자  : "숨바꼭질 2 드라마 · 2026. 07. 31 공개" 수준. 제목·날짜·출연진 몇 명이 전부라
 *             어느 집계 사이트에나 있는 내용이다 → 제외(275개)
 *   120자~  : 줄거리 한 문단이 붙기 시작한다. 이 사이트에만 있는 값은 아니어도
 *             검색 결과로서 최소한의 쓸모가 있다 → 유지
 */
export const MIN_INDEXABLE_BODY_CHARS = 120

/**
 * 프리렌더 본문에 들어가는 문장들 (제목·포스터 제외, 순서 유지).
 * scripts/prerender.mjs 가 이 배열을 <p> 로 감싸 그린다.
 */
export function contentBodyLines(c, today = todayKey()) {
  const typeLabel = TYPE_LABELS[c.type] || '작품'
  const rel = effectiveReleaseDate(c)
  const upcoming = isUpcoming(c, today)
  const ott = [...new Set((c.providers || []).map(p => p.providerName).filter(Boolean))]
  const cast = (c.castMembers || []).map(m => m.name).filter(Boolean).slice(0, 8)

  return [
    c.originalTitle && c.originalTitle !== c.title ? `원제: ${c.originalTitle}` : '',
    `${typeLabel}${rel ? ` · ${rel.replace(/-/g, '. ')} ${upcoming ? '공개 예정' : '공개'}` : ''}`,
    ott.length ? `공개 플랫폼: ${ott.join(', ')}` : (c.platform ? `플랫폼: ${c.platform}` : ''),
    c.genres?.length ? `장르: ${c.genres.join(', ')}` : '',
    c.creators?.length ? `연출·제작: ${c.creators.join(', ')}` : '',
    cast.length ? `출연: ${cast.join(', ')}` : '',
    c.synopsis ? String(c.synopsis).trim() : '',
    c.reviewCount > 0 ? `평점 ${Number(c.avgRating).toFixed(1)}/10 (별점 ${c.reviewCount}개)` : '',
  ].filter(Boolean)
}

/** 크롤러가 읽는 본문 글자수 (제목 포함) */
export function contentTextLength(c, today = todayKey()) {
  return [c.title, ...contentBodyLines(c, today)].join(' ').trim().length
}

/**
 * 이 작품 페이지를 색인시킬 것인가.
 *
 * @param c 작품 행
 * @param opts.discussionCount 이 작품에 달린 토론글 수. 사람이 쓴 글이 하나라도
 *        붙어 있으면 그 자체가 이 사이트에만 있는 내용이므로 길이와 무관하게 색인한다.
 */
export function isIndexableContent(c, { today = todayKey(), discussionCount = 0 } = {}) {
  if (!c) return false
  if (c.hidden === true) return false
  if (discussionCount > 0 || c.reviewCount > 0) return true
  return contentTextLength(c, today) >= MIN_INDEXABLE_BODY_CHARS
}
