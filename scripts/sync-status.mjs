/**
 * 공개 상태(status) 재판정 — 'upcoming' / 'ongoing' / 'completed'
 *
 *   npm run status              # 미리보기(DB 미반영)
 *   npm run status -- --apply   # 실제 반영
 *   npm run status -- --all     # 이미 'completed' 인 행까지 전부 다시 본다 (평소엔 바뀔 수 있는 행만)
 *
 * 왜 필요한가 (2026-09-20):
 *   수집기(ingest-tmdb · sync-tmdb-ott)가 새 행에 status:'upcoming' 을 박아넣고, 그 뒤로 아무도
 *   고치지 않았다. 그래서 공개일이 한참 지난 작품까지 전부 '공개 예정' 으로 남아 있었다 —
 *   전체 2,620편 중 2,472편이 'upcoming', 나머지는 null. 'ongoing'·'completed' 는 0편.
 *   그 결과:
 *     · 둘러보기의 '공개 중'·'완결' 필터가 늘 0건 (BrowsePage STATUS_FILTERS)
 *     · 작품방의 '연재중'·'완결' 라벨이 영영 안 뜸 (ContentDetailPage)
 *     · 캘린더 별점 줄이 통째로 숨겨짐 (status 를 OR 로 묶었던 탓 — utils/ott 의 isUnreleased 주석)
 *
 * 뜻 (세 값의 경계):
 *   upcoming  아직 안 나왔다
 *   ongoing   나왔지만 회차가 남았다 (방영·연재 중)
 *   completed 전편이 나와 있다 — **영화는 개봉하면 여기**다. 한 번에 다 공개되니 '완결'이 맞고,
 *             개봉작을 '공개 중' 에 두면 몇 년 된 영화까지 그 칸에 쌓인다.
 *
 * 판정 순서 (TMDB 를 부르지 않고 끝나는 길을 앞에 둔다):
 *   1. 공개일 없음            → 건드리지 않는다 (판정 근거가 없다. 웹툰·웹소설은 관리자가 직접 고른다)
 *   2. 공개일이 미래          → upcoming
 *   3. 영화                   → completed
 *   4. 다음 회차가 미래       → ongoing            (sync-next-episodes 가 매일 써 둔 값)
 *   5. 그 외 TV               → TMDB /tv/{id} 한 번
 *
 * 건드리지 않는 행: manualOverride('정보 수동 고정' — 관리자가 정한 값 보호), hidden,
 *   TMDB 행이 아닌 것(수기 등록 작품 141편 — 웹툰·웹소설 포함).
 *
 * 환경변수: TMDB_API_KEY(또는 TMDB_ACCESS_TOKEN), SUPABASE_SERVICE_KEY, CONCURRENCY
 */
import { fetchWithRetry, pMap, parseContentId, tvStatus } from './tmdb-lib.mjs'

const APPLY = process.argv.includes('--apply')
const ALL = process.argv.includes('--all')
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN || ''
const API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || ''
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '6', 10))

/**
 * TMDB 가 'Returning Series' 라고 해도 마지막 회차가 이만큼 지났으면 완결로 본다.
 * 시즌제 예능·시리즈는 다음 시즌이 언제 올지 몰라도 TMDB 상태가 'Returning Series' 로 남는다.
 * 그걸 그대로 '공개 중' 에 두면 몇 년 전에 끝난 시즌이 계속 방영 중인 것처럼 보인다.
 * 한국 드라마는 길어야 주 2회 20부(약 10주)라, 넉 달을 넘겨 새 회차가 없으면 끝난 것이다.
 */
const STALE_DAYS = 120

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ggswwptjbwvesjkowwsc.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

if (!ACCESS_TOKEN && !API_KEY) { console.error('TMDB_ACCESS_TOKEN 또는 TMDB_API_KEY 가 필요합니다.'); process.exit(1) }
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('SUPABASE_SERVICE_KEY 가 필요합니다 (.env).'); process.exit(1) }

// 한국 날짜 기준 — 워크플로가 03:00 KST(=전날 18:00 UTC)에 돌아서 UTC 로 자르면 하루 늦다
const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
const staleBefore = new Date(Date.now() + 9 * 3_600_000 - STALE_DAYS * 86_400_000).toISOString().slice(0, 10)

const TMDB_BASE = 'https://api.themoviedb.org/3'

function tvUrl(id) {
  const url = new URL(`${TMDB_BASE}/tv/${id}`)
  url.searchParams.set('language', 'ko-KR')
  if (!ACCESS_TOKEN) url.searchParams.set('api_key', API_KEY)
  return url
}

/** TMDB 시리즈 상세. 지워진 작품(404)은 null — 재시도하지 않는다 */
async function tmdbTv(id) {
  const headers = ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}
  const first = await fetch(tvUrl(id), { headers })
  if (first.status === 404) return null
  if (first.ok) return first.json()
  const res = await fetchWithRetry(() => fetch(tvUrl(id), { headers }), { retries: 2 })
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

const dateOnly = v => (v ? String(v).slice(0, 10) : null)
/** 관리자가 고친 국내 공개일이 있으면 그게 진짜다 (화면의 effectiveReleaseDate 와 같은 규칙) */
const releaseOf = r => dateOnly(r.manualReleaseDate) || dateOnly(r.releaseDate)

// ── 1) 행 읽기 ─────────────────────────────────────────────
const rows = []
for (let from = 0; ; from += 1000) {
  const res = await sb('contents?select=id,title,status,releaseDate,manualReleaseDate,manualOverride,hidden,tmdbId,nextEpisodeDate' +
    `&order=id&limit=1000&offset=${from}`)
  if (!res.ok) throw new Error(`Supabase ${res.status} ${await res.text()}`)
  const batch = await res.json()
  rows.push(...batch)
  if (batch.length < 1000) break
}

/**
 * 평소에 다시 볼 행만 고른다 — 'completed' 는 되돌아가지 않는다(전편 공개된 작품이 다시 미공개가 될 수 없다).
 * 시즌이 더 나오면 그건 별도 행(-s2)으로 들어온다. 그래서 완결 행은 --all 일 때만 본다.
 */
const targets = rows.filter(r => {
  if (r.manualOverride || r.hidden || !parseContentId(r.id)) return false
  if (!releaseOf(r)) return false
  return ALL || r.status !== 'completed'
})

const counts = {}
for (const r of rows) counts[r.status ?? 'null'] = (counts[r.status ?? 'null'] || 0) + 1
console.log(`행 ${rows.length}개 (지금: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')})`)
console.log(`확인 대상 ${targets.length}개${APPLY ? '' : ' — 미리보기'}`)

// ── 2) 판정 ────────────────────────────────────────────────
const detailCache = new Map()   // 같은 시리즈의 시즌 행들이 TMDB 를 한 번만 부르게
const detailOf = id => {
  if (!detailCache.has(id)) detailCache.set(id, tmdbTv(id))
  return detailCache.get(id)
}

let failed = 0
const changes = []

await pMap(targets, async r => {
  const ref = parseContentId(r.id)
  const release = releaseOf(r)
  const next = dateOnly(r.nextEpisodeDate)

  let want
  if (release > today) want = 'upcoming'
  else if (ref.kind === 'movie') want = 'completed'
  else if (next && next >= today) want = 'ongoing'
  else {
    let detail
    try { detail = await detailOf(r.tmdbId || ref.tmdbId) }
    catch (e) { failed++; console.log(`  ✖ ${r.id} ${r.title}: ${e.message}`); return }
    // TMDB 에서 지워진 작품은 물어볼 데가 없다 — 지금 값을 그대로 둔다
    if (!detail) return
    want = tvStatus(detail, ref.seasonNumber, { today, staleBefore })
  }

  if (want === (r.status ?? null)) return
  changes.push({ id: r.id, title: r.title, from: r.status ?? '없음', to: want })
}, CONCURRENCY)

// ── 3) 반영 ────────────────────────────────────────────────
const tally = {}
for (const c of changes) tally[`${c.from} → ${c.to}`] = (tally[`${c.from} → ${c.to}`] || 0) + 1
console.log(`\nTMDB 조회 ${detailCache.size}작품 · 바꿀 행 ${changes.length} · 실패 ${failed}`)
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k}  ${v}건`)
for (const c of changes.slice(0, 15)) console.log(`    · ${c.title} (${c.id}) ${c.from} → ${c.to}`)
if (changes.length > 15) console.log(`    … 외 ${changes.length - 15}건`)

if (!APPLY) {
  console.log('\n실제로 반영하려면: npm run status -- --apply')
  process.exit(0)
}

// 같은 값으로 바뀌는 행끼리 묶어 한 번에 PATCH (id=in.(...)) — 2,400건을 낱개로 쏘면 그만큼 왕복한다
let saved = 0
for (const to of ['upcoming', 'ongoing', 'completed']) {
  const ids = changes.filter(c => c.to === to).map(c => c.id)
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const list = chunk.map(id => `"${id}"`).join(',')
    const res = await sb(`contents?id=in.(${encodeURIComponent(list)})`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: to }),
    })
    if (!res.ok) { failed++; console.log(`  ✖ 저장 실패(${to}): ${res.status} ${await res.text()}`) }
    else saved += chunk.length
  }
}
console.log(`\n저장 ${saved}건 · 실패 ${failed}`)
