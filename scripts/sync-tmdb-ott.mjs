/**
 * TMDB OTT 캘린더 동기화 (서버 전용 · GitHub Actions/로컬에서 실행)
 * ============================================================
 * 대한민국 주요 OTT(구독형)의 2026년 영화·TV 개봉/공개작을 TMDB에서 수집해
 * Supabase contents 테이블에 upsert 합니다. 토큰은 서버에서만 사용합니다.
 *
 * 실행:
 *   node --env-file-if-exists=.env scripts/sync-tmdb-ott.mjs          # 반영
 *   node --env-file-if-exists=.env scripts/sync-tmdb-ott.mjs --dry     # DB 미반영(미리보기)
 *   MODE=incremental node ... scripts/sync-tmdb-ott.mjs                # 증분(과거30일~미래365일)
 *
 * 환경변수:
 *   TMDB_ACCESS_TOKEN   (권장) v4 read access token → Authorization: Bearer
 *   TMDB_API_KEY        (대체) v3 api_key. 둘 중 하나는 필수.
 *   TMDB_LANGUAGE       기본 ko-KR
 *   TMDB_REGION         기본 KR
 *   SUPABASE_URL        기본값 하드코딩 fallback 있음
 *   SUPABASE_SERVICE_KEY (필수) service_role — RLS 우회 upsert
 *   START_DATE END_DATE  기본 2026-01-01 ~ 2026-12-31
 *   MODE                 full(기본) | incremental
 *   CONCURRENCY          상세 동시 조회 수(기본 4)
 *   MAX_PAGES            provider·쿼리당 최대 페이지(기본 15, 안전장치)
 */
import {
  TARGET_PROVIDER_NAMES, IMG_POSTER, IMG_BACKDROP,
  matchTargetProviders, extractKrFlatrate, networksToProviders, pickKrMovieDate, withinRange,
  buildContentId, mergeProviders, tmdbUrl, imgUrl, fetchWithRetry, pMap, normName,
  pickGenres, tvContentType, extractCast, extractDirectors, mapNetworks,
} from './tmdb-lib.mjs'

// watch-provider 카탈로그(정규명 → {providerId, logoPath}) — networks 폴백 로고 통일용. main에서 채움.
const PROVIDER_DIR = new Map()

// ── 설정 ───────────────────────────────────────────────────
const DRY = process.argv.includes('--dry')
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN || ''
const API_KEY = process.env.TMDB_API_KEY || ''
const LANG = process.env.TMDB_LANGUAGE || 'ko-KR'
const REGION = process.env.TMDB_REGION || 'KR'
const MODE = (process.env.MODE || 'full').toLowerCase()
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '4', 10))
const MAX_PAGES = Math.max(1, parseInt(process.env.MAX_PAGES || '15', 10))
// 노이즈 컷: 해외(비한국어) 작품은 인기도 임계값 이상만. 한국어 작품은 기본 전량 포함.
const FOREIGN_MIN_POP = parseFloat(process.env.FOREIGN_MIN_POP || '10')
const KOREAN_MIN_POP = parseFloat(process.env.KOREAN_MIN_POP || '0')
const LANG_KO = 'ko'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ggswwptjbwvesjkowwsc.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''

const TMDB_BASE = 'https://api.themoviedb.org/3'
const BATCH = 50

// 날짜 범위: full = 2026 전체, incremental = 과거30일~미래365일 (2026 범위로 클램프)
const FULL_START = process.env.START_DATE || '2026-01-01'
const FULL_END = process.env.END_DATE || '2026-12-31'
const today = new Date().toISOString().slice(0, 10)
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function clamp(d, lo, hi) { return d < lo ? lo : d > hi ? hi : d }
const START = MODE === 'incremental' ? clamp(addDays(today, -30), FULL_START, FULL_END) : FULL_START
const END = MODE === 'incremental' ? clamp(addDays(today, 365), FULL_START, FULL_END) : FULL_END
const RUN_START = new Date().toISOString()   // 이번 실행 이전에 동기화된(=이번에 갱신 안 된) 행 판별용

if (!ACCESS_TOKEN && !API_KEY) {
  console.error('❌ TMDB_ACCESS_TOKEN 또는 TMDB_API_KEY 가 필요합니다.'); process.exit(1)
}
if (!SERVICE_KEY && !DRY) {
  console.error('❌ SUPABASE_SERVICE_KEY(service_role) 가 필요합니다. (--dry 는 예외)'); process.exit(1)
}

// ── TMDB 호출 (Bearer 우선, 짧은 지연으로 과호출 방지) ───────
let lastCall = 0
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function throttle() {
  const gap = 90 - (Date.now() - lastCall)
  if (gap > 0) await sleep(gap)
  lastCall = Date.now()
}
async function tmdb(path, params = {}) {
  await throttle()
  const url = new URL(TMDB_BASE + path)
  url.searchParams.set('language', LANG)
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v))
  const headers = { accept: 'application/json' }
  if (ACCESS_TOKEN) headers.Authorization = `Bearer ${ACCESS_TOKEN}`
  else url.searchParams.set('api_key', API_KEY)
  const res = await fetchWithRetry(() => fetch(url, { headers }), { retries: 3, baseDelay: 700, sleep })
  return res.json()
}

// ── 통계/에러 수집 ──────────────────────────────────────────
const stats = { providersProcessed: 0, moviesFetched: 0, tvShowsFetched: 0, seasonsFetched: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 }
const errors = []
const logErr = (message, extra = {}) => { errors.push({ message, ...extra }); stats.failed++; console.warn('  ⚠️', message) }

// ── 1) 대한민국 OTT provider 자동 조회 ──────────────────────
async function loadProviders(mediaType) {
  try {
    const json = await tmdb(`/watch/providers/${mediaType}`, { watch_region: REGION })
    return matchTargetProviders(json.results || []).map(p => ({ ...p, mediaType, enabled: true }))
  } catch (e) {
    logErr(`provider 조회 실패(${mediaType}): ${e.message}`, { mediaType }); return []
  }
}

// ── 페이지네이션 헬퍼 ───────────────────────────────────────
async function discoverAll(path, baseParams, label) {
  const out = []
  let page = 1, totalPages = 1
  do {
    let json
    try {
      json = await tmdb(path, { ...baseParams, page })
    } catch (e) { logErr(`${label} discover 실패(page ${page}): ${e.message}`, { page }); break }
    totalPages = Math.min(json.total_pages || 1, MAX_PAGES)
    for (const r of json.results || []) out.push(r)
    page++
  } while (page <= totalPages)
  return out
}

// tmdbId → { base, providerIds:Set, korean:bool } 후보 병합
function addCand(cand, m, { providerId = null, korean = false } = {}) {
  let c = cand.get(m.id)
  if (!c) { c = { base: m, providerIds: new Set(), korean: false }; cand.set(m.id, c) }
  if (providerId != null) c.providerIds.add(providerId)
  if (korean) c.korean = true
}

// ── 2) 영화 수집 ────────────────────────────────────────────
// 1차: 한국어 영화(provider 무관, KR 중심 코어) + 2차: 해외 OTT 영화(provider별)
async function collectMovies(providers) {
  const cand = new Map()

  // 1차) 한국어 영화 — 국내 개봉/공개작. provider 태그 없어도 수집한다.
  const koCommon = {
    with_original_language: LANG_KO, region: REGION, watch_region: REGION,
    include_adult: false, include_video: false, sort_by: 'primary_release_date.asc',
  }
  const koA = await discoverAll('/discover/movie', { ...koCommon, 'primary_release_date.gte': START, 'primary_release_date.lte': END }, '영화·한국어·primary')
  const koB = await discoverAll('/discover/movie', { ...koCommon, 'release_date.gte': START, 'release_date.lte': END, with_release_type: '4|3|2|1' }, '영화·한국어·digital')
  for (const m of [...koA, ...koB]) addCand(cand, m, { korean: true })

  // 2차) 해외 OTT 영화 — provider별 (한국 OTT 카탈로그의 해외작)
  for (const prov of providers) {
    const common = {
      watch_region: REGION, region: REGION,
      with_watch_providers: prov.providerId,
      with_watch_monetization_types: 'flatrate',
      include_adult: false, include_video: false,
      sort_by: 'primary_release_date.asc',
    }
    const q1 = await discoverAll('/discover/movie', { ...common, 'primary_release_date.gte': START, 'primary_release_date.lte': END }, `영화·${prov.providerName}·primary`)
    const q2 = await discoverAll('/discover/movie', { ...common, 'release_date.gte': START, 'release_date.lte': END, with_release_type: '4|3|2|1' }, `영화·${prov.providerName}·digital`)
    for (const m of [...q1, ...q2]) addCand(cand, m, { providerId: prov.providerId })
  }
  return cand
}

// 영화 상세 보강 → 행
async function enrichMovie({ base, korean }) {
  let detail
  try {
    detail = await tmdb(`/movie/${base.id}`, { append_to_response: 'watch/providers,release_dates,credits' })
  } catch (e) { logErr(`영화 상세 실패(${base.id}): ${e.message}`, { mediaType: 'movie' }); return null }

  const krProviders = extractKrFlatrate(detail['watch/providers'])
  const pop = detail.popularity ?? base.popularity ?? 0
  // 해외작: 한국 OTT(flatrate) 확인 필수 + 인기도 임계값(무명 외국물 노이즈 컷)
  // 한국어작: provider 없어도 포함(국내 극장/미태깅 OTT 개봉작)
  if (!korean) {
    if (!krProviders.length) { stats.skipped++; return null }
    if (pop < FOREIGN_MIN_POP) { stats.skipped++; return null }
  } else if (pop < KOREAN_MIN_POP) { stats.skipped++; return null }

  const { date, source } = pickKrMovieDate(detail.release_dates?.results, detail.release_date || base.release_date)
  if (!withinRange(date, START, END)) { stats.skipped++; return null }

  const title = detail.title || base.title
  const poster = detail.poster_path || base.poster_path
  if (!title || !poster) { stats.skipped++; return null } // 제목·포스터 둘 다 없으면 제외

  return normalizeRow({
    mediaType: 'movie', eventType: 'movie_release', tmdbId: base.id,
    title, originalTitle: detail.original_title || null,
    overview: detail.overview || base.overview || '',
    releaseDate: date, releaseDateSource: source,
    posterPath: poster, backdropPath: detail.backdrop_path || base.backdrop_path,
    voteAverage: detail.vote_average ?? base.vote_average ?? null,
    voteCount: detail.vote_count ?? base.vote_count ?? null,
    popularity: detail.popularity ?? base.popularity ?? 0,
    providers: krProviders, contentType: 'movie',
    // 상세정보
    genres: pickGenres(detail.genres, base.genre_ids),
    creators: extractDirectors(detail.credits?.crew),
    castMembers: extractCast(detail.credits),
    runtime: detail.runtime || null,
  })
}

// ── 3) TV 수집 ──────────────────────────────────────────────
// 1차: 한국어 TV(신규 시리즈 first_air + 반환 시즌 air_date) + 2차: 해외 OTT TV
async function collectTv(providers) {
  const cand = new Map()

  // 1차) 한국어 TV
  const koFirst = await discoverAll('/discover/tv', {
    with_original_language: LANG_KO, include_adult: false, include_null_first_air_dates: false,
    'first_air_date.gte': START, 'first_air_date.lte': END, sort_by: 'first_air_date.asc', timezone: 'Asia/Seoul',
  }, 'TV·한국어·first')
  const koAir = await discoverAll('/discover/tv', {
    with_original_language: LANG_KO, include_adult: false,
    'air_date.gte': START, 'air_date.lte': END, sort_by: 'first_air_date.desc', timezone: 'Asia/Seoul',
  }, 'TV·한국어·air')
  for (const m of [...koFirst, ...koAir]) addCand(cand, m, { korean: true })

  // 2차) 해외 OTT TV — provider별 (신규 + 반환시즌)
  for (const prov of providers) {
    const common = {
      watch_region: REGION, with_watch_providers: prov.providerId,
      with_watch_monetization_types: 'flatrate',
      include_adult: false, timezone: 'Asia/Seoul',
    }
    const first = await discoverAll('/discover/tv', { ...common, include_null_first_air_dates: false, 'first_air_date.gte': START, 'first_air_date.lte': END, sort_by: 'first_air_date.asc' }, `TV·${prov.providerName}·first`)
    const air = await discoverAll('/discover/tv', { ...common, 'air_date.gte': START, 'air_date.lte': END, sort_by: 'first_air_date.desc' }, `TV·${prov.providerName}·air`)
    for (const m of [...first, ...air]) addCand(cand, m, { providerId: prov.providerId })
  }
  return cand
}

// TV 상세 보강 → [시리즈 행, (범위 내) 시즌 행들]
async function enrichTv({ base, korean }) {
  let detail
  try {
    detail = await tmdb(`/tv/${base.id}`, { append_to_response: 'watch/providers,credits' })
  } catch (e) { logErr(`TV 상세 실패(${base.id}): ${e.message}`, { mediaType: 'tv' }); return [] }

  // KR watch-provider 우선. 비어 있으면 networks(방영사)에서 대상 OTT를 폴백으로 채운다.
  // (넷플릭스/디즈니+ 오리지널 예정작은 KR watch-provider 등재가 늦어 여기서 잡힌다. 예: '동궁')
  let krProviders = extractKrFlatrate(detail['watch/providers'])
  if (!krProviders.length) krProviders = networksToProviders(detail.networks, PROVIDER_DIR)
  const pop = detail.popularity ?? base.popularity ?? 0
  // 해외작: 한국 OTT 확인 필수 + 인기도 임계값. 한국어작: provider 없어도 포함.
  if (!korean) {
    if (!krProviders.length) { stats.skipped++; return [] }
    if (pop < FOREIGN_MIN_POP) { stats.skipped++; return [] }
  } else if (pop < KOREAN_MIN_POP) { stats.skipped++; return [] }

  const rows = []
  const title = detail.name || base.name
  const poster = detail.poster_path || base.poster_path
  const genreIds = detail.genres?.map(g => g.id) || base.genre_ids || []

  // TV 공통 상세: 예능/드라마 구분, 연출(created_by), 장르, 출연, 채널, 편성
  const tvType = tvContentType(genreIds)              // 'variety' | 'drama'
  const shared = {
    contentType: tvType,
    genres: pickGenres(detail.genres, base.genre_ids),
    creators: (detail.created_by || []).map(c => c.name),
    castMembers: extractCast(detail.credits),
    networks: mapNetworks(detail.networks),
    runtime: detail.episode_run_time?.[0] || null,
    numberOfSeasons: detail.number_of_seasons ?? null,
    numberOfEpisodes: detail.number_of_episodes ?? null,
  }

  // 신규 시리즈: first_air_date 가 범위 내
  const first = detail.first_air_date || base.first_air_date
  if (withinRange(first, START, END) && title && poster) {
    rows.push(normalizeRow({
      mediaType: 'tv', eventType: 'series_release', tmdbId: base.id,
      title, originalTitle: detail.original_name || null,
      overview: detail.overview || base.overview || '',
      releaseDate: String(first).slice(0, 10), releaseDateSource: 'tmdb_first_air_date',
      posterPath: poster, backdropPath: detail.backdrop_path || base.backdrop_path,
      voteAverage: detail.vote_average ?? null, voteCount: detail.vote_count ?? null,
      popularity: detail.popularity ?? base.popularity ?? 0, providers: krProviders,
      ...shared,
    }))
  }

  // 기존 시리즈의 "신규 시즌"(시즌2+): air_date 가 범위 내인 시즌만.
  // 시즌1은 시리즈 첫 공개(series_release)와 같은 날·같은 작품이라 중복 → 제외.
  for (const s of detail.seasons || []) {
    const sd = s.air_date
    if (s.season_number < 2) continue // 0=스페셜, 1=시리즈 첫 공개(중복)
    if (!withinRange(sd, START, END)) continue
    if (!title || !poster) continue
    rows.push(normalizeRow({
      mediaType: 'tv', eventType: 'season_release', tmdbId: base.id, seasonNumber: s.season_number,
      title: `${title} 시즌${s.season_number}`, originalTitle: detail.original_name || null,
      overview: s.overview || detail.overview || '',
      releaseDate: String(sd).slice(0, 10), releaseDateSource: 'tmdb_season_air_date',
      posterPath: s.poster_path || poster, backdropPath: detail.backdrop_path || null,
      voteAverage: detail.vote_average ?? null, voteCount: detail.vote_count ?? null,
      popularity: detail.popularity ?? 0, providers: krProviders,
      ...shared,
    }))
    stats.seasonsFetched++
  }
  return rows
}

// ── 4) 정규화 (contents 테이블 컬럼에 맞춤) ─────────────────
function normalizeRow(x) {
  const id = buildContentId({ mediaType: x.mediaType, tmdbId: x.tmdbId, eventType: x.eventType, seasonNumber: x.seasonNumber })
  const nowIso = new Date().toISOString()
  return {
    id,
    type: x.contentType,                 // 기존 Content.type (movie|drama|variety)
    title: x.title,
    posterUrl: imgUrl(IMG_POSTER, x.posterPath),
    synopsis: x.overview || '',
    genres: x.genres || [],              // 한글 장르명
    creators: x.creators || [],          // 감독(영화) / 연출·제작(TV)
    platform: x.providers?.[0]?.providerName || null,
    releaseYear: x.releaseDate ? Number(x.releaseDate.slice(0, 4)) : null,
    releaseDate: x.releaseDate,
    status: 'upcoming',
    popularity: Math.round(x.popularity || 0),
    avgRating: 0,
    reviewCount: 0,
    createdBy: 'tmdb',
    createdAt: nowIso,
    // ── OTT 확장 필드 ──
    tmdbId: x.tmdbId,
    mediaType: x.mediaType,
    eventType: x.eventType,
    seasonNumber: x.seasonNumber ?? null,
    originalTitle: x.originalTitle ?? null,
    backdropUrl: imgUrl(IMG_BACKDROP, x.backdropPath),
    releaseDateSource: x.releaseDateSource,
    providers: x.providers || [],
    voteAverage: x.voteAverage ?? null,
    voteCount: x.voteCount ?? null,
    tmdbUrl: tmdbUrl(x.mediaType, x.tmdbId),
    source: 'tmdb',
    region: REGION,
    hidden: false,
    syncedAt: nowIso,
    // ── 상세정보 확장 ──
    castMembers: x.castMembers || [],
    networks: x.networks || [],
    runtime: x.runtime ?? null,
    numberOfSeasons: x.numberOfSeasons ?? null,
    numberOfEpisodes: x.numberOfEpisodes ?? null,
  }
}

// ── 5) Supabase REST (service_role) ────────────────────────
async function sbFetch(pathAndQuery, init = {}) {
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

/** 기존 행의 manualOverride 상태 조회 (id → bool) */
async function loadManualFlags(ids) {
  const inList = ids.map(id => `"${id}"`).join(',')
  const res = await sbFetch(`contents?id=in.(${inList})&select=id,manualOverride`)
  const rows = await res.json()
  const map = new Map()
  for (const r of rows) map.set(r.id, r.manualOverride === true)
  return map
}

async function upsertRows(rows) {
  await sbFetch('contents?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
}

/**
 * 이미 존재하는 행을 title 등 NOT NULL 컬럼 없이 부분 갱신(PATCH).
 * upsert(POST)는 INSERT 경로에서 title NOT NULL 검사를 먼저 통과해야 하므로
 * title을 뺀 manualOverride 보호 행은 반드시 PATCH(업데이트 전용)로 써야 한다.
 */
async function patchRows(rows) {
  for (const r of rows) {
    const { id, ...patch } = r
    try {
      await sbFetch(`contents?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      })
    } catch (e) { logErr(`보호 행 PATCH 실패(${id}): ${e.message}`) }
  }
}

/**
 * manualOverride=true 인 기존 행은 "관리자 큐레이션 소유"로 간주한다.
 * → 자동 텔레메트리(인기도·평점·백드롭·동기화시각)만 갱신하고,
 *   제목·공개일·줄거리·장르·제작진·출연·채널·편성 등 콘텐츠 필드는 절대 덮어쓰지 않는다.
 *   (관리자가 수동으로 고친 잘못된/누락된 정보가 다음 동기화 때 되돌아가지 않게)
 */
async function upsertProtected(rows) {
  if (!rows.length) return
  const flags = await loadManualFlags(rows.map(r => r.id))
  const normal = [], guarded = []
  for (const r of rows) {
    if (flags.get(r.id)) {
      guarded.push({
        id: r.id,
        popularity: r.popularity,
        voteAverage: r.voteAverage,
        voteCount: r.voteCount,
        backdropUrl: r.backdropUrl,
        tmdbUrl: r.tmdbUrl,
        syncedAt: r.syncedAt,
      })
      stats.updated++
    } else {
      normal.push(r)
      if (flags.has(r.id)) stats.updated++; else stats.inserted++
    }
  }
  if (normal.length) await upsertRows(normal)
  if (guarded.length) await patchRows(guarded)   // 보호 행은 update-only (콘텐츠 필드 미포함)
}

// ── 동기화 로그 (best-effort) ──────────────────────────────
async function writeLog(status, extra = {}) {
  if (DRY || !SERVICE_KEY) return
  try {
    await sbFetch('sync_logs', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([{
        job: 'tmdb-ott', status, mode: MODE,
        rangeStart: START, rangeEnd: END,
        finishedAt: new Date().toISOString(),
        stats, errors: errors.slice(0, 50), ...extra,
      }]),
    })
  } catch (e) { console.warn('  ⚠️ 로그 기록 실패:', e.message) }
}

// ── 메인 ────────────────────────────────────────────────────
async function main() {
  console.log(`🎬 TMDB OTT 동기화 시작 — mode=${MODE}, 범위 ${START}~${END}, ${DRY ? 'DRY-RUN' : '반영'}`)
  console.log(`   대상 OTT: ${TARGET_PROVIDER_NAMES.join(', ')}`)

  const [movieProviders, tvProviders] = await Promise.all([loadProviders('movie'), loadProviders('tv')])
  stats.providersProcessed = movieProviders.length + tvProviders.length
  console.log(`📡 매칭된 provider — 영화 ${movieProviders.length}종, TV ${tvProviders.length}종`)

  // networks 폴백이 쓸 표준 로고/ID 사전 구축 (TV 우선, 없으면 영화 카탈로그)
  for (const p of [...tvProviders, ...movieProviders]) {
    const k = normName(p.providerName)
    if (!PROVIDER_DIR.has(k)) PROVIDER_DIR.set(k, { providerId: p.providerId, logoPath: p.logoPath })
  }

  // 수집
  const movieCand = await collectMovies(movieProviders)
  const tvCand = await collectTv(tvProviders)
  console.log(`🔎 후보 — 영화 ${movieCand.size}건, TV ${tvCand.size}건 (상세 보강 시작)`)

  // 상세 보강 (동시 제한)
  const rowsById = new Map()
  const put = row => {
    if (!row) return
    const prev = rowsById.get(row.id)
    if (prev) prev.providers = mergeProviders(prev.providers, row.providers)
    else rowsById.set(row.id, row)
  }

  const movieResults = await pMap([...movieCand.values()], enrichMovie, CONCURRENCY)
  for (const r of movieResults) if (r && !r.__error) { put(r); stats.moviesFetched++ }

  const tvResults = await pMap([...tvCand.values()], enrichTv, CONCURRENCY)
  for (const arr of tvResults) {
    if (!arr || arr.__error) continue
    for (const r of arr) put(r)
    if (arr.length) stats.tvShowsFetched++
  }

  const rows = [...rowsById.values()].sort((a, b) => (a.releaseDate || '').localeCompare(b.releaseDate || ''))
  console.log(`\n📋 저장 대상 ${rows.length}건 (영화 ${stats.moviesFetched}, TV ${stats.tvShowsFetched}, 시즌 ${stats.seasonsFetched}, 스킵 ${stats.skipped})`)
  for (const r of rows.slice(0, 30)) {
    console.log(`  ${r.releaseDate} [${r.mediaType}] ${r.title} — ${r.providers.map(p => p.providerName).join('/')} (${r.releaseDateSource})`)
  }
  if (rows.length > 30) console.log(`  ... 외 ${rows.length - 30}건`)

  if (DRY) { console.log('\n(DRY-RUN: DB 미반영)'); return }
  if (!rows.length) { console.log('\n반영할 데이터 없음.'); await writeLog('success'); return }

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    try { await upsertProtected(batch) }
    catch (e) { logErr(`upsert 실패(batch ${i / BATCH | 0}): ${e.message}`) }
  }

  // full 모드 정리: 이번 실행에서 갱신 안 된 옛 tmdb 자동수집 행은 숨김 처리.
  // (이전 동기화의 노이즈/사라진 작품 제거. 삭제 대신 hidden=true → FK 안전·자가치유.
  //  manualOverride 행은 관리자 큐레이션이므로 건드리지 않음. incremental 모드는 일부 범위만
  //  다루므로 정리하지 않는다.)
  if (MODE === 'full') {
    try {
      const res = await sbFetch(
        `contents?source=eq.tmdb&manualOverride=eq.false&hidden=eq.false&syncedAt=lt.${encodeURIComponent(RUN_START)}`,
        { method: 'PATCH', headers: { Prefer: 'return=minimal,count=exact' }, body: JSON.stringify({ hidden: true }) },
      )
      const range = res.headers.get('content-range') || ''
      stats.hiddenStale = Number(range.split('/')[1]) || 0
      console.log(`🧹 정리: 갱신 안 된 옛 tmdb 행 ${stats.hiddenStale}건 숨김 처리`)
    } catch (e) { logErr(`정리(숨김) 실패: ${e.message}`) }
  }

  await writeLog('success')
  console.log(`\n✅ 완료 — inserted ${stats.inserted}, updated ${stats.updated}, skipped ${stats.skipped}, failed ${stats.failed}`)
  console.log(JSON.stringify({ success: true, ...stats, errors: errors.slice(0, 10) }, null, 2))
}

main().catch(async e => {
  console.error('\n❌ 동기화 실패:', e.message)
  await writeLog('failed', { errors: [...errors, { message: e.message }].slice(0, 50) })
  process.exit(1)
})
