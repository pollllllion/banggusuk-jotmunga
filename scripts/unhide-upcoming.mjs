/**
 * 잘못 숨겨진 미개봉작 되살리기 (1회성 복구 · 읽기 전용이 기본)
 *
 *   node --env-file-if-exists=.env scripts/unhide-upcoming.mjs           # 대상만 출력
 *   node --env-file-if-exists=.env scripts/unhide-upcoming.mjs --apply   # 실제 hidden=false
 *
 * 왜 필요한가 (2026-08-05):
 *   sync-tmdb-ott.mjs 의 full 모드 정리는 source=tmdb 행 중 이번 실행에서 갱신되지
 *   않은 것을 전부 hidden=true 로 만든다. 그런데 그 스크립트는 OTT 구독작과 한국어
 *   영화만 수집한다 — 외화 극장 개봉작은 애초에 수집 대상이 아니면서 정리 대상에는
 *   들어갔다. 그래서 매 full 실행마다 극장 라인업이 통째로 숨겨졌다.
 *   ingest-tmdb.mjs 가 다시 수집해도 upsert 페이로드에 hidden 이 없어 풀리지 않았다.
 *   둘 다 고쳤고(이 커밋), 이 스크립트는 그동안 묻힌 행을 되살린다.
 *
 * 대상: hidden=true 이고 releaseDate 가 오늘 이후인 행.
 *   아직 개봉도 안 한 작품이 TMDB 에서 사라졌을 리 없으므로 전부 오탐으로 본다.
 *   관리자가 직접 숨긴 것(manualOverride=true)은 건드리지 않는다.
 */
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
const APPLY = process.argv.includes('--apply')

if (!url || !key) {
  console.error('VITE_SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다 (.env).')
  process.exit(1)
}
const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }
const today = new Date().toISOString().slice(0, 10)

// manualOverride 가 null 인 옛 행도 대상에 넣는다(관리자가 손댄 적 없는 행이다)
const FILTER = `hidden=eq.true&releaseDate=gte.${today}`
  + `&or=(manualOverride.is.null,manualOverride.is.false)`

const res = await fetch(`${url}/rest/v1/contents?select=id,title,type,platform,releaseDate,popularity,syncedAt,createdAt&${FILTER}&order=popularity.desc`, { headers: H })
if (!res.ok) { console.error('조회 실패:', res.status, await res.text()); process.exit(1) }
const rows = await res.json()

console.log(`숨김 상태의 미개봉작 ${rows.length}건 (오늘 ${today} 이후 개봉)\n`)
for (const r of rows) {
  console.log(`  pop ${String(Math.round(r.popularity || 0)).padStart(5)}  ${r.releaseDate}  ${r.title}`
    + `  [${r.platform || '-'}]  synced ${(r.syncedAt || '').slice(0, 10)}`)
}
if (!rows.length) process.exit(0)

if (!APPLY) {
  console.log('\n실제로 되살리려면: node --env-file-if-exists=.env scripts/unhide-upcoming.mjs --apply')
  process.exit(0)
}

const patch = await fetch(`${url}/rest/v1/contents?${FILTER}`, {
  method: 'PATCH',
  headers: { ...H, Prefer: 'return=minimal,count=exact' },
  body: JSON.stringify({ hidden: false }),
})
if (!patch.ok) { console.error('복구 실패:', patch.status, await patch.text()); process.exit(1) }
const n = (patch.headers.get('content-range') || '').split('/')[1] || '?'
console.log(`\n✅ ${n}건 되살렸다. 다음 배포 빌드에서 sitemap·프리렌더에 반영된다.`)
