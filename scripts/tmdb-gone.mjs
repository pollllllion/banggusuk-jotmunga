/**
 * TMDB 에서 사라진 작품 찾기 · 숨기기
 *
 *   npm run tmdb:gone              # 조회만 (DB 미반영)
 *   npm run tmdb:gone -- --apply   # 찾은 행을 hidden = true 로
 *
 * 왜 필요한가: TMDB 는 중복·오등록 항목을 수시로 지우거나 병합한다. 그렇게 사라진 id 는
 * 우리 DB 에 그대로 남아 **어떤 스크립트로도 갱신되지 않는다** — enrich 도 sync 도
 * 404 를 받고 건너뛴다. 줄거리·장르가 영영 안 채워지는 유령 행이 된다.
 * 2026-09-16 첫 조회에서 2,421편 중 26편이 여기 해당했다.
 *
 * 지우지 않고 **숨기는** 이유:
 *   · 되돌릴 수 있다. TMDB 가 되살리는 경우가 있고, 그때 unhide 한 줄이면 된다
 *   · 숨기면 사이트맵·프리렌더에서 빠져 검색엔진이 자연스럽게 내려놓는다
 *   · 지워도 ingest 가 다시 만들어 낼 수 있다. 숨김은 그 상태가 남는다
 *
 * 안전장치: 글·본작품·찜·알림이 하나라도 붙은 행은 **건드리지 않고 따로 보고**한다.
 * 사람이 쓴 것이 달린 작품을 조용히 숨기면 그 사람 화면에서 글이 사라진 것처럼 보인다.
 *
 * 환경변수: TMDB_API_KEY(또는 TMDB_ACCESS_TOKEN) · 숨기려면 SUPABASE_SERVICE_KEY
 */
import { pMap } from './tmdb-lib.mjs'

const APPLY = process.argv.includes('--apply')

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY || ''
const SERVICE = process.env.SUPABASE_SERVICE_KEY || ''
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN || ''
const API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || ''

const h = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' })

/** PostgREST 는 한 번에 1000행까지 준다 — 끝까지 긁는다 */
async function fetchAllRows(query) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${query}`, { headers: { ...h(ANON), Range: `${from}-${from + 999}` } })
    if (!r.ok) throw new Error(`${query}: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`)
    const rows = await r.json()
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

const tmdbRef = id => {
  const m = /^tmdb-(mv|dr)-(\d+)/.exec(id)
  return m ? { kind: m[1] === 'mv' ? 'movie' : 'tv', tmdbId: m[2] } : null
}

/** true = TMDB 에서 사라짐(404). 네트워크 오류는 '모름'으로 두고 건드리지 않는다 —
 *  일시적 오류를 '사라짐'으로 읽으면 멀쩡한 작품을 숨기게 된다. */
async function isGone(ref) {
  const u = new URL(`https://api.themoviedb.org/3/${ref.kind}/${ref.tmdbId}`)
  if (!ACCESS_TOKEN) u.searchParams.set('api_key', API_KEY)
  const opts = ACCESS_TOKEN ? { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } } : {}
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(u, opts)
      if (res.status === 429) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue }
      return res.status === 404
    } catch { await new Promise(r => setTimeout(r, 500 * (attempt + 1))) }
  }
  return false
}

async function main() {
  if (!URL_ || !ANON) { console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 필요합니다 (.env).'); process.exit(1) }
  if (!ACCESS_TOKEN && !API_KEY) { console.error('TMDB_ACCESS_TOKEN 또는 TMDB_API_KEY 가 필요합니다.'); process.exit(1) }
  if (APPLY && !SERVICE) { console.error('숨기려면 SUPABASE_SERVICE_KEY 가 필요합니다 (.env).'); process.exit(1) }

  const contents = await fetchAllRows('contents?select=id,title,type,hidden')
  const targets = contents.filter(c => tmdbRef(c.id))
  console.log(`작품 ${contents.length}편 · TMDB 출처 ${targets.length}편 조회 중…`)

  const gone = []
  let done = 0
  await pMap(targets, async c => {
    if (await isGone(tmdbRef(c.id))) gone.push(c)
    if (++done % 500 === 0) console.log(`  …${done}/${targets.length}`)
  }, 6)

  if (!gone.length) { console.log('\n사라진 작품 없음.'); return }

  // 사람이 남긴 것이 붙어 있으면 건드리지 않는다
  const [disc, watched, marks, alerts] = await Promise.all([
    fetchAllRows('discussions?select=contentId'),
    fetchAllRows('watched?select=contentId'),
    fetchAllRows('bookmarks?select=contentId'),
    fetchAllRows('content_alerts?select=contentId'),
  ])
  const used = new Set([...disc, ...watched, ...marks, ...alerts].map(x => x.contentId).filter(Boolean))

  const safe = gone.filter(c => !used.has(c.id) && !c.hidden)
  const attached = gone.filter(c => used.has(c.id))
  const already = gone.filter(c => c.hidden && !used.has(c.id))

  gone.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'))
  console.log(`\n=== TMDB 에서 사라진 작품 ${gone.length}편 ===`)
  for (const c of gone) {
    const tag = used.has(c.id) ? '⚠ 글·기록 있음' : c.hidden ? '· 이미 숨김' : ''
    console.log(`  ${c.id.padEnd(20)} ${(c.title || '').slice(0, 28).padEnd(30)} ${tag}`)
  }

  if (attached.length) {
    console.log(`\n⚠ ${attached.length}편은 글·본작품·찜·알림이 붙어 있어 건드리지 않습니다.`)
    console.log('  TMDB 가 병합한 것이면 관리자에서 살아 있는 행으로 병합하세요(merge_content).')
  }
  if (already.length) console.log(`\n이미 숨겨진 것 ${already.length}편은 그대로 둡니다.`)

  console.log(`\n${APPLY ? '숨길' : '숨길 수 있는'} 작품: ${safe.length}편`)
  if (!safe.length) return
  if (!APPLY) { console.log('실제로 숨기려면: npm run tmdb:gone -- --apply'); return }

  let ok = 0, fail = 0
  for (const c of safe) {
    const r = await fetch(`${URL_}/rest/v1/contents?id=eq.${encodeURIComponent(c.id)}`, {
      method: 'PATCH', headers: { ...h(SERVICE), Prefer: 'return=minimal' },
      body: JSON.stringify({ hidden: true }),
    })
    if (r.ok) { ok++ } else { fail++; console.error(`  ✖ ${c.title}: ${r.status} ${(await r.text()).slice(0, 120)}`) }
  }
  console.log(`숨김 ${ok} · 실패 ${fail}`)
  console.log('되돌리려면 관리자 작품 목록에서 숨김을 풀면 됩니다(제목으로 검색 — id 로는 안 찾아집니다).')
}

main().catch(e => { console.error(e); process.exit(1) })
