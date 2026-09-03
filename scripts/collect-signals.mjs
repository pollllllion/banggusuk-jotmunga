/**
 * 시드 재료 수집기 — 지금 화제인 작품을 골라 "무슨 얘기가 오가는지" 만 모아 온다. 글은 쓰지 않는다.
 *
 *   npm run signals            # scripts/signals.local.json 에 저장
 *   npm run signals -- --dry   # 저장하지 않고 무엇이 뽑혔는지만
 *   npm run signals -- --works 2
 *
 * 이 다음은 Claude Code 세션에서 한다 ("오늘 시드 만들어줘"):
 *   저장된 파일 → 논점 추출 → 페르소나 글·댓글 → scripts/queue.json → 파일 삭제
 *   → 사람이 큐를 읽어 보고 `npm run post`
 *
 * ── 작품을 어떻게 고르나 ────────────────────────────────────
 * 두 단계로 거른다. DB 만 보면 "지금 한국에서 화제"를 못 맞히기 때문이다.
 *
 *   1) DB 점수로 후보 10편   — TMDB 인기도(로그) + 한국 작품 + 공개 임박
 *   2) 유튜브 반응량으로 3편 — 실제로 사람들이 얘기하고 있는지
 *
 * 1)의 점수는 어림짐작이라 이상한 게 섞인다(예: 어린이 애니 시즌21은 TMDB 인기도가
 * 높다). 2)가 그걸 걸러 준다 — 사람들이 실제로 떠드는 작품은 리뷰 영상 댓글이 많다.
 *
 * 인기도 눈금을 타입별로 정규화하지 않는 이유: 예능은 TMDB 인기도 자체가 한 자릿수라,
 * 타입 안에서 백분위를 내면 인기도 5짜리 예능이 인기도 1054짜리 영화와 같은 점수를 받는다.
 *
 * ── 원문 취급 ───────────────────────────────────────────────
 * 여기서 모은 댓글 원문은 **재료일 뿐 결과물이 아니다.** 논점을 뽑고 나면 지운다.
 * queue.json 에도 DB 에도 들어가지 않는다. 남의 댓글을 바꿔 쓰면 그건 2차 저작물이고
 * 검색엔진에는 복제 콘텐츠다. signals.local.json 은 .gitignore 에 있다.
 *
 * 필요한 환경변수 (.env)
 *   VITE_SUPABASE_URL · SUPABASE_SERVICE_KEY   작품 조회
 *   YOUTUBE_API_KEY                            YouTube Data API v3 (무료 · 스크래핑 아님)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── 상한 (함부로 올리지 말 것 — 이유는 CLAUDE.md 의 시드 항목) ──
const DAILY_WORKS = 3          // 최종 작품 수 = 글 수
const POOL = 10                // 유튜브로 확인해 볼 후보 수
const NEAR_DAYS = 45           // 공개일 ±며칠까지를 "지금 화제일 수 있는 작품" 으로 볼지
const YT_VIDEOS = 3            // 작품당 훑을 영상 수
const YT_COMMENTS_PER_VIDEO = 50
const MIN_SIGNAL = 20          // 이만큼도 반응이 없으면 쓸 얘깃거리가 없다는 뜻

const URL_BASE = process.env.VITE_SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_KEY
const YT = process.env.YOUTUBE_API_KEY
const DRY = process.argv.includes('--dry')
const worksArg = process.argv.indexOf('--works')
const WANT = worksArg > 0 ? Number(process.argv[worksArg + 1]) || DAILY_WORKS : DAILY_WORKS

for (const [name, v] of [['VITE_SUPABASE_URL', URL_BASE], ['SUPABASE_SERVICE_KEY', SVC], ['YOUTUBE_API_KEY', YT]]) {
  if (!v) { console.error(`${name} 가 필요합니다 (.env).`); process.exit(1) }
}

const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}` }
const __dirname = dirname(fileURLToPath(import.meta.url))
const QUEUE = resolve(__dirname, 'queue.json')
const OUT = resolve(__dirname, 'signals.local.json')

/**
 * 한 테이블을 끝까지 읽는다.
 * PostgREST 는 한 번에 1000행만 준다 — limit=5000 을 적어도 조용히 1000행에서 잘린다.
 * 작품이 2,000편을 넘은 뒤로는 그냥 두면 카탈로그의 절반을 못 보고 고르게 된다.
 */
async function getAll(table, select) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1/${table}?select=${select}&order=id.asc`, {
      headers: { ...svcH, Range: `${from}-${from + 999}` },
    })
    if (!r.ok) throw new Error(`GET ${table} → ${r.status} ${(await r.text()).slice(0, 200)}`)
    const rows = await r.json()
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}

// ── 1) DB 점수로 후보 추리기 ────────────────────────────────
const today = new Date().toISOString().slice(0, 10)
const daysFrom = d => (new Date(d) - new Date(today)) / 86400000
const HANGUL = /[가-힣]/

const contents = (await getAll('contents', 'id,title,type,releaseDate,synopsis,genres,popularity,originalTitle,verified'))
  .filter(c => c.verified)

const queue = existsSync(QUEUE) ? JSON.parse(readFileSync(QUEUE, 'utf8')) : []
// 큐 파일이 곧 "이미 시드한 작품" 기록이다 — 올렸든 아직이든 같은 작품을 또 잡지 않는다
const seeded = new Set(queue.map(q => String(q.content || '')))

const candidates = contents
  .filter(c => c.releaseDate && Math.abs(daysFrom(c.releaseDate)) <= NEAR_DAYS)
  .filter(c => (c.popularity || 0) > 0)
  .filter(c => !seeded.has(c.id) && !seeded.has(c.title))

if (!candidates.length) {
  console.log(`후보가 없습니다 — 공개 ±${NEAR_DAYS}일 안에 남은 작품이 없거나 전부 이미 시드했습니다.`)
  process.exit(0)
}

// 인기도는 편차가 커서(1 ~ 1054) 그대로 쓰면 1등이 전부를 먹는다 → 로그로 눌러서 0~1 로.
const maxPop = Math.max(...candidates.map(c => c.popularity || 0))
const hotness = c => {
  const d = Math.abs(daysFrom(c.releaseDate))
  return Math.log1p(c.popularity || 0) / Math.log1p(maxPop)
    // 우리 사이트는 한국 사용자가 본다 — TMDB 인기도는 해외 장수 시즌제에 유리하게 기울어 있다
    + (HANGUL.test(c.originalTitle || '') ? 0.4 : 0)
    // 공개 직전·직후가 가장 얘기가 많다
    + (d <= 14 ? 0.25 : d <= 30 ? 0.1 : 0)
}

const pool = candidates
  .map(c => ({ ...c, hot: hotness(c) }))
  .sort((a, b) => b.hot - a.hot)
  .slice(0, POOL)

console.log(`후보 ${candidates.length}편 → 상위 ${pool.length}편을 유튜브로 확인합니다\n`)

// ── 2) 유튜브 반응량으로 최종 선정 ──────────────────────────
async function collect(title) {
  const search = new URLSearchParams({
    key: YT, part: 'snippet', q: `${title} 리뷰`, type: 'video',
    maxResults: String(YT_VIDEOS), regionCode: 'KR', relevanceLanguage: 'ko', order: 'relevance',
  })
  const sr = await fetch(`https://www.googleapis.com/youtube/v3/search?${search}`)
  if (!sr.ok) throw new Error(`youtube search ${sr.status} ${(await sr.text()).slice(0, 160)}`)

  const out = []
  for (const v of (await sr.json()).items || []) {
    const id = v.id?.videoId
    if (!id) continue
    const q = new URLSearchParams({
      key: YT, part: 'snippet', videoId: id,
      maxResults: String(YT_COMMENTS_PER_VIDEO), order: 'relevance', textFormat: 'plainText',
    })
    const cr = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?${q}`)
    // 댓글을 꺼 둔 영상은 403 이다 — 하나 실패했다고 작품 전체를 버리지 않는다
    if (!cr.ok) continue
    for (const t of (await cr.json()).items || []) {
      const txt = t.snippet?.topLevelComment?.snippet?.textDisplay
      // 작성자 이름·프로필·좋아요 수는 가져오지 않는다. 필요한 건 "무슨 얘기가 오가나" 뿐이다.
      if (txt) out.push(txt.replace(/\s+/g, ' ').slice(0, 400))
    }
  }
  return out
}

const measured = []
for (const c of pool) {
  process.stdout.write(`· ${c.title} … `)
  try {
    const comments = await collect(c.title)
    console.log(`반응 ${comments.length}개`)
    if (comments.length >= MIN_SIGNAL) measured.push({ work: c, comments })
  } catch (e) {
    console.log(`실패: ${e.message}`)
  }
}

// 반응이 많은 순 = 지금 실제로 얘기되고 있는 순
const picked = measured.sort((a, b) => b.comments.length - a.comments.length).slice(0, WANT)

if (!picked.length) {
  console.log(`\n반응이 ${MIN_SIGNAL}개를 넘는 작품이 없습니다.`)
  process.exit(0)
}

console.log(`\n선정 ${picked.length}편:`)
for (const { work, comments } of picked) {
  console.log(`  ${work.title} (${work.type} · ${work.releaseDate} · 인기도 ${work.popularity} · 반응 ${comments.length})`)
}

if (DRY) {
  console.log('\n--dry: 저장하지 않았습니다.')
} else {
  const works = picked.map(({ work, comments }) => ({
    contentId: work.id,
    title: work.title,
    type: work.type,
    releaseDate: work.releaseDate,
    genres: work.genres || [],
    synopsis: work.synopsis ? String(work.synopsis).slice(0, 400) : '',
    comments,
  }))
  writeFileSync(OUT, JSON.stringify({ collectedAt: new Date().toISOString(), works }, null, 2) + '\n', 'utf8')
  console.log(`\nscripts/signals.local.json 에 저장했습니다.`)
  console.log('이제 Claude Code 에서 "오늘 시드 만들어줘" 라고 하세요 — 논점을 뽑아 큐를 채우고 이 파일은 지웁니다.')
}
