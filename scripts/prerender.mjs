/**
 * 프리렌더 (빌드 후처리)
 * ------------------------------------------------------------
 * dist/index.html 을 템플릿 삼아 페이지별 정적 HTML 을 찍어낸다.
 *   dist/content/{id}/index.html
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
  todayKey,
  buildContentTitle, buildContentDescription, buildContentJsonLd, ogTypeOf, schemaTypeOf,
} from '../src/shared/contentSeo.mjs'
import { contentBodyLines, isIndexableContent } from '../src/shared/contentIndexable.mjs'
import {
  buildCurationDescription, buildCurationJsonLd, curationBodyLines, publishBlockers,
} from '../src/shared/curationSeo.mjs'
import { STATIC_PAGES } from '../src/shared/staticPages.mjs'

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

/**
 * @param noindex  색인 제외
 * @param nofollow 링크도 따라가지 말 것. 기본은 noindex 와 같이 켜지지만,
 *                 얇아서 뺀 작품 페이지는 'noindex, follow' 로 둔다 —
 *                 색인은 안 시키되 크롤러가 그 페이지의 내부 링크는 계속 타야 한다.
 */
function headBlock({ title, description, canonicalPath, ogType = 'website', image, noindex = false, nofollow = noindex, jsonLd = null }) {
  const fullTitle = title ? buildTitle(title) : DEFAULT_TITLE
  const desc = clampText(description) || DEFAULT_DESCRIPTION
  const ogImage = image ? absUrl(image) : DEFAULT_OG_IMAGE
  const canonical = `${SITE_URL}${canonicalPath}`
  return [
    `<title>${esc(fullTitle)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta name="robots" content="${noindex ? (nofollow ? 'noindex, nofollow' : 'noindex, follow') : 'index, follow'}" />`,
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

/** 크롤러가 사이트 구조를 따라갈 수 있게 하는 최소 내부 링크 (푸터 문서 포함) */
const NAV = `<nav><a href="/">개봉·공개 캘린더</a> | <a href="/browse">작품 둘러보기</a> | <a href="/talk">방구석토론방</a> | <a href="/curation">공개작 정리</a>`
  + STATIC_PAGES.map(p => ` | <a href="${p.path}">${p.label}</a>`).join('')
  + `</nav>`

/** 안내 문서 본문 (앱의 StaticPages.tsx 와 같은 원문) */
function docBody(p) {
  return [
    `<article>`,
    `<h1>${esc(p.title)}</h1>`,
    `<p>최종 개정일 ${esc(p.updated)}</p>`,
    ...p.sections.flatMap(s => [
      `<h2>${esc(s.h)}</h2>`,
      ...(s.p || []).map(t => `<p>${esc(t)}</p>`),
      s.ul ? `<ul>${s.ul.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '',
    ]),
    `</article>`,
    NAV,
  ].filter(Boolean).join('\n      ')
}

// 본문 문장은 src/shared/contentIndexable.mjs 가 만든다 — 색인 여부를 재는 글자수와
// 실제로 그리는 본문이 같은 함수에서 나와야 sitemap 과 noindex 가 어긋나지 않는다.
function contentBody(c, today) {
  return [
    `<article>`,
    `<h1>${esc(c.title)}</h1>`,
    c.posterUrl ? `<img src="${esc(c.posterUrl)}" alt="${esc(c.title)} 포스터" width="200" />` : '',
    ...contentBodyLines(c, today).map(line => `<p>${esc(line)}</p>`),
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

  let n = 0

  // ── 안내 문서 (소개·약관·개인정보·광고) ─────────────────────
  // DB 와 무관한 정적 문서라 조회 실패와 상관없이 먼저 찍는다
  for (const p of STATIC_PAGES) {
    const head = headBlock({ title: p.title, description: p.description, canonicalPath: p.path })
    writePage(p.slug, render(template, head, docBody(p)))
    n++
  }

  const today = todayKey()
  let contents = []
  let discussions = []
  let profiles = []
  let curations = []
  try {
    contents = await fetchAll('contents', '*', VISIBLE_CONTENTS)
    discussions = await fetchAll('discussions', 'id,contentId,title,body,rating,spoiler,createdAt,authorId,guestName')
    // Review 스키마의 author 용 (구글은 author 없는 리뷰 스니펫을 오류로 본다)
    profiles = await fetchAll('profiles', 'id,nickname')
  } catch (e) {
    console.warn(`[prerender] DB 조회 실패, 작품·토론글 프리렌더를 건너뜁니다: ${e.message}`)
    console.log(`[prerender] 안내 문서 ${n}개만 생성됨`)
    return
  }

  // 큐레이션은 따로 잡는다 — 마이그레이션 전이라 테이블이 없어도 작품·토론글 프리렌더는 돌아야 한다.
  // (같은 try 에 두면 404 하나로 2,000여 페이지가 통째로 안 만들어진다)
  try {
    // anon 키로 읽으므로 RLS 가 발행된 글만 준다(migration_curations.sql)
    curations = await fetchAll('curations', '*')
  } catch (e) {
    console.warn(`[prerender] 큐레이션 조회 실패, 건너뜁니다: ${e.message}`)
  }

  const pubCurations = curations
    .filter(c => c.status === 'published' && c.publishedAt)
    .filter(c => SAFE_ID.test(c.id))
    .filter(c => !publishBlockers(c).length)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))

  // 작품 → 그 작품이 실린 글 (역링크).
  // 큐레이션 → 작품 단방향만 두면 작품 페이지 1,800여 개에 쌓인 크롤 예산이
  // 원본 글로 흐르지 않는다. 크롤러가 실제로 타려면 정적 HTML 에 들어가 있어야 한다.
  const curationsByContent = new Map()
  for (const cur of pubCurations) {
    for (const it of cur.items || []) {
      if (!curationsByContent.has(it.contentId)) curationsByContent.set(it.contentId, [])
      curationsByContent.get(it.contentId).push(cur)
    }
  }

  const byId = new Map(contents.map(c => [c.id, c]))
  const nickById = new Map(profiles.map(p => [p.id, p.nickname]))

  /** 글쓴이 표시명 — 화면(DiscussionRow)과 같은 규칙 */
  const authorName = d => d.authorId
    ? (nickById.get(d.authorId) || '탈퇴한 사용자')
    : (d.guestName || '익명')
  const skipped = []

  // 작품별 토론글 수 — 사람이 쓴 글이 붙은 작품은 본문이 짧아도 색인한다
  const talkCount = new Map()
  for (const d of discussions) talkCount.set(d.contentId, (talkCount.get(d.contentId) || 0) + 1)

  // ── 작품 상세 ──────────────────────────────────────────────
  let thin = 0
  for (const c of contents) {
    if (!SAFE_ID.test(c.id)) { skipped.push(`content:${c.id}`); continue }
    // 알맹이 없는 페이지는 페이지 자체는 그대로 두고 색인만 막는다 (sitemap 에서도 빠진다)
    const indexable = isIndexableContent(c, { today, discussionCount: talkCount.get(c.id) || 0 })
    if (!indexable) thin++
    const head = headBlock({
      title: buildContentTitle(c, today),
      description: buildContentDescription(c, today),
      canonicalPath: `/content/${c.id}`,
      ogType: ogTypeOf(c),
      image: c.posterUrl,
      noindex: !indexable,
      nofollow: false,
      // 색인 안 할 페이지에 구조화 데이터를 붙일 이유가 없다
      jsonLd: indexable ? buildContentJsonLd(c, SITE_URL) : null,
    })
    const backlinks = curationsByContent.get(c.id) || []
    const body = backlinks.length
      ? contentBody(c, today) + `\n      <section><h2>이 작품이 실린 글</h2><ul>`
        + backlinks.map(x => `<li><a href="/curation/${esc(x.id)}">${esc(x.title)}</a></li>`).join('')
        + `</ul></section>`
      : contentBody(c, today)
    writePage(`content/${c.id}`, render(template, head, body))
    n++
  }

  // ── 토론글 상세 (별점 있으면 Review 스키마로) ─────────────────
  // 리뷰는 토론글로 통합됨 — /review/{id} 프리렌더는 더 이상 만들지 않는다.
  for (const d of discussions) {
    if (!SAFE_ID.test(d.id)) { skipped.push(`talk:${d.id}`); continue }
    const c = byId.get(d.contentId)
    const title = d.title || '(제목 없음)'
    const hasRating = d.rating != null
    // 스포일러 글은 본문을 검색결과에 노출하지 않는다
    const desc = d.spoiler
      ? `${c ? `${c.title} · ` : ''}${hasRating ? `${d.rating}/10점. ` : ''}스포일러가 포함된 글입니다.`
      : `${c ? `${c.title} · ` : ''}${hasRating ? `${d.rating}/10점. ` : ''}${d.body || ''}`
    const head = headBlock({
      title: c ? `${title} - ${c.title}` : title,
      description: desc,
      canonicalPath: `/talk/${d.id}`,
      ogType: 'article',
      image: c?.posterUrl,
      // author 누락·itemReviewed 타입 오류는 구글이 '심각한 문제'로 잡아 스니펫을 통째로 뺀다
      jsonLd: (c && hasRating) ? {
        '@context': 'https://schema.org',
        '@type': 'Review',
        url: `${SITE_URL}/talk/${d.id}`,
        name: title,
        datePublished: d.createdAt,
        author: { '@type': 'Person', name: authorName(d) },
        itemReviewed: {
          '@type': schemaTypeOf(c),
          name: c.title,
          url: `${SITE_URL}/content/${c.id}`,
          ...(c.posterUrl ? { image: c.posterUrl } : {}),
        },
        reviewRating: { '@type': 'Rating', ratingValue: d.rating, bestRating: 10, worstRating: 1 },
      } : null,
    })
    const body = [
      `<article>`,
      `<h1>${esc(title)}</h1>`,
      c ? `<p>작품: <a href="/content/${esc(c.id)}">${esc(c.title)}</a></p>` : '',
      hasRating ? `<p>별점 ${esc(d.rating)}/10</p>` : '',
      d.spoiler ? `<p>스포일러가 포함된 글입니다.</p>` : `<p>${esc(d.body)}</p>`,
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
    // 크롤러가 여기서 타고 들어갈 링크는 색인 대상 작품으로 채운다
    contents.filter(c => SAFE_ID.test(c.id) && isIndexableContent(c, { today, discussionCount: talkCount.get(c.id) || 0 }))
      .slice(0, 500)
      .map(c => `<li><a href="/content/${esc(c.id)}">${esc(c.title)}</a></li>`).join('\n        '),
    `</ul>`, NAV,
  ].join('\n      ')))
  n++

  // ── 큐레이션(기획 글) ──────────────────────────────────────
  // 이 사이트만의 원본 콘텐츠라 색인 우선순위가 가장 높다.
  // 발행 가드를 통과 못 한 글은 애초에 발행이 안 되지만, DB 를 직접 만진 경우를 대비해
  // 여기서도 한 번 더 거른다 — 얇은 글을 색인에 밀어 넣으면 사이트 평가가 깎인다.
  for (const c of pubCurations) {
    const head = headBlock({
      title: c.title,
      description: buildCurationDescription(c),
      canonicalPath: `/curation/${c.id}`,
      ogType: 'article',
      image: c.coverUrl,
      jsonLd: buildCurationJsonLd(c, SITE_URL, SITE_NAME),
    })
    // 앱 화면(CurationDetailPage)과 같은 순서 — 문단들 다음에 작품 카드
    const body = [
      `<article>`,
      `<h1>${esc(c.title)}</h1>`,
      `<p>${esc(String(c.publishedAt).slice(0, 10))}</p>`,
      ...curationBodyLines(c, byId).map(l => l.kind === 'p'
        ? `<p>${esc(l.text)}</p>`
        : [
            `<section>`,
            `<h2><a href="${esc(l.href)}">${esc(l.title)}</a></h2>`,
            `<p>${esc(l.note)}</p>`,
            `</section>`,
          ].join('')),
      `</article>`, NAV,
    ].join('\n      ')
    writePage(`curation/${c.id}`, render(template, head, body))
    n++
  }

  writePage('curation', render(template, headBlock({
    title: '공개작 정리',
    description: `${SITE_NAME}가 직접 고르고 정리한 월간·주간 공개작 모음. 넷플릭스·디즈니+·티빙·웨이브 신작과 극장 개봉작을 공개일 순으로 묶었습니다.`,
    canonicalPath: '/curation',
  }), [
    `<h1>공개작 정리</h1>`,
    `<ul>`,
    pubCurations.map(c => `<li><a href="/curation/${esc(c.id)}">${esc(c.title)}</a> — ${esc(c.summary)}</li>`).join('\n        '),
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
  console.log(`[prerender]   작품 ${contents.length} · 토론글 ${discussions.length} · 큐레이션 ${pubCurations.length} · 목록 3 · 안내 문서 ${STATIC_PAGES.length}`)
  // 조용히 색인에서 빼지 않는다 — 몇 개가 왜 빠졌는지 로그로 남긴다
  console.log(`[prerender]   본문이 얇아 noindex 처리한 작품 ${thin}개 (색인 대상 ${contents.length - thin}개)`)
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
