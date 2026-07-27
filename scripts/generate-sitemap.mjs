/**
 * sitemap.xml 생성기 (빌드 타임)
 * ------------------------------------------------------------
 * Supabase 에서 공개 URL 목록(작품·리뷰·토론글)을 읽어
 * public/sitemap.xml 을 만든다. npm run build 시 prebuild 로 자동 실행.
 *
 * 실행:
 *   npm run sitemap                 # 단독 실행
 *   npm run build                   # prebuild 로 자동 실행
 *
 * env (전부 선택 — 없으면 앱과 같은 공개키 기본값 사용):
 *   SUPABASE_URL / SUPABASE_KEY
 *   SITE_URL (기본 https://ottcal.com)
 *
 * DB 접근이 실패해도 빌드를 막지 않는다. 정적 경로만 담은 sitemap 을 쓰고 넘어간다.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../public/sitemap.xml')

/**
 * .env 를 직접 읽는다.
 * node --env-file-if-exists 플래그는 Node 20.12+ 에서만 동작하는데,
 * 빌드 플랫폼(Cloudflare/Netlify/CI)마다 Node 버전이 달라서 플래그를 모르면
 * 스크립트가 아니라 프로세스가 통째로 죽는다. 그래서 플래그에 의존하지 않는다.
 * (키는 전부 공개값 기본값이 있어 .env 가 없어도 동작한다)
 */
function loadEnvFile() {
  const envPath = resolve(__dirname, '../.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([\w.-]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m || line.trimStart().startsWith('#')) continue
    const [, key, raw] = m
    const val = /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1) : raw
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadEnvFile()

const SITE_URL = (process.env.SITE_URL || 'https://ottcal.com').replace(/\/$/, '')
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ggswwptjbwvesjkowwsc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || 'sb_publishable_XRQiUZAforlq1XXAZytb0A_6CAkxx6t'

const PAGE = 1000  // Supabase REST 기본 상한

/** 테이블 전체를 range 페이징으로 가져온다 */
async function fetchAll(table, select, extraQuery = '') {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${extraQuery}`
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    })
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`)
    const batch = await res.json()
    rows.push(...batch)
    if (batch.length < PAGE) return rows
  }
}

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
  ]

  let counts = { contents: 0, reviews: 0, discussions: 0 }

  try {
    // hidden=true 는 캘린더에서 숨긴 작품이라 색인 대상이 아니다 (컬럼이 null 인 옛 행은 포함)
    const contents = await fetchAll('contents', 'id,createdAt,syncedAt,hidden', '&or=(hidden.is.null,hidden.is.false)')
    for (const c of contents) {
      entries.push(urlEntry(`/content/${encodeURIComponent(c.id)}`, toLastmod(c.syncedAt, c.createdAt)))
    }
    counts.contents = contents.length

    const reviews = await fetchAll('reviews', 'id,createdAt,updatedAt')
    for (const r of reviews) {
      entries.push(urlEntry(`/review/${encodeURIComponent(r.id)}`, toLastmod(r.updatedAt, r.createdAt)))
    }
    counts.reviews = reviews.length

    const discussions = await fetchAll('discussions', 'id,createdAt')
    for (const d of discussions) {
      entries.push(urlEntry(`/talk/${encodeURIComponent(d.id)}`, toLastmod(d.createdAt)))
    }
    counts.discussions = discussions.length
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
  console.log(`[sitemap]   작품 ${counts.contents} · 리뷰 ${counts.reviews} · 토론글 ${counts.discussions} · 정적 3`)
}

main().catch(e => {
  console.error('[sitemap] 실패:', e)
  process.exit(1)
})
