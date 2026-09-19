/**
 * 줄거리 빈 작품 채우기 — 뽑기(export) / 되넣기(apply)
 *
 *   npm run synopsis:export   # ① 줄거리 빈 행 + TMDB 다른 언어 원문을 synopsis.local.json 으로
 *   "줄거리 번역해줘"          # ② 세션에서 ko 칸을 채운다 (아래 설명)
 *   npm run synopsis:apply -- --dry   # ③ 뭘 쓸지 확인
 *   npm run synopsis:apply -- --apply # ④ 반영
 *
 * 왜 이렇게 나눠 놨나:
 * TMDB 는 이 작품들에 **한국어 줄거리가 아예 없다**(실측 434편 중 한국어 0편, 영어 87%).
 * 그래서 enrich 로는 못 채운다 — 번역이 필요하다. 번역 API 키를 붙이면 돌릴 때마다
 * 종량제 비용이 나는데, 어차피 결과를 사람이 한 번 읽고 넣는 구조라 세션에서 번역하면
 * 추가 비용이 0 이다(시드 만들기와 같은 이유, CLAUDE.md 참고).
 *
 * 숏폼(2026-09-19 추가): DramaBox·Vigloo 작품은 영어가 없고 **중국어만** 있는 일이 많다.
 * 그래서 영어 → 중국어 → 그 밖의 언어 순으로 원문 하나를 고르고(`lang`·`src`), 인물 이름을 옮길 때
 * 쓰라고 TMDB 출연진의 배역명(`characters`)을 같이 적는다. 숏폼이 목록 앞에 온다 — 줄거리가 없으면
 * 검색 색인에서 빠지는데(contentIndexable), 숏폼이 검색 유입을 가장 많이 받는다.
 *
 * ── ② 를 할 때 (Claude 용 절차) ─────────────────────────────
 * 1. `scripts/synopsis.local.json` 을 읽는다. 없으면 먼저 export 를 돌리라고 한다
 * 2. 각 항목의 `src`(언어는 `lang`) 를 한국어로 옮겨 `ko` 에 적는다. **원문에 없는 내용을 지어내지 않는다** —
 *    줄거리는 작품 정보지 창작이 아니다. 모르면 `ko` 를 빈 채로 두고 넘어간다
 * 3. 홍보 문구("놓치지 마세요", "화제의 작품")를 붙이지 않는다. TMDB 원문이 건조하면 건조하게 옮긴다
 * 4. 인명은 `characters`(배역명 로마자)를 한글로 옮겨 쓴다 — 중국어 원문의 한자 이름을 음독하면
 *    틀리기 쉽다(夏恩 → 배역명 Song Ha-eun → 하은). 작품명은 널리 쓰이는 한국어 표기가 있으면 그걸 쓴다
 * 5. 원문이 길면 3~4문장으로 줄인다(사실만 남기고). 원작·방송 정보 같은 곁가지는 한 문장이면 충분하다
 * 6. apply 후 `synopsis.local.json` 은 지운다
 *
 * 환경변수: TMDB_API_KEY(또는 TMDB_ACCESS_TOKEN), SUPABASE_SERVICE_KEY
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pMap } from './tmdb-lib.mjs'

const MODE = process.argv[2] === 'apply' ? 'apply' : 'export'
const APPLY = process.argv.includes('--apply')

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_KEY || ''
const ANON = process.env.VITE_SUPABASE_ANON_KEY || ''
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN || ''
const API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || ''

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORE = resolve(__dirname, 'synopsis.local.json')

const h = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' })

/** 줄거리가 빈 행 전부 (PostgREST 는 한 번에 1000행까지) */
async function emptyRows() {
  const url = `${URL_}/rest/v1/contents?select=id,title,type,synopsis,castMembers&or=(synopsis.is.null,synopsis.eq.)&hidden=eq.false&limit=1000`
  const r = await fetch(url, { headers: h(ANON) })
  if (!r.ok) throw new Error(`목록 조회 실패 ${r.status} ${await r.text()}`)
  return r.json()
}

/** id 에서 TMDB 종류·번호를 뽑는다 — 수동 등록 행(uuid)은 null */
function tmdbRef(id) {
  const m = /^tmdb-(mv|dr)-(\d+)/.exec(id)
  return m ? { kind: m[1] === 'mv' ? 'movie' : 'tv', tmdbId: m[2] } : null
}

// 원문 고르는 순서 — 옮기기 쉬운 쪽부터. 한국어가 있으면 enrich 가 이미 채웠을 것이다
const LANG_ORDER = ['en', 'zh', 'ja', 'th', 'es', 'pt', 'fr', 'de']

/** 404(TMDB 에서 사라진 작품)는 정상적인 결과지 오류가 아니다 —
 *  fetchWithRetry 는 !ok 를 예외로 던지며 3번 더 두드리므로 여기서는 쓰지 않는다.
 *  언어별 줄거리를 한 번에 주는 /translations 를 부른다. */
async function overviewSource(ref) {
  const u = new URL(`https://api.themoviedb.org/3/${ref.kind}/${ref.tmdbId}/translations`)
  if (!ACCESS_TOKEN) u.searchParams.set('api_key', API_KEY)
  const opts = ACCESS_TOKEN ? { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } } : {}
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(u, opts)
    if (res.status === 429) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue }
    if (res.status === 404) return { gone: true, lang: null, src: '' }
    if (!res.ok) return { gone: false, lang: null, src: '' }
    const list = ((await res.json()).translations || [])
      .map(t => ({ lang: t.iso_639_1, src: (t.data?.overview || '').trim() }))
      .filter(t => t.src && t.lang !== 'ko')
    const rank = l => { const i = LANG_ORDER.indexOf(l); return i < 0 ? 99 : i }
    list.sort((a, b) => rank(a.lang) - rank(b.lang))
    return { gone: false, ...(list[0] || { lang: null, src: '' }) }
  }
  return { gone: false, lang: null, src: '' }
}

async function doExport() {
  if (!URL_ || !ANON) { console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 필요합니다 (.env).'); process.exit(1) }
  if (!ACCESS_TOKEN && !API_KEY) { console.error('TMDB_ACCESS_TOKEN 또는 TMDB_API_KEY 가 필요합니다.'); process.exit(1) }

  const rows = await emptyRows()
  console.log(`줄거리 빈 행 ${rows.length}개 — TMDB 다른 언어 원문을 받아옵니다`)

  const out = []
  let gone = 0, noSrc = 0, manual = 0
  await pMap(rows, async row => {
    const ref = tmdbRef(row.id)
    if (!ref) { manual++; return }
    const { gone: is404, lang, src } = await overviewSource(ref)
    if (is404) { gone++; return }
    if (!src) { noSrc++; return }
    const characters = (row.castMembers || []).map(m => m.character).filter(Boolean).slice(0, 6)
    out.push({ id: row.id, title: row.title, type: row.type, lang, src, characters, ko: '' })
  }, 4)

  // 숏폼 먼저 (검색 유입이 가장 많은 종류), 그다음 제목순
  out.sort((a, b) => (Number(b.type === 'shortform') - Number(a.type === 'shortform')) || a.title.localeCompare(b.title, 'ko'))
  writeFileSync(STORE, JSON.stringify(out, null, 2) + '\n')
  console.log(`\n번역 대상 ${out.length}개 → scripts/synopsis.local.json`)
  console.log(`  숏폼 ${out.filter(x => x.type === 'shortform').length}개 · 원문 언어 ${JSON.stringify(out.reduce((m, x) => (m[x.lang] = (m[x.lang] || 0) + 1, m), {}))}`)
  console.log(`  건너뜀: 수동 등록 ${manual} · TMDB 에서 사라짐 ${gone} · 다른 언어 줄거리도 없음 ${noSrc}`)
  console.log(`\n다음: 세션에서 ko 칸을 채운 뒤 npm run synopsis:apply -- --dry`)
}

async function doApply() {
  if (!URL_ || !SERVICE) { console.error('SUPABASE_SERVICE_KEY 가 필요합니다 (.env).'); process.exit(1) }
  if (!existsSync(STORE)) { console.error('scripts/synopsis.local.json 이 없습니다 — 먼저 npm run synopsis:export'); process.exit(1) }

  const items = JSON.parse(readFileSync(STORE, 'utf8'))
  const ready = items.filter(x => (x.ko || '').trim())
  console.log(`${items.length}개 중 번역된 것 ${ready.length}개${APPLY ? '' : ' — 미리보기'}`)
  if (!ready.length) { console.log('ko 가 채워진 항목이 없습니다.'); return }

  // 되넣는 사이에 누가 채웠을 수도 있다 — 지금도 비어 있는 행만 덮는다(남의 값을 밀지 않는다)
  const still = new Set((await emptyRows()).map(r => r.id))

  let done = 0, skipped = 0, failed = 0
  for (const x of ready) {
    if (!still.has(x.id)) { skipped++; continue }
    console.log(`  ${x.title} ← ${x.ko.slice(0, 40)}${x.ko.length > 40 ? '…' : ''}`)
    if (!APPLY) { done++; continue }
    const r = await fetch(`${URL_}/rest/v1/contents?id=eq.${encodeURIComponent(x.id)}`, {
      method: 'PATCH', headers: { ...h(SERVICE), Prefer: 'return=minimal' },
      body: JSON.stringify({ synopsis: x.ko.trim() }),
    })
    if (!r.ok) { console.error(`   ✖ 실패 ${r.status} ${(await r.text()).slice(0, 120)}`); failed++; continue }
    done++
  }
  console.log(`\n${APPLY ? '반영' : '반영 예정'} ${done} · 이미 채워져 있어 건너뜀 ${skipped} · 실패 ${failed}`)
  if (!APPLY) console.log('실제로 반영하려면: npm run synopsis:apply -- --apply')
  else console.log('끝났으면 scripts/synopsis.local.json 을 지우세요.')
}

await (MODE === 'apply' ? doApply() : doExport())
