/**
 * 제작국·원어 채우기 (한국/외국 필터의 근거)
 *
 *   npm run backfill:origin            # 미리보기(DB 미반영) — 몇 편이 어떻게 바뀌는지만 출력
 *   npm run backfill:origin -- --apply # 실제 반영
 *
 * 왜 필요한가: '한국 / 외국' 필터가 원어 제목의 한글 여부로 갈랐다. 표본 194편에서
 * 9편(4.6%)이 틀렸다 — 원어 제목이 영어인 한국 작품은 외국으로, 원어 제목이 비어
 * 한국어 번역 제목을 본 외국 영화(킬 빌·파이트 클럽)는 한국으로 갔다.
 * TMDB 는 처음부터 정답(original_language · origin_country / production_countries)을
 * 주고 있었고 저장만 안 했다. 이 스크립트가 그 두 칸을 채운다.
 *
 * enrich-tmdb.mjs 와 나눠 둔 이유: 저쪽은 "빈 칸이 많은 행"만 고른다(isStub).
 * 제작국은 **모든** tmdb 행에 없으므로 대상이 다르다. 한 번 돌리고 나면 새로 들어오는
 * 행은 sync-tmdb-ott.mjs 가 수집하면서 같이 담으므로 이 스크립트는 다시 쓸 일이 드물다.
 *
 * 먼저 supabase/migration_origin.sql 을 SQL Editor 에서 돌려야 한다.
 * 환경변수: TMDB_API_KEY(또는 TMDB_ACCESS_TOKEN), SUPABASE_SERVICE_KEY, LIMIT, CONCURRENCY
 */
import { fetchWithRetry, pMap } from './tmdb-lib.mjs'

const APPLY = process.argv.includes('--apply')
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN || ''
const API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || ''
const LIMIT = parseInt(process.env.LIMIT || '0', 10)            // 0 = 전부
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '6', 10))

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

if (!ACCESS_TOKEN && !API_KEY) { console.error('TMDB_ACCESS_TOKEN 또는 TMDB_API_KEY 가 필요합니다.'); process.exit(1) }
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('SUPABASE_SERVICE_KEY 가 필요합니다 (.env).'); process.exit(1) }

const HANGUL = /[가-힣]/

async function tmdb(path) {
  const url = new URL('https://api.themoviedb.org/3' + path)
  url.searchParams.set('language', 'ko-KR')
  if (!ACCESS_TOKEN) url.searchParams.set('api_key', API_KEY)
  const res = await fetchWithRetry(() => fetch(url, {
    headers: ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {},
  }))
  if (!res.ok) throw new Error(`TMDB ${res.status} ${path}`)
  return res.json()
}

async function sb(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', ...(init.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status} ${await res.text()}`)
  return res
}

/** 앱(src/utils/origin.ts)과 **같은 규칙**. 둘이 갈리면 미리보기가 거짓말을 한다. */
function originOf({ title, originalTitle, originalLanguage, originCountries }) {
  const countries = originCountries || []
  if (countries.length) return countries.includes('KR') ? 'kr' : 'foreign'
  const lang = (originalLanguage || '').trim()
  if (lang) return lang === 'ko' ? 'kr' : 'foreign'
  return HANGUL.test((originalTitle || '').trim() || title || '') ? 'kr' : 'foreign'
}

// ── 1) 대상: 아직 제작국·원어가 없는 tmdb 행 ────────────────
async function loadTargets() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const res = await sb(`contents?select=id,title,originalTitle,originalLanguage,originCountries,tmdbId&order=id&limit=1000&offset=${from}`)
    const batch = await res.json()
    rows.push(...batch)
    if (batch.length < 1000) break
  }
  const tmdbRows = rows.filter(c => /^tmdb-(mv|dr)-\d+$/.test(c.id))
  const todo = tmdbRows.filter(c => !c.originalLanguage && !(c.originCountries?.length))
  return { total: rows.length, tmdbRows: tmdbRows.length, todo }
}

/** 행 id 에서 TMDB 종류·번호 (tmdbId 컬럼이 비어 있는 옛 행도 여기서 복구된다) */
function tmdbRef(c) {
  const m = c.id.match(/^tmdb-(mv|dr)-(\d+)$/)
  return { kind: m[1] === 'mv' ? 'movie' : 'tv', id: c.tmdbId || Number(m[2]) }
}

// ── 2) 실행 ─────────────────────────────────────────────────
const { total, tmdbRows, todo } = await loadTargets()
const work = LIMIT > 0 ? todo.slice(0, LIMIT) : todo
console.log(`전체 ${total}편 · TMDB 행 ${tmdbRows}편 · 채울 것 ${todo.length}편${LIMIT > 0 ? ` (이번 실행 ${work.length}편)` : ''}${APPLY ? '' : ' — 미리보기'}`)

let done = 0, filled = 0, failed = 0
/** 판별이 뒤집히는 행 — 이 작업의 값어치가 여기 다 있다 */
const flipped = []

await pMap(work, async c => {
  let detail
  const { kind, id } = tmdbRef(c)
  try { detail = await tmdb(`/${kind}/${id}`) }
  catch (e) { failed++; console.log(`  ✖ ${c.id} ${c.title}: ${e.message}`); return }
  done++

  const lang = detail.original_language || null
  const countries = kind === 'tv'
    ? (detail.origin_country || [])
    : (detail.production_countries || []).map(x => x.iso_3166_1).filter(Boolean)

  if (!lang && !countries.length) return   // TMDB 도 모르는 행 — 옛 판별로 남겨 둔다

  const before = originOf(c)
  const after = originOf({ ...c, originalLanguage: lang, originCountries: countries })
  if (before !== after) flipped.push({ ...c, lang, countries, before, after })
  filled++

  if (APPLY) {
    try {
      await sb(`contents?id=eq.${c.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ originalLanguage: lang, originCountries: countries }),
      })
    } catch (e) { failed++; filled--; console.log(`  ✖ 저장 실패 ${c.id}: ${e.message}`) }
  }
  if (done % 200 === 0) console.log(`  … ${done}/${work.length}`)
}, CONCURRENCY)

console.log(`\n조회 ${done} · 채움 ${filled} · 실패 ${failed}`)
console.log(`판별이 바뀌는 작품 ${flipped.length}편`)
for (const f of flipped) {
  const dir = f.before === 'kr' ? '한국 → 외국' : '외국 → 한국'
  console.log(`  ${dir}  ${f.title} | 원제:${f.originalTitle || '(없음)'} | 원어:${f.lang || '?'} | 제작국:${f.countries.join(',') || '(없음)'}`)
}
if (!APPLY) console.log('\n미리보기였습니다. 실제로 넣으려면 --apply 를 붙이세요.')
