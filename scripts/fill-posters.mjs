/**
 * 포스터 빈 칸 채우기 — posterUrl 이 비어 있는 작품만, TMDB 에 그사이 올라온 포스터로.
 *
 *   node --env-file-if-exists=.env scripts/fill-posters.mjs           # 미리보기(DB 미반영)
 *   node --env-file-if-exists=.env scripts/fill-posters.mjs --apply   # 실제 반영
 *
 * 왜 필요한가: 공개 예정작은 수집 시점에 TMDB 포스터가 아직 없는 경우가 많다
 * (예: '내가 떨릴 수 있게' — 9/17 수집 땐 없었고 9/18 에 올라왔다). 수집기는 새 작품을
 * 찾는 도구라 이미 들어온 행의 빈 포스터를 다시 보지 않고, 포스터가 없으면 모바일 캘린더
 * 칸이 빈 회색 박스로 남는다.
 * enrich-tmdb.mjs 도 빈 칸을 채우지만 공개일·OTT 까지 한꺼번에 건드려서 매일 돌리기엔 넓다.
 *
 * 건드리는 칸은 posterUrl 하나뿐이다. 시즌 행(…-s12)은 시즌 포스터 → 없으면 작품 포스터.
 * 대상: 숨기지 않은 작품 중 공개일이 없거나 오늘-30일 이후인 것 (옛 작품은 포스터가 없으면 계속 없다).
 */
import { IMG_POSTER, imgUrl, fetchWithRetry, pMap } from './tmdb-lib.mjs'

const APPLY = process.argv.includes('--apply')
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN || ''
const API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || ''
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ggswwptjbwvesjkowwsc.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

if (!ACCESS_TOKEN && !API_KEY) { console.error('TMDB_ACCESS_TOKEN 또는 TMDB_API_KEY 가 필요합니다.'); process.exit(1) }
if (!SERVICE_KEY) { console.error('SUPABASE_SERVICE_KEY 가 필요합니다.'); process.exit(1) }

async function tmdb(path) {
  const url = new URL('https://api.themoviedb.org/3' + path)
  url.searchParams.set('language', 'ko-KR')
  // 한국어 포스터가 없으면 언어 없는(글자 없는) 포스터·영어 포스터 순으로
  url.searchParams.set('include_image_language', 'ko,null,en')
  if (!ACCESS_TOKEN) url.searchParams.set('api_key', API_KEY)
  const res = await fetchWithRetry(() => fetch(url, {
    headers: ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {},
  }))
  if (res.status === 404) return null
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

const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
const res = await sb(`contents?select=id,title,tmdbId,releaseDate&posterUrl=is.null`
  + `&or=(hidden.is.null,hidden.is.false)&or=(releaseDate.is.null,releaseDate.gte.${since})&order=id`)
const rows = (await res.json()).filter(c => /^tmdb-(mv|dr)-\d+(-s\d+)?$/.test(c.id))

/** 행 id → TMDB 경로 (시즌이면 시즌 번호까지) */
function ref(c) {
  const [, kind, num, season] = c.id.match(/^tmdb-(mv|dr)-(\d+)(?:-s(\d+))?$/)
  return { kind: kind === 'mv' ? 'movie' : 'tv', id: c.tmdbId || Number(num), season: season ? Number(season) : null }
}

let filled = 0, missing = 0, failed = 0
await pMap(rows, async c => {
  try {
    const { kind, id, season } = ref(c)
    let path = null
    if (season != null) path = (await tmdb(`/tv/${id}/season/${season}`))?.poster_path || null
    if (!path) path = (await tmdb(`/${kind}/${id}`))?.poster_path || null
    if (!path) { missing++; return }
    const posterUrl = imgUrl(IMG_POSTER, path)
    console.log(`  ${c.title} (${c.id}) ← ${posterUrl}`)
    // posterUrl=is.null 조건을 다시 건다 — 그사이 관리자가 손으로 넣은 포스터를 덮지 않게
    if (APPLY) await sb(`contents?id=eq.${encodeURIComponent(c.id)}&posterUrl=is.null`, {
      method: 'PATCH', body: JSON.stringify({ posterUrl }),
    })
    filled++
  } catch (e) {
    console.error(`  ✖ ${c.id} ${c.title}: ${e.message}`)
    failed++
  }
}, 4)

console.log(`\n포스터 없는 작품 ${rows.length} · ${APPLY ? '채움' : '채울 수 있음'} ${filled} · TMDB 에도 없음 ${missing} · 실패 ${failed}`)
if (!APPLY && filled) console.log('실제로 반영하려면 --apply')
