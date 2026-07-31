/**
 * TMDB 상세정보 보강 (빈 칸만 채우기)
 *
 *   npm run enrich            # 미리보기(DB 미반영) — 대상 행과 채울 내용만 출력
 *   npm run enrich -- --apply # 실제 반영
 *
 * 왜 필요한가: 통합검색의 TMDB 폴백(ensure_content RPC)으로 만들어지는 행은
 * 제목·포스터·연도·줄거리만 있다. 공개일·출연진·OTT·채널·회차가 비어 있어
 * 상세 페이지와 캘린더가 허전하다. 이 스크립트가 tmdbId 기준으로 그 빈 칸을 채운다.
 * sync-tmdb-ott.mjs 는 "2026년에 공개되는 작품을 새로 수집"하는 도구라 옛 작품은 안 건드린다 —
 * 그래서 수집이 아니라 보강만 하는 이 스크립트가 따로 있다.
 *
 * 원칙: 이미 값이 있는 칸은 건드리지 않는다(빈 칸만 채움).
 *   · manualOverride=true 인 행은 title·releaseDate 를 그대로 둔다(관리자가 고친 값 보호)
 *   · hidden, avgRating, reviewCount, createdBy 등 운영 값은 절대 안 건드린다
 *
 * 환경변수: TMDB_API_KEY(또는 TMDB_ACCESS_TOKEN), SUPABASE_SERVICE_KEY, LIMIT, CONCURRENCY
 */
import {
  IMG_POSTER, IMG_BACKDROP, extractKrFlatrate, networksToProviders, pickKrMovieDate,
  pickGenres, tvContentType, extractCast, extractDirectors, mapNetworks,
  imgUrl, tmdbUrl, fetchWithRetry, pMap,
} from './tmdb-lib.mjs'

const APPLY = process.argv.includes('--apply')
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN || ''
const API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || ''
const LANG = process.env.TMDB_LANGUAGE || 'ko-KR'
const REGION = process.env.TMDB_REGION || 'KR'
const LIMIT = parseInt(process.env.LIMIT || '0', 10)          // 0 = 전부
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '4', 10))

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

if (!ACCESS_TOKEN && !API_KEY) { console.error('TMDB_ACCESS_TOKEN 또는 TMDB_API_KEY 가 필요합니다.'); process.exit(1) }
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('SUPABASE_SERVICE_KEY 가 필요합니다 (.env).'); process.exit(1) }

const TMDB_BASE = 'https://api.themoviedb.org/3'

async function tmdb(path, params = {}) {
  const url = new URL(TMDB_BASE + path)
  url.searchParams.set('language', LANG)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
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

// ── 1) 보강 대상 찾기 ───────────────────────────────────────
async function loadTargets() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const res = await sb(`contents?select=*&order=id&limit=1000&offset=${from}`)
    const batch = await res.json()
    if (!batch.length) break
    rows.push(...batch)
    if (batch.length < 1000) break
  }
  const isStub = c =>
    !c.releaseDate || !(c.castMembers?.length) || !(c.providers?.length) || !(c.genres?.length)
  return rows.filter(c => /^tmdb-(mv|dr)-\d+$/.test(c.id) && isStub(c))
}

/** 행 id 에서 TMDB 종류·번호 (tmdbId 컬럼이 비어 있는 옛 행도 여기서 복구된다) */
function tmdbRef(c) {
  const m = c.id.match(/^tmdb-(mv|dr)-(\d+)$/)
  return { kind: m[1] === 'mv' ? 'movie' : 'tv', id: c.tmdbId || Number(m[2]) }
}

// ── 2) 상세 조회 → 채울 값만 계산 ───────────────────────────
async function buildPatch(c) {
  const { kind, id } = tmdbRef(c)
  const detail = kind === 'movie'
    ? await tmdb(`/movie/${id}`, { append_to_response: 'watch/providers,release_dates,credits' })
    : await tmdb(`/tv/${id}`, { append_to_response: 'watch/providers,credits' })

  let providers = extractKrFlatrate(detail['watch/providers'])
  if (!providers.length && kind === 'tv') providers = networksToProviders(detail.networks)

  const genreIds = detail.genres?.map(g => g.id) || []
  // pickKrMovieDate 는 문자열이 아니라 { date, source } 를 준다 (한국 개봉일 우선순위 판정 결과)
  const rel = kind === 'movie'
    ? pickKrMovieDate(detail.release_dates?.results, detail.release_date)
    : { date: detail.first_air_date || null, source: 'tmdb_first_air_date' }
  const releaseDate = rel.date

  // 빈 칸만 채운다. manualOverride 면 관리자가 고친 title·releaseDate 는 보존.
  const locked = c.manualOverride === true
  const fill = {}
  const put = (key, value, { overwriteEmpty = true } = {}) => {
    if (value === null || value === undefined || value === '') return
    if (Array.isArray(value) && !value.length) return
    const cur = c[key]
    const empty = cur === null || cur === undefined || cur === '' || (Array.isArray(cur) && !cur.length)
    if (empty || (!overwriteEmpty && cur !== value)) fill[key] = value
  }

  if (!locked) put('releaseDate', releaseDate ? String(releaseDate).slice(0, 10) : null)
  put('releaseYear', (fill.releaseDate || c.releaseDate)?.slice(0, 4) ? Number((fill.releaseDate || c.releaseDate).slice(0, 4)) : null)
  put('releaseDateSource', rel.source)
  put('synopsis', detail.overview || '')
  put('posterUrl', imgUrl(IMG_POSTER, detail.poster_path))
  put('backdropUrl', imgUrl(IMG_BACKDROP, detail.backdrop_path))
  put('originalTitle', detail.original_title || detail.original_name || null)
  put('genres', pickGenres(detail.genres, genreIds))
  put('creators', kind === 'movie' ? extractDirectors(detail.credits?.crew) : (detail.created_by || []).map(x => x.name))
  put('castMembers', extractCast(detail.credits))
  put('providers', providers)
  put('platform', providers[0]?.providerName || null)
  put('tmdbId', id)
  put('mediaType', kind)
  put('tmdbUrl', tmdbUrl(kind, id))
  put('source', 'tmdb')
  put('region', REGION)
  put('voteAverage', detail.vote_average ?? null)
  put('voteCount', detail.vote_count ?? null)
  // popularity 는 정수 컬럼 — 소수 그대로 넣으면 22P02 로 거절된다
  if (!c.popularity) put('popularity', Math.round(detail.popularity ?? 0))

  if (kind === 'tv') {
    put('networks', mapNetworks(detail.networks))
    put('runtime', detail.episode_run_time?.[0] || null)
    put('numberOfSeasons', detail.number_of_seasons ?? null)
    put('numberOfEpisodes', detail.number_of_episodes ?? null)
    put('eventType', 'series_release')
    // 검색 폴백으로 만들어진 행은 장르 id 만 보고 타입을 정했으니 상세 기준으로 바로잡는다
    if (!c.castMembers?.length) {
      const t = tvContentType(genreIds)
      if (t !== c.type) fill.type = t
    }
  } else {
    put('runtime', detail.runtime ?? null)
    put('eventType', 'movie_release')
  }

  if (Object.keys(fill).length) fill.syncedAt = new Date().toISOString()
  return fill
}

// ── 3) 실행 ─────────────────────────────────────────────────
const targets = await loadTargets()
const work = LIMIT > 0 ? targets.slice(0, LIMIT) : targets
console.log(`보강 대상 ${targets.length}개${LIMIT > 0 ? ` (이번 실행 ${work.length}개)` : ''}${APPLY ? '' : ' — 미리보기'}`)

let done = 0, changed = 0, failed = 0
await pMap(work, async c => {
  let fill
  try { fill = await buildPatch(c) }
  catch (e) { failed++; console.log(`  ✖ ${c.id} ${c.title}: ${e.message}`); return }
  done++
  const keys = Object.keys(fill).filter(k => k !== 'syncedAt')
  if (!keys.length) return
  changed++
  console.log(`  ${c.title} (${c.id}) ← ${keys.join(', ')}`)
  if (APPLY) {
    try { await sb(`contents?id=eq.${c.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(fill) }) }
    catch (e) { failed++; changed--; console.log(`  ✖ 저장 실패 ${c.id}: ${e.message}`) }
  }
  if (done % 50 === 0) console.log(`  … ${done}/${work.length}`)
}, CONCURRENCY)

console.log(`\n조회 ${done} · 채울 것 있음 ${changed} · 실패 ${failed}`)
if (!APPLY) console.log('실제로 반영하려면: npm run enrich -- --apply')
