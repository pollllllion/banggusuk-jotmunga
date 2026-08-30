/**
 * 작품 페이지 SEO 문구 생성 — 앱과 빌드 스크립트가 공유하는 단일 소스
 *
 * 왜 .mjs 인가: 프리렌더 스크립트(scripts/prerender.mjs)는 Node 에서 그냥 돌아야 하고,
 * 앱은 Vite 로 번들된다. 양쪽이 같은 파일을 import 해야 크롤러가 보는 HTML 과
 * 사용자가 보는 화면의 메타 태그가 어긋나지 않는다.
 * (여기서 갈리면 검색결과 제목과 실제 페이지가 달라지는 최악의 상황이 된다)
 */

export const TYPE_LABELS = {
  movie: '영화', drama: '드라마', variety: '예능', webtoon: '웹툰', webnovel: '웹소설',
}

/** 로컬 기준 YYYY-MM-DD */
export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** 관리자가 고친 공개일이 있으면 그것을 우선 (캘린더와 동일 규칙) */
export function effectiveReleaseDate(c) {
  return c.manualOverride && c.manualReleaseDate ? c.manualReleaseDate : c.releaseDate
}

export function isUpcoming(c, today = todayKey()) {
  const rel = effectiveReleaseDate(c)
  return rel ? rel > today : c.status === 'upcoming'
}

/** 'YYYY-MM-DD' → '2026. 08. 15' */
function fmtDate(d) {
  return d ? d.replace(/-/g, '. ') : null
}

/** 이 작품을 볼 수 있는 OTT 이름들 (중복 제거, 최대 3개) */
function providerNames(c) {
  const names = (c.providers || []).map(p => p.providerName).filter(Boolean)
  const uniq = [...new Set(names)]
  return uniq.slice(0, 3)
}

/**
 * description 을 만든다.
 *
 * 줄거리가 없는 작품(수기 등록 예능·웹툰 등)이 많아서, 줄거리에만 의존하면
 * "○○ 예능 아직 리뷰가 없습니다." 같은 빈 문장이 검색결과에 그대로 노출된다.
 * 그래서 가진 사실(공개일·OTT·장르·출연·편성)을 순서대로 채워 넣는다.
 */
export function buildContentDescription(c, today = todayKey()) {
  const typeLabel = TYPE_LABELS[c.type] || '작품'
  const upcoming = isUpcoming(c, today)
  const rel = effectiveReleaseDate(c)
  const date = fmtDate(rel)
  const ott = providerNames(c)

  const parts = []

  // 1) 한 줄 요약 — 무엇이고, 어디서, 언제 나오는가 (한 문장에 묶어야 '공개'가 중복되지 않는다)
  const where = ott.length ? ott.join('·') : (c.platform || null)
  const head = [c.title, typeLabel, where].filter(Boolean).join(' · ')
  if (upcoming) {
    parts.push(date ? `${head} ${date} 공개 예정.` : `${head} 공개 예정.`)
  } else if (date) {
    parts.push(`${head} ${date} 공개.`)
  } else if (c.releaseYear) {
    parts.push(`${head} (${c.releaseYear}년).`)
  } else {
    parts.push(`${head}.`)
  }

  // 2) 줄거리가 있으면 그대로, 없으면 장르·출연·편성으로 대체
  if (c.synopsis && c.synopsis.trim()) {
    parts.push(c.synopsis.trim())
  } else {
    const facts = []
    if (c.genres && c.genres.length) facts.push(`${c.genres.slice(0, 3).join('·')} 장르`)
    if (c.creators && c.creators.length) facts.push(`${c.creators.slice(0, 2).join('·')} 연출`)
    const cast = (c.castMembers || []).map(m => m.name).filter(Boolean).slice(0, 3)
    if (cast.length) facts.push(`${cast.join('·')} 출연`)
    if (c.numberOfSeasons) facts.push(`시즌 ${c.numberOfSeasons}`)
    else if (c.numberOfEpisodes) facts.push(`총 ${c.numberOfEpisodes}회`)
    if (facts.length) parts.push(`${facts.join(', ')}.`)
  }

  // 3) 평점은 실제 리뷰가 있을 때만
  if (!upcoming && c.reviewCount > 0) {
    parts.push(`평점 ${Number(c.avgRating).toFixed(1)}/10 · 리뷰 ${c.reviewCount}개.`)
  }

  return parts.join(' ')
}

export function buildContentTitle(c, today = todayKey()) {
  const date = fmtDate(effectiveReleaseDate(c))
  return isUpcoming(c, today)
    ? `${c.title} 공개일${date ? ` ${date}` : ''}`
    : `${c.title} 리뷰·평점`
}

/**
 * schema.org 타입.
 *
 * 여기서 고른 타입은 구글 '리뷰 스니펫'의 itemReviewed / aggregateRating 대상이 된다.
 * 구글이 허용하는 타입 목록에 일반 CreativeWork 는 없어서, 그대로 쓰면
 * "'itemReviewed' 입력란의 개체 유형이 잘못되었습니다" 오류가 뜬다(2026-08-30 GSC).
 * → 웹소설은 Book, 웹툰·미분류는 연재물이니 CreativeWorkSeries 로 떨어뜨린다.
 */
export function schemaTypeOf(c) {
  if (c.type === 'movie') return 'Movie'
  if (c.type === 'drama' || c.type === 'variety') return 'TVSeries'
  if (c.type === 'webnovel') return 'Book'
  return 'CreativeWorkSeries'
}

export function ogTypeOf(c) {
  if (c.type === 'movie') return 'video.movie'
  if (c.type === 'drama' || c.type === 'variety') return 'video.tv_show'
  return 'article'
}

/** schema.org 구조화 데이터 */
export function buildContentJsonLd(c, siteUrl) {
  const schemaType = schemaTypeOf(c)
  const rel = effectiveReleaseDate(c)
  return {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: c.title,
    url: `${siteUrl}/content/${c.id}`,
    ...(c.originalTitle ? { alternateName: c.originalTitle } : {}),
    ...(c.posterUrl ? { image: c.posterUrl } : {}),
    ...(c.synopsis ? { description: c.synopsis } : {}),
    ...(c.genres && c.genres.length ? { genre: c.genres } : {}),
    ...(rel ? { datePublished: rel } : {}),
    ...(c.creators && c.creators.length
      ? { [schemaType === 'Movie' ? 'director' : 'creator']: c.creators.map(name => ({ '@type': 'Person', name })) }
      : {}),
    ...(c.castMembers && c.castMembers.length
      ? { actor: c.castMembers.slice(0, 10).map(m => ({ '@type': 'Person', name: m.name })) }
      : {}),
    // 리뷰 0건인데 aggregateRating 을 넣으면 구글이 스팸으로 본다
    ...(c.reviewCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(c.avgRating).toFixed(1),
            reviewCount: c.reviewCount,
            bestRating: 10,
            worstRating: 1,
          },
        }
      : {}),
  }
}
