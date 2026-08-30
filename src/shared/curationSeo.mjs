/**
 * 큐레이션 글의 SEO 문구·본문·발행 가드 — 앱과 빌드 스크립트가 공유하는 단일 소스
 *
 * 왜 .mjs 인가: contentSeo.mjs 와 같은 이유. 프리렌더(scripts/prerender.mjs)는 Node 에서
 * 그냥 돌아야 하고 앱은 Vite 로 번들된다. 크롤러가 보는 HTML 과 사용자가 보는 화면이
 * 갈라지면 검색결과 제목과 실제 페이지가 달라진다.
 */

/** 발행 하한 — 이 아래면 애드센스·구글이 '자동 생성된 얇은 콘텐츠'로 본다 */
export const MIN_BODY = 300      // 도입·마무리 본문 글자수
export const MIN_NOTE = 20       // 작품 한 편당 코멘트 글자수
export const MIN_ITEMS = 3       // 실린 작품 수

/**
 * 발행 가능한가 — 통과 못 하면 이유 목록을 돌려준다.
 *
 * 초안 생성기가 뼈대를 만들어 주기 때문에, 가드가 없으면 자동 문장만 그대로 발행된다.
 * 그건 정확히 애드센스가 반려하는 형태라서 여기서 막는다. 발행 화면·프리렌더 양쪽이 쓴다.
 */
export function publishBlockers(c) {
  const out = []
  const body = (c.body || '').trim()
  const items = c.items || []
  if (!(c.title || '').trim()) out.push('제목이 비어 있습니다.')
  if (!(c.summary || '').trim()) out.push('요약이 비어 있습니다. 목록 카드와 검색결과 설명에 쓰입니다.')
  if (body.length < MIN_BODY) out.push(`본문이 ${body.length}자입니다. 최소 ${MIN_BODY}자 — 왜 이 목록을 묶었는지 직접 쓴 글이 있어야 합니다.`)
  if (items.length < MIN_ITEMS) out.push(`작품이 ${items.length}편입니다. 최소 ${MIN_ITEMS}편.`)
  const thin = items.filter(i => (i.note || '').trim().length < MIN_NOTE)
  if (thin.length) out.push(`코멘트가 ${MIN_NOTE}자 미만인 작품 ${thin.length}편이 있습니다. 자동 생성 문장만 남으면 복제 콘텐츠가 됩니다.`)
  return out
}

export function isPublished(c) {
  return c.status === 'published' && !!c.publishedAt
}

/** 본문을 문단 배열로 — 빈 줄이 문단 구분 */
export function bodyParagraphs(c) {
  return (c.body || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
}

export function buildCurationTitle(c) {
  return c.title
}

/** meta description — 요약을 쓰되 비면 본문 첫 문단으로 대체 */
export function buildCurationDescription(c) {
  const s = (c.summary || '').trim()
  if (s) return s
  return bodyParagraphs(c)[0] || c.title
}

/**
 * schema.org 구조화 데이터.
 *
 * Article 로 낸다. 리뷰 스니펫(Review/aggregateRating)은 붙이지 않는다 —
 * 큐레이션은 운영자 편집 글이지 평점이 아니고, itemReviewed·author 규칙에
 * 또 걸릴 이유가 없다(2026-08-30 GSC 오류 참고).
 */
export function buildCurationJsonLd(c, siteUrl, siteName) {
  const url = `${siteUrl}/curation/${c.id}`
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: c.title,
    description: buildCurationDescription(c),
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(c.coverUrl ? { image: c.coverUrl } : {}),
    ...(c.publishedAt ? { datePublished: c.publishedAt } : {}),
    ...(c.updatedAt ? { dateModified: c.updatedAt } : {}),
    author: { '@type': 'Organization', name: siteName, url: siteUrl },
    publisher: { '@type': 'Organization', name: siteName, url: siteUrl },
  }
}

/**
 * 크롤러가 읽는 본문 줄 — 프리렌더가 그대로 HTML 로 찍는다.
 * 앱 화면(CurationDetailPage)이 그리는 것과 같은 내용이어야 클로킹이 아니다.
 *
 * @param byId  contentId → 작품. 없으면 코멘트만 나간다.
 */
export function curationBodyLines(c, byId) {
  const lines = []
  for (const p of bodyParagraphs(c)) lines.push({ kind: 'p', text: p })
  for (const it of c.items || []) {
    const content = byId && byId.get ? byId.get(it.contentId) : null
    lines.push({
      kind: 'item',
      contentId: it.contentId,
      title: content ? content.title : it.contentId,
      href: `/content/${it.contentId}`,
      note: (it.note || '').trim(),
      posterUrl: content ? content.posterUrl : null,
      exists: !!content,
    })
  }
  return lines
}
