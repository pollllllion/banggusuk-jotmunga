/**
 * 프리렌더 (빌드 후처리)
 * ------------------------------------------------------------
 * dist/index.html 을 템플릿 삼아 페이지별 정적 HTML 을 찍어낸다.
 *   dist/content/{id}/index.html
 *   dist/review/{id}/index.html
 *   dist/talk/{id}/index.html
 *   dist/browse/index.html, dist/talk/index.html
 *
 * 왜 필요한가:
 *   이 앱은 CSR SPA 라 크롤러가 받는 원본 HTML 이 빈 <div id="root"> 하나뿐이다.
 *   구글은 JS 를 실행하지만 2차 색인이라 느리고, **네이버는 JS 렌더링이 훨씬 약해서**
 *   작품 페이지가 통째로 안 잡힌다. 카톡 공유 미리보기도 원본 HTML 만 읽는다.
 *   → 빌드 시점에 head 메타와 본문 요약을 정적으로 박아 넣는다.
 *
 * 무엇을 넣나:
 *   - head: title/description/canonical/og/twitter/JSON-LD (앱의 Seo.tsx 와 동일한 값)
 *   - body: <div id="prerender-seo"> 안에 제목·포스터·공개일·줄거리 요약.
 *           main.tsx 가 앱 실행 직전에 이 블록을 제거하므로 사용자에겐 안 보인다.
 *           JS 를 돌리면 React 가 같은 내용을 그리므로 클로킹이 아니다.
 *
 * 실행: npm run build (postbuild 로 자동) 또는 npm run prerender
 * DB 조회 실패 시 빌드를 막지 않는다 — SPA 폴백으로 동작한다.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchAll, VISIBLE_CONTENTS } from './db.mjs'
import {
  SITE_URL, SITE_NAME, DEFAULT_TITLE, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE,
  absUrl, clampText, buildTitle,
} from '../src/shared/siteSeo.mjs'
import {
  TYPE_LABELS, todayKey, effectiveReleaseDate, isUpcoming,
  buildContentTitle, buildContentDescription, buildContentJsonLd, ogTypeOf,
} from '../src/shared/contentSeo.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '../dist')
const TEMPLATE = join(DIST, 'index.html')

const SEO_START = '<!--seo:start-->'
const SEO_END = '<!--seo:end-->'
const BODY_START = '<!--prerender:start-->'
const BODY_END = '<!--prerender:end-->'

/** 파일 경로로 쓸 수 있는 id 인지 (경로 탈출·인코딩 문제 방지) */
const SAFE_ID = /^[A-Za-z0-9._~-]+$/

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/** </script> 로 JSON-LD 블록이 조기 종료되는 것 방지 */
const escJson = obj => JSON.stringify(obj).replace(/</g, '\\u003c')

function headBlock({ title, description, canonicalPath, ogType = 'website', image, noindex = false, jsonLd = null }) {
  const fullTitle = title ? buildTitle(title) : DEFAULT_TITLE
  const desc = clampText(description) || DEFAULT_DESCRIPTION
  const ogImage = image ? absUrl(image) : DEFAULT_OG_IMAGE
  const canonical = `${SITE_URL}${canonicalPath}`
  return [
    `<title>${esc(fullTitle)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow'}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:locale" content="ko_KR" />`,
    `<meta property="og:type" content="${esc(ogType)}" />`,
    `<meta property="og:title" content="${esc(fullTitle)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:image" content="${esc(ogImage)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(fullTitle)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${esc(ogImage)}" />`,
    jsonLd ? `<script id="seo-jsonld" type="application/ld+json">${escJson(jsonLd)}</script>` : '',
  ].filter(Boolean).join('\n    ')
}

/** 크롤러가 사이트 구조를 따라갈 수 있게 하는 최소 내부 링크 */
const NAV = `<nav><a href="/">개봉·공개 캘린더</a> | <a href="/browse">작품 둘러보기</a> | <a href="/talk">방구석토론방</a></nav>`

function contentBody(c, today) {
  const typeLabel = TYPE_LABELS[c.type] || '작품'
  const rel = effectiveReleaseDate(c)
  const upcoming = isUpcoming(c, today)
  const ott = [...new Set((c.providers || []).map(p => p.providerName).filter(Boolean))]
  const cast = (c.castMembers || []).map(m => m.name).filter(Boolean).slice(0, 8)

  return [
    `<article>`,
    `<h1>${esc(c.title)}</h1>`,
    c.originalTitle && c.originalTitle !== c.title ? `<p>원제: ${esc(c.originalTitle)}</p>` : '',
    c.posterUrl ? `<img src="${esc(c.posterUrl)}" alt="${esc(c.title)} 포스터" width="200" />` : '',
    `<p>${esc(typeLabel)}${rel ? ` · ${esc(rel.replace(/-/g, '. '))} ${upcoming ? '공개 예정' : '공개'}` : ''}</p>`,
    ott.length ? `<p>공개 플랫폼: ${esc(ott.join(', '))}</p>` : (c.platform ? `<p>플랫폼: ${esc(c.platform)}</p>` : ''),
    c.genres?.length ? `<p>장르: ${esc(c.genres.join(', '))}</p>` : '',
    c.creators?.length ? `<p>연출·제작: ${esc(c.creators.join(', '))}</p>` : '',
    cast.length ? `<p>출연: ${esc(cast.join(', '))}</p>` : '',
    c.synopsis ? `<p>${esc(c.synopsis)}</p>` : '',
    c.reviewCount > 0 ? `<p>평점 ${esc(Number(c.avgRating).toFixed(1))}/10 (리뷰 ${esc(c.reviewCount)}개)</p>` : '',
    `</article>`,
    NAV,
  ].filter(Boolean).join('\n      ')
}

function render(template, head, body) {
  const headRe = new RegExp(`${SEO_START}[\\s\\S]*?${SEO_END}`)
  const bodyRe = new RegExp(`${BODY_START}[\\s\\S]*?${BODY_END}`)
  return template
    .replace(headRe, `${SEO_START}\n    ${head}\n    ${SEO_END}`)
    .replace(bodyRe, `${BODY_START}<div id="prerender-seo">\n      ${body}\n    </div>${BODY_END}`)
}

function writePage(routePath, html) {
  const dir = join(DIST, routePath)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html, 'utf8')
}

async function main() {
  if (!existsSync(TEMPLATE)) {
    console.warn('[prerender] dist/index.html 이 없습니다. vite build 후에 실행하세요. 건너뜁니다.')
    return
  }
  const template = readFileSync(TEMPLATE, 'utf8')
  if (!template.includes(SEO_START) || !template.includes(BODY_START)) {
    console.warn('[prerender] index.html 에 seo/prerender 마커가 없습니다. 건너뜁니다.')
    return
  }

  const today = todayKey()
  let contents = []
  let reviews = []
  let discussions = []
  try {
    contents = await fetchAll('contents', '*', VISIBLE_CONTENTS)
    reviews = await fetchAll('reviews', 'id,contentId,title,body,rating,spoiler,createdAt')
    discussions = await fetchAll('discussions', 'id,contentId,title,body,createdAt')
  } catch (e) {
    console.warn(`[prerender] DB 조회 실패, 프리렌더를 건너뜁니다: ${e.message}`)
    return
  }

  const byId = new Map(contents.map(c => [c.id, c]))
  const skipped = []
  let n = 0

  // ── 작품 상세 ──────────────────────────────────────────────
  for (const c of contents) {
    if (!SAFE_ID.test(c.id)) { skipped.push(`content:${c.id}`); continue }
    const head = headBlock({
      title: buildContentTitle(c, today),
      description: buildContentDescription(c, today),
      canonicalPath: `/content/${c.id}`,
      ogType: ogTypeOf(c),
      image: c.posterUrl,
      jsonLd: buildContentJsonLd(c, SITE_URL),
    })
    writePage(`content/${c.id}`, render(template, head, contentBody(c, today)))
    n++
  }

  // ── 리뷰 상세 ──────────────────────────────────────────────
  for (const r of reviews) {
    if (!SAFE_ID.test(r.id)) { skipped.push(`review:${r.id}`); continue }
    const c = byId.get(r.contentId)
    // 스포일러 글은 본문을 검색결과에 노출하지 않는다
    const desc = r.spoiler
      ? `${c ? `${c.title} ` : ''}리뷰 · ${r.rating}/10점. 스포일러가 포함된 리뷰입니다.`
      : `${c ? `${c.title} 리뷰 · ` : ''}${r.rating}/10점. ${r.body || ''}`
    const head = headBlock({
      title: c ? `${r.title} - ${c.title} 리뷰` : r.title,
      description: desc,
      canonicalPath: `/review/${r.id}`,
      ogType: 'article',
      image: c?.posterUrl,
      jsonLd: c ? {
        '@context': 'https://schema.org',
        '@type': 'Review',
        url: `${SITE_URL}/review/${r.id}`,
        name: r.title,
        datePublished: r.createdAt,
        itemReviewed: { '@type': 'CreativeWork', name: c.title },
        reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 10, worstRating: 1 },
      } : null,
    })
    const body = [
      `<article>`,
      `<h1>${esc(r.title)}</h1>`,
      c ? `<p>작품: <a href="/content/${esc(c.id)}">${esc(c.title)}</a></p>` : '',
      `<p>평점 ${esc(r.rating)}/10</p>`,
      r.spoiler ? `<p>스포일러가 포함된 리뷰입니다.</p>` : `<p>${esc(r.body)}</p>`,
      `</article>`, NAV,
    ].filter(Boolean).join('\n      ')
    writePage(`review/${r.id}`, render(template, head, body))
    n++
  }

  // ── 토론글 상세 ────────────────────────────────────────────
  for (const d of discussions) {
    if (!SAFE_ID.test(d.id)) { skipped.push(`talk:${d.id}`); continue }
    const c = byId.get(d.contentId)
    const title = d.title || '(제목 없음)'
    const head = headBlock({
      title: c ? `${title} - ${c.title}` : title,
      description: d.body,
      canonicalPath: `/talk/${d.id}`,
      ogType: 'article',
      image: c?.posterUrl,
    })
    const body = [
      `<article>`,
      `<h1>${esc(title)}</h1>`,
      c ? `<p>작품: <a href="/content/${esc(c.id)}">${esc(c.title)}</a></p>` : '',
      `<p>${esc(d.body)}</p>`,
      `</article>`, NAV,
    ].filter(Boolean).join('\n      ')
    writePage(`talk/${d.id}`, render(template, head, body))
    n++
  }

  // ── 목록 페이지 ────────────────────────────────────────────
  // 앱의 BrowsePage / DiscussionRoomPage 가 쓰는 문구와 맞춘다
  writePage('browse', render(template, headBlock({
    title: '작품 둘러보기',
    description: `작품 둘러보기 — 공개일·평점·리뷰를 한 곳에서. 넷플릭스·디즈니+·티빙·웨이브 등 OTT 작품과 극장 개봉작, 웹툰·웹소설까지 ${contents.length}편을 모아봤습니다.`,
    canonicalPath: '/browse',
  }), [
    `<h1>작품 둘러보기</h1>`,
    `<ul>`,
    contents.slice(0, 500).filter(c => SAFE_ID.test(c.id))
      .map(c => `<li><a href="/content/${esc(c.id)}">${esc(c.title)}</a></li>`).join('\n        '),
    `</ul>`, NAV,
  ].join('\n      ')))
  n++

  writePage('talk', render(template, headBlock({
    title: '방구석토론방',
    description: '영화·드라마·예능·웹툰·웹소설 이야기를 나누는 게시판. 공개 전 기대평부터 방금 본 작품 잡담까지, 눈치 안 보고 떠드는 방구석토론방.',
    canonicalPath: '/talk',
  }), [
    `<h1>방구석토론방</h1>`,
    `<ul>`,
    discussions.filter(d => SAFE_ID.test(d.id))
      .map(d => `<li><a href="/talk/${esc(d.id)}">${esc(d.title || '(제목 없음)')}</a></li>`).join('\n        '),
    `</ul>`, NAV,
  ].join('\n      ')))
  n++

  console.log(`[prerender] ${n}개 정적 페이지 생성`)
  console.log(`[prerender]   작품 ${contents.length} · 리뷰 ${reviews.length} · 토론글 ${discussions.length} · 목록 2`)
  // 조용히 빠뜨리지 않는다 — 무엇이 왜 빠졌는지 로그로 남긴다
  if (skipped.length) {
    console.warn(`[prerender] id 형식 문제로 건너뛴 ${skipped.length}건: ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? ' …' : ''}`)
  }
  // 둘러보기 목록은 500개까지만 링크한다(나머지는 sitemap 이 담당)
  if (contents.length > 500) {
    console.log(`[prerender]   /browse 정적 목록에는 상위 500개만 링크됨 (전체 ${contents.length}개는 sitemap.xml 로 전달)`)
  }
}

main().catch(e => {
  console.error('[prerender] 실패:', e)
  process.exit(1)
})
