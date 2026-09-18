/**
 * 다음 회차 동기화 — 방영 중인 시리즈의 "다음 공개 회차"를 TMDB 에서 받아 적는다
 *
 *   npm run episodes            # 미리보기(DB 미반영)
 *   npm run episodes -- --apply # 실제 반영
 *   npm run episodes -- --all   # 오래된 시리즈까지 전부 (평소엔 최근 1년 + 이미 다음 회차가 적힌 행)
 *
 * 왜 따로 있나: sync-tmdb-ott 는 공개일이 '지난 30일~앞으로 1년' 인 행만 다시 받는다.
 * 16부작 드라마는 8주를 가므로 중간에 그 창을 벗어나고, 그 뒤로는 다음 회차가 갱신되지 않는다.
 * enrich 는 빈 칸만 채우는 도구라 매주 바뀌는 값을 맡길 수 없다. 그래서 이 값만 매일 새로 쓴다.
 *
 * 쓰는 칸은 nextEpisodeDate · nextEpisodeNumber 둘뿐이다 (supabase/migration_next_episode.sql).
 * 회차가 끝났거나 TMDB 에 다음 날짜가 없으면 null 로 되돌린다 — 지난 날짜가 남아 있지 않게.
 * 출처를 TMDB 하나로 둔 이유: 한국 작품 25편을 TVmaze 와 비교했더니(2026-09-18) 같은 작품은
 * 값이 같았고, TVmaze 에는 10편이 아예 없었다.
 *
 * 환경변수: TMDB_API_KEY(또는 TMDB_ACCESS_TOKEN), SUPABASE_SERVICE_KEY, CONCURRENCY
 */
import { fetchWithRetry, pMap, parseContentId, pickNextEpisode } from './tmdb-lib.mjs'

const APPLY = process.argv.includes('--apply')
const ALL = process.argv.includes('--all')
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN || ''
const API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || ''
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '6', 10))
/** 평소에 다시 보는 범위 — 공개한 지 이만큼 안 된 시리즈 (일일드라마 100부작이 다섯 달쯤 간다) */
const RECENT_DAYS = 365

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

if (!ACCESS_TOKEN && !API_KEY) { console.error('TMDB_ACCESS_TOKEN 또는 TMDB_API_KEY 가 필요합니다.'); process.exit(1) }
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('SUPABASE_SERVICE_KEY 가 필요합니다 (.env).'); process.exit(1) }

async function tmdbTv(id) {
  const url = new URL(`https://api.themoviedb.org/3/tv/${id}`)
  url.searchParams.set('language', 'ko-KR')
  if (!ACCESS_TOKEN) url.searchParams.set('api_key', API_KEY)
  const res = await fetchWithRetry(() => fetch(url, {
    headers: ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {},
  }))
  if (res.status === 404) return null   // TMDB 에서 지워진 작품 — 다음 회차도 없다
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return res.json()
}

async function sb(pathAndQuery, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', ...(init.headers || {}),
    },
  })
}

// ── 1) TV 행 전부 읽기 (id 만 봐도 시즌 행 유무를 알 수 있어야 해서 범위를 좁히지 않는다) ──
const rows = []
for (let from = 0; ; from += 1000) {
  const res = await sb(`contents?select=id,title,tmdbId,releaseDate,hidden,nextEpisodeDate,nextEpisodeNumber&id=like.tmdb-dr-*&order=id&limit=1000&offset=${from}`)
  if (!res.ok) {
    const body = await res.text()
    // 42703 = 없는 컬럼. 마이그레이션 전이다 — 워크플로를 실패로 만들 일이 아니라 안내만 한다
    if (/42703|nextEpisode/.test(body)) {
      console.log('nextEpisodeDate 칸이 아직 없습니다 — supabase/migration_next_episode.sql 을 SQL Editor 에서 먼저 실행하세요. (건너뜀)')
      process.exit(0)
    }
    throw new Error(`Supabase ${res.status} ${body}`)
  }
  const batch = await res.json()
  rows.push(...batch)
  if (batch.length < 1000) break
}

const allIds = new Set(rows.map(r => r.id))
// 한국 날짜 기준 — 워크플로가 03:00 KST(=전날 18:00 UTC)에 돌아서 UTC 로 자르면 하루 늦다
const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
const recentFrom = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10)

const targets = rows.filter(r => {
  if (r.hidden || !parseContentId(r.id)) return false
  if (ALL || r.nextEpisodeDate) return true          // 적혀 있는 값은 늘 다시 본다(지우거나 넘기려고)
  return !r.releaseDate || r.releaseDate >= recentFrom
})
console.log(`TV 행 ${rows.length}개 중 확인 대상 ${targets.length}개${APPLY ? '' : ' — 미리보기'}`)

// ── 2) 같은 시리즈의 행들은 TMDB 를 한 번만 부른다 ─────────────
const detailCache = new Map()
const detailOf = id => {
  if (!detailCache.has(id)) detailCache.set(id, tmdbTv(id))
  return detailCache.get(id)
}

let changed = 0, failed = 0, withNext = 0
await pMap(targets, async r => {
  const ref = parseContentId(r.id)
  const tmdbId = r.tmdbId || ref.tmdbId
  let detail
  try { detail = await detailOf(tmdbId) }
  catch (e) { failed++; console.log(`  ✖ ${r.id} ${r.title}: ${e.message}`); return }

  const next = pickNextEpisode(detail, ref.seasonNumber, s => allIds.has(`tmdb-dr-${tmdbId}-s${s}`))
  // 오늘보다 지난 날짜는 '다음'이 아니다 (TMDB 갱신이 늦을 때가 있다)
  const want = next && next.date >= today ? next : null
  if (want) withNext++

  const curDate = r.nextEpisodeDate ? String(r.nextEpisodeDate).slice(0, 10) : null
  const curNum = r.nextEpisodeNumber ?? null
  if (curDate === (want?.date ?? null) && curNum === (want?.number ?? null)) return

  changed++
  console.log(`  ${r.title} (${r.id}): ${curDate ? `${curDate} ${curNum}화` : '없음'} → ${want ? `${want.date} ${want.number}화` : '없음'}`)
  if (!APPLY) return
  const res = await sb(`contents?id=eq.${encodeURIComponent(r.id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ nextEpisodeDate: want?.date ?? null, nextEpisodeNumber: want?.number ?? null }),
  })
  if (!res.ok) { failed++; changed--; console.log(`  ✖ 저장 실패 ${r.id}: ${res.status} ${await res.text()}`) }
}, CONCURRENCY)

console.log(`\n다음 회차 있음 ${withNext} · 바뀐 행 ${changed} · 실패 ${failed}`)
if (!APPLY) console.log('실제로 반영하려면: npm run episodes -- --apply')
