/**
 * sitemap.xml 생성기 (빌드 타임)
 * ------------------------------------------------------------
 * Supabase 에서 공개 URL 목록(작품·토론글)을 읽어
 * public/sitemap.xml 을 만든다. npm run build 시 prebuild 로 자동 실행.
 *
 * 실행:
 *   npm run sitemap                 # 단독 실행
 *   npm run build                   # prebuild 로 자동 실행
 *
 * DB 접근이 실패해도 빌드를 막지 않는다. 정적 경로만 담은 sitemap 을 쓰고 넘어간다.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchAll, VISIBLE_CONTENTS } from './db.mjs'
import { SITE_URL } from '../src/shared/siteSeo.mjs'
import { STATIC_PAGES } from '../src/shared/staticPages.mjs'
import { todayKey } from '../src/shared/contentSeo.mjs'
import { isIndexableContent } from '../src/shared/contentIndexable.mjs'
import { publishBlockers } from '../src/shared/curationSeo.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../public/sitemap.xml')

/** 'YYYY-MM-DD' 형태로 (sitemap lastmod 는 날짜만으로 충분) */
function toLastmod(...candidates) {
  for (const c of candidates) {
    if (!c) continue
    const d = new Date(c)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return null
}

function urlEntry(path, lastmod) {
  const loc = `${SITE_URL}${path}`
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)

  // 정적 경로 — 로그인/개인 페이지는 robots.txt 에서 막았으므로 넣지 않는다
  const entries = [
    urlEntry('/', today),
    urlEntry('/talk', today),
    urlEntry('/browse', today),
    urlEntry('/curation', today),
    // 안내 문서 (소개·약관·개인정보·광고) — 원문은 src/shared/staticPages.mjs
    ...STATIC_PAGES.map(p => urlEntry(p.path, p.updated)),
  ]

  const counts = { contents: 0, thin: 0, discussions: 0, curations: 0 }

  try {
    // 색인 여부를 판단하려면 본문에 들어가는 필드가 전부 필요하다 (프리렌더와 같은 기준)
    const contents = await fetchAll('contents', '*', VISIBLE_CONTENTS)

    // 리뷰는 토론글로 통합됨 — /review URL 은 sitemap 에 넣지 않는다.
    const discussions = await fetchAll('discussions', 'id,contentId,createdAt')
    const talkCount = new Map()
    for (const d of discussions) talkCount.set(d.contentId, (talkCount.get(d.contentId) || 0) + 1)

    // 본문이 얇은 작품은 넣지 않는다 — 프리렌더가 같은 기준으로 noindex 를 단다.
    // 얇은 URL 을 대량으로 밀어 넣으면 정작 색인시켜야 할 페이지가 뒤로 밀린다.
    const today = todayKey()
    for (const c of contents) {
      if (!isIndexableContent(c, { today, discussionCount: talkCount.get(c.id) || 0 })) { counts.thin++; continue }
      entries.push(urlEntry(`/content/${encodeURIComponent(c.id)}`, toLastmod(c.syncedAt, c.createdAt)))
      counts.contents++
    }

    for (const d of discussions) {
      entries.push(urlEntry(`/talk/${encodeURIComponent(d.id)}`, toLastmod(d.createdAt)))
    }
    counts.discussions = discussions.length

    // 큐레이션 — anon 키라 RLS 가 발행된 글만 준다. 프리렌더와 같은 가드로 한 번 더 거른다.
    // 마이그레이션 전이라 테이블이 없어도 작품·토론글 sitemap 은 나가야 하므로 따로 잡는다.
    try {
      const curations = await fetchAll('curations', '*')
      for (const c of curations) {
        if (c.status !== 'published' || !c.publishedAt) continue
        if (publishBlockers(c).length) continue
        entries.push(urlEntry(`/curation/${encodeURIComponent(c.id)}`, toLastmod(c.updatedAt, c.publishedAt)))
        counts.curations++
      }
    } catch (e) {
      console.warn(`[sitemap] 큐레이션 조회 실패, 건너뜁니다: ${e.message}`)
    }
  } catch (e) {
    // DB 를 못 읽어도 빌드는 계속한다 — 정적 경로만 담긴 sitemap 이 나간다
    console.warn(`[sitemap] DB 조회 실패, 정적 경로만 생성합니다: ${e.message}`)
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + entries.join('\n')
    + `\n</urlset>\n`

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, xml, 'utf8')

  console.log(`[sitemap] ${entries.length}개 URL → public/sitemap.xml`)
  console.log(`[sitemap]   작품 ${counts.contents} · 토론글 ${counts.discussions} · 큐레이션 ${counts.curations} · 정적 ${4 + STATIC_PAGES.length}`)
  if (counts.thin) console.log(`[sitemap]   본문이 얇아 제외한 작품 ${counts.thin}개 (해당 페이지는 noindex)`)
}

main().catch(e => {
  console.error('[sitemap] 실패:', e)
  process.exit(1)
})
