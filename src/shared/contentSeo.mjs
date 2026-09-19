/**
 * 작품 페이지 SEO 문구 생성 — 앱과 빌드 스크립트가 공유하는 단일 소스
 *
 * 왜 .mjs 인가: 프리렌더 스크립트(scripts/prerender.mjs)는 Node 에서 그냥 돌아야 하고,
 * 앱은 Vite 로 번들된다. 양쪽이 같은 파일을 import 해야 크롤러가 보는 HTML 과
 * 사용자가 보는 화면의 메타 태그가 어긋나지 않는다.
 * (여기서 갈리면 검색결과 제목과 실제 페이지가 달라지는 최악의 상황이 된다)
 */

import { shortPlatformOf } from './shortForm.mjs'

export const TYPE_LABELS = {
  movie: '영화', drama: '드라마', variety: '예능', shortform: '숏폼 드라마', webtoon: '웹툰', webnovel: '웹소설',
}

/**
 * 검색 문구에 쓸 '어디서 보나'.
 * 한국 OTT 가 있으면 그 이름들, 숏폼 앱이면 '드라마박스(DramaBox)' — 사람들은 한글로도
 * 영문으로도 찾는다. 둘 다 아니면 관리자가 적은 플랫폼 칸.
 */
export function wherePlatform(c) {
  const ott = providerNames(c)
  if (ott.length) return ott.join('·')
  const sp = shortPlatformOf(c)
  if (sp) return `${sp.label}(${sp.name})`
  return c.platform || null
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
/**
 * TMDB 평점을 쓸 만한가.
 * 표본이 너무 적으면(<10명) 숫자가 튄다 — 3명이 10점 준 작품을 '평점 10'이라 쓰면 거짓말에 가깝다.
 */
export function hasTmdbRating(c) {
  return typeof c.voteAverage === 'number' && c.voteAverage > 0 && (c.voteCount || 0) >= 10
}

export function buildContentDescription(c, today = todayKey()) {
  const typeLabel = TYPE_LABELS[c.type] || '작품'
  const upcoming = isUpcoming(c, today)
  const rel = effectiveReleaseDate(c)
  const date = fmtDate(rel)
  const parts = []

  // 1) 한 줄 요약 — 무엇이고, 어디서, 언제 나오는가 (한 문장에 묶어야 '공개'가 중복되지 않는다)
  const where = wherePlatform(c)
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

  // 2) 평점 — **줄거리보다 앞에** 둔다 (2026-09-17).
  //    맨 끝에 있을 땐 네이버가 설명을 110자쯤에서 자르면서 'TMDB 평점 7.8…' 로 끊기거나 아예 안 보였다.
  //    '○○ 평점'을 찾아온 사람 눈에 숫자가 먼저 들어와야 누른다 (경쟁 사이트는 설명 첫 줄에 평점이 있다).
  //    네이버 유입 검색어의 5분의 1이 "○○ 평점 / 관람평"이다(2026-09-12 실측 — 클릭 186 중 36).
  //    그런데 우리 별점이 달린 작품은 2,300개 중 11개뿐이라, 그 사람들이 검색결과에서 보는 건
  //    평점 얘기가 한 줄도 없는 설명이었다. 우리 별점이 없으면 TMDB 평점이라도 밝혀 준다
  //    — 남의 수치를 우리 것처럼 쓰지 않도록 출처를 붙여서.
  if (!upcoming) {
    if (c.reviewCount > 0) {
      parts.push(`평점 ${Number(c.avgRating).toFixed(1)}/10 · 리뷰 ${c.reviewCount}개.`)
    } else if (hasTmdbRating(c)) {
      parts.push(`TMDB 평점 ${Number(c.voteAverage).toFixed(1)}/10 (${c.voteCount.toLocaleString('ko-KR')}명).`)
    }
  }

  // 3) 줄거리가 있으면 그대로, 없으면 장르·출연·편성으로 대체
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
  if (c.type === 'drama' || c.type === 'variety' || c.type === 'shortform') return 'TVSeries'
  if (c.type === 'webnovel') return 'Book'
  return 'CreativeWorkSeries'
}

export function ogTypeOf(c) {
  if (c.type === 'movie') return 'video.movie'
  if (c.type === 'drama' || c.type === 'variety' || c.type === 'shortform') return 'video.tv_show'
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
