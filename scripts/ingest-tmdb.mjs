/**
 * TMDB → Supabase 개봉·공개 예정작 수집기
 * ------------------------------------------------------------
 * 영화(극장 개봉예정) + 드라마(한국 방영예정)를 TMDB에서 가져와
 * Supabase contents 테이블에 upsert 합니다. (releaseDate / posterUrl 포함)
 *
 * 사전 준비:
 *   1) supabase/migration_calendar.sql 을 SQL Editor에서 실행 (releaseDate 컬럼)
 *   2) TMDB 무료 API 키 발급: https://www.themoviedb.org/settings/api  (v3 auth key)
 *
 * 실행:
 *   TMDB_API_KEY=xxxx node scripts/ingest-tmdb.mjs          # 실제 반영
 *   TMDB_API_KEY=xxxx node scripts/ingest-tmdb.mjs --dry     # 미리보기(쓰기 안 함)
 *
 * 옵션 env:
 *   TMDB_API_KEY   (필수) TMDB v3 API 키
 *   PAGES          가져올 페이지 수 (기본 3, 각 20건)
 *   SUPABASE_URL / SUPABASE_KEY  (없으면 아래 기본 publishable 값 사용)
 */

const TMDB_KEY = process.env.TMDB_API_KEY
const DRY = process.argv.includes('--dry')
const PAGES = Math.max(1, parseInt(process.env.PAGES || '3', 10))

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ggswwptjbwvesjkowwsc.supabase.co'
// RLS 적용 후 contents는 관리자/서비스롤만 쓸 수 있으므로 service_role 키가 필요합니다.
// Supabase 대시보드 → Settings → API → service_role (secret) 값을 SUPABASE_SERVICE_KEY 로 설정하세요.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_XRQiUZAforlq1XXAZytb0A_6CAkxx6t'

const IMG = 'https://image.tmdb.org/t/p/w500'
const TMDB = 'https://api.themoviedb.org/3'

if (!TMDB_KEY) {
  console.error('❌ TMDB_API_KEY 환경변수가 필요합니다.\n   예) TMDB_API_KEY=xxxx node scripts/ingest-tmdb.mjs')
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)

async function tmdb(path, params = {}) {
  const url = new URL(TMDB + path)
  url.searchParams.set('api_key', TMDB_KEY)
  url.searchParams.set('language', 'ko-KR')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TMDB ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

// 장르 id → 한글 이름
async function loadGenres() {
  const map = {}
  for (const kind of ['movie', 'tv']) {
    const { genres } = await tmdb(`/genre/${kind}/list`)
    for (const g of genres) map[g.id] = g.name
  }
  return map
}

function toRow(type, m, dateField, genreMap, platform) {
  const date = m[dateField]
  if (!date || date < today) return null // 아직 안 나온 것만
  const title = m.title || m.name
  if (!title) return null
  return {
    id: `tmdb-${type === 'movie' ? 'mv' : 'dr'}-${m.id}`,
    type,
    title,
    posterUrl: m.poster_path ? IMG + m.poster_path : null,
    synopsis: m.overview || '',
    genres: (m.genre_ids || []).map(id => genreMap[id]).filter(Boolean),
    creators: [],
    platform,
    releaseYear: Number(date.slice(0, 4)),
    releaseDate: date,
    status: 'upcoming',
    popularity: Math.round(m.popularity || 0),
    avgRating: 0,
    reviewCount: 0,
    createdBy: 'tmdb',
    createdAt: new Date().toISOString(),
  }
}

async function collect() {
  const genreMap = await loadGenres()
  const rows = new Map() // id → row (dedup)

  // 영화: 국내 개봉예정
  for (let p = 1; p <= PAGES; p++) {
    const { results = [] } = await tmdb('/movie/upcoming', { region: 'KR', page: String(p) })
    for (const m of results) {
      const r = toRow('movie', m, 'release_date', genreMap, '극장')
      if (r) rows.set(r.id, r)
    }
  }

  // 드라마: 한국 방영예정 (원어 한국어, 첫방영일이 오늘 이후)
  for (let p = 1; p <= PAGES; p++) {
    const { results = [] } = await tmdb('/discover/tv', {
      sort_by: 'first_air_date.asc',
      'first_air_date.gte': today,
      with_original_language: 'ko',
      page: String(p),
    })
    for (const m of results) {
      const r = toRow('drama', m, 'first_air_date', genreMap, 'TV/OTT')
      if (r) rows.set(r.id, r)
    }
  }

  return [...rows.values()].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))
}

async function upsert(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/contents?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`Supabase upsert → ${res.status} ${await res.text()}`)
}

;(async () => {
  console.log(`🎬 TMDB 수집 시작 (오늘=${today}, 페이지=${PAGES}, ${DRY ? 'DRY-RUN' : '반영'})`)
  const rows = await collect()
  console.log(`\n📋 예정작 ${rows.length}건 수집:`)
  for (const r of rows.slice(0, 40)) {
    console.log(`  ${r.releaseDate}  [${r.type === 'movie' ? '영화' : '드라마'}] ${r.title}`)
  }
  if (rows.length > 40) console.log(`  ... 외 ${rows.length - 40}건`)

  if (DRY) { console.log('\n(DRY-RUN: DB에 쓰지 않음)'); return }
  if (!rows.length) { console.log('\n반영할 데이터 없음.'); return }

  await upsert(rows)
  console.log(`\n✅ Supabase contents 에 ${rows.length}건 upsert 완료.`)
})().catch(e => { console.error('\n❌ 실패:', e.message); process.exit(1) })
