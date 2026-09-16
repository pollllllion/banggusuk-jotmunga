/**
 * rss.xml 생성기 (빌드 타임)
 * ------------------------------------------------------------
 * 최신 게시글(토론방 + 자유방) 피드를 public/rss.xml 로 만든다.
 * npm run build 시 prebuild 로 sitemap 과 함께 자동 실행.
 *
 * 왜 사이트맵이 있는데 또 만드나:
 *   **네이버 서치어드바이저가 RSS 제출을 따로 받는다.** 사이트맵은 "이 주소들이 있다"를
 *   말하고, RSS 는 "방금 이 글이 올라왔다"를 말한다. 네이버는 후자를 새 글 수집에 쓴다.
 *   2026-09-16 기준 /rss.xml 은 SPA 폴백(index.html)을 200 으로 돌려주고 있었다 —
 *   피드가 있는 척하고 실제로는 없는 상태라, 제출해도 아무 일도 일어나지 않는다.
 *
 * 무엇을 넣나:
 *   글만 넣는다. 작품 페이지 2,400개는 '새로 생긴 소식'이 아니라 목록이고,
 *   그건 sitemap.xml 이 할 일이다. 피드에 밀어 넣으면 진짜 새 글이 묻힌다.
 *
 * DB 접근이 실패해도 빌드를 막지 않는다 — 항목 없는 피드를 쓰고 넘어간다.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fetchAll } from './db.mjs'
import { SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION, clampText } from '../src/shared/siteSeo.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../public/rss.xml')

/** 피드에 담을 최신 글 수. 리더는 보통 마지막 N개만 보므로 넉넉히 두되,
 *  파일이 커질 이유는 없다(네이버도 최신 것부터 훑는다). */
const LIMIT = 50

/** 파일 경로·주소로 쓸 수 있는 id 만 (경로 탈출 방지 — 프리렌더와 같은 규칙) */
const SAFE_ID = /^[A-Za-z0-9._~-]+$/

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/** RFC 822 — RSS 2.0 이 요구하는 날짜 형식 (ISO 를 그대로 넣으면 리더가 못 읽는다) */
export function rfc822(value) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toUTCString()
}

export function item(d) {
  const path = `/talk/${encodeURIComponent(d.id)}`
  const link = `${SITE_URL}${path}`
  const title = d.title || clampText(d.body, 40) || '(제목 없음)'
  // 스포일러 글은 본문을 내보내지 않는다 — 프리렌더·작품방 요약과 같은 규칙이다.
  // 피드 리더는 본문을 그대로 펼쳐 보여주므로 여기서 새면 가리는 의미가 없다.
  const desc = d.spoiler ? '스포일러가 포함된 글입니다.' : clampText(d.body, 200)
  const date = rfc822(d.createdAt)
  return [
    '    <item>',
    `      <title>${esc(title)}</title>`,
    `      <link>${esc(link)}</link>`,
    `      <guid isPermaLink="true">${esc(link)}</guid>`,
    desc ? `      <description>${esc(desc)}</description>` : '',
    date ? `      <pubDate>${date}</pubDate>` : '',
    '    </item>',
  ].filter(Boolean).join('\n')
}

async function main() {
  let items = []
  try {
    const rows = await fetchAll('discussions', 'id,title,body,spoiler,createdAt')
    items = rows
      .filter(d => SAFE_ID.test(d.id))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, LIMIT)
  } catch (e) {
    console.warn(`[rss] 글 조회 실패, 빈 피드로 넘어갑니다: ${e.message}`)
  }

  // lastBuildDate 는 '피드를 만든 시각'이 아니라 '가장 최근 글'이어야 한다.
  // 빌드마다 현재 시각을 넣으면 글이 안 늘어도 매번 바뀐 것처럼 보이고,
  // 그걸 몇 번 겪은 수집기는 이 값을 무시하기 시작한다.
  const newest = items[0]?.createdAt
  const built = rfc822(newest) || rfc822(Date.now())

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${esc(SITE_NAME)}</title>`,
    `    <link>${SITE_URL}/talk</link>`,
    `    <description>${esc(DEFAULT_DESCRIPTION)}</description>`,
    '    <language>ko</language>',
    `    <lastBuildDate>${built}</lastBuildDate>`,
    `    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />`,
    ...items.map(item),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, xml, 'utf8')
  console.log(`[rss] 글 ${items.length}개 → public/rss.xml`)
}

// 테스트가 이 파일에서 item·rfc822 를 가져다 쓴다 — 그때 피드를 만들지 않도록 막는다
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (runDirectly) main().catch(e => { console.error('[rss]', e); process.exit(1) })
