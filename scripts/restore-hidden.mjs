/**
 * 잘못 숨겨진 작품 되살리기 — TMDB 에 아직 있는 행만 (읽기 전용이 기본)
 *
 *   node --env-file-if-exists=.env scripts/restore-hidden.mjs           # 대상만 출력
 *   node --env-file-if-exists=.env scripts/restore-hidden.mjs --apply   # 실제 hidden=false
 *   LIMIT=100 node ... scripts/restore-hidden.mjs                       # 확인 건수 제한
 *
 * 왜 필요한가 (2026-08-05):
 *   sync-tmdb-ott 의 full 모드 정리가 "이번 실행에서 갱신 안 됨"을 "사라진 작품"으로
 *   읽고 hidden=true 로 만들었다. 그런데 그 스크립트는 OTT 구독작과 한국어 영화만
 *   수집한다 — 외화 극장 개봉작은 처음부터 수집 대상이 아닌데 정리 대상에는 들어갔다.
 *   그래서 매 full 실행마다 극장 라인업이 통째로 숨겨졌고(오디세이·스파이더맨 등
 *   최근 3개월 개봉작 213건), 리뷰가 달린 작품까지 사이트에서 사라졌다.
 *   정리 로직은 TMDB 실존 확인 방식으로 고쳤고, 이 스크립트는 그동안 묻힌 행을 되살린다.
 *
 * 판정: TMDB 에 존재하면 되살리고(hidden=false), 404 면 그대로 둔다.
 *   판단 불가(네트워크·레이트리밋)도 그대로 둔다 — 확실할 때만 움직인다.
 *   관리자가 직접 숨긴 행(manualOverride=true)은 손대지 않는다.
 */
import { tmdbAlive, pMap } from './tmdb-lib.mjs'

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN || ''
const API_KEY = process.env.TMDB_API_KEY || ''
const APPLY = process.argv.includes('--apply')
const LIMIT = Math.max(1, parseInt(process.env.LIMIT || '2000', 10))
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '4', 10))

if (!url || !key) {
  console.error('VITE_SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다 (.env).')
  process.exit(1)
}
if (!ACCESS_TOKEN && !API_KEY) {
  console.error('TMDB_ACCESS_TOKEN 또는 TMDB_API_KEY 가 필요합니다 (.env).')
  process.exit(1)
}
const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }

// TMDB 스로틀 — sync-tmdb-ott 와 같은 90ms 간격
let lastCall = 0
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function tmdbStatus(path) {
  const gap = 90 - (Date.now() - lastCall)
  if (gap > 0) await sleep(gap)
  lastCall = Date.now()
  const u = new URL('https://api.themoviedb.org/3' + path)
  const headers = { accept: 'application/json' }
  if (ACCESS_TOKEN) headers.Authorization = `Bearer ${ACCESS_TOKEN}`
  else u.searchParams.set('api_key', API_KEY)
  return (await fetch(u, { headers })).status
}

const FILTER = `hidden=eq.true&or=(manualOverride.is.null,manualOverride.is.false)`
const res = await fetch(
  `${url}/rest/v1/contents?select=id,title,type,platform,releaseDate,popularity,tmdbId,mediaType,reviewCount`
  + `&${FILTER}&order=popularity.desc&limit=${LIMIT}`, { headers: H })
if (!res.ok) { console.error('조회 실패:', res.status, await res.text()); process.exit(1) }
const rows = await res.json()
console.log(`숨김 상태 ${rows.length}건을 TMDB 에 조회한다 (동시 ${CONCURRENCY}, 90ms 간격)…\n`)

const verdicts = await pMap(rows, r => tmdbAlive(tmdbStatus, r.mediaType || r.type, r.tmdbId), CONCURRENCY)
const alive = rows.filter((_, i) => verdicts[i] === true)
const gone = rows.filter((_, i) => verdicts[i] === false)
const unknown = rows.filter((_, i) => verdicts[i] === null)

console.log(`살아있음 ${alive.length} · 삭제됨(404) ${gone.length} · 판단불가 ${unknown.length}\n`)
console.log('=== 되살릴 대상 (화제도 상위 30) ===')
for (const r of alive.slice(0, 30))
  console.log(`  pop ${String(Math.round(r.popularity || 0)).padStart(5)}  ${r.releaseDate}  ${r.title}`
    + `  [${r.platform || '-'}]  리뷰 ${r.reviewCount || 0}`)
if (alive.length > 30) console.log(`  ... 외 ${alive.length - 30}건`)
if (gone.length) {
  console.log('\n=== TMDB 에서 삭제됨 — 숨김 유지 (상위 20) ===')
  for (const r of gone.slice(0, 20)) console.log(`  ${r.releaseDate}  ${r.title}  (tmdbId ${r.tmdbId})`)
}
if (unknown.length) {
  console.log('\n=== 판단 불가 — 숨김 유지 (상위 20) ===')
  for (const r of unknown.slice(0, 20)) console.log(`  ${r.releaseDate}  ${r.title}  (tmdbId ${r.tmdbId})`)
}

if (!alive.length) process.exit(0)
if (!APPLY) {
  console.log('\n실제로 되살리려면: node --env-file-if-exists=.env scripts/restore-hidden.mjs --apply')
  process.exit(0)
}

let done = 0
for (let i = 0; i < alive.length; i += 50) {
  const ids = alive.slice(i, i + 50).map(r => `"${r.id}"`).join(',')
  const patch = await fetch(`${url}/rest/v1/contents?id=in.(${ids})`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ hidden: false }),
  })
  if (!patch.ok) { console.error('복구 실패:', patch.status, await patch.text()); process.exit(1) }
  done += Math.min(50, alive.length - i)
}
console.log(`\n✅ ${done}건 되살렸다. 다음 배포 빌드에서 sitemap·프리렌더에 반영된다.`)
