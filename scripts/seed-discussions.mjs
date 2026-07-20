/**
 * 방구석토론방 샘플 데이터 시드 (일회성)
 *   - 예능/웹툰/웹소설 샘플 작품 생성 (지금 DB엔 영화·드라마뿐)
 *   - 여러 작품에 유동닉 샘플 글(discussions) 투입
 * 실행: node --env-file-if-exists=.env scripts/seed-discussions.mjs
 *   (SUPABASE_SERVICE_KEY 필요 — RLS 우회 insert)
 */
import { createHash } from 'node:crypto'

const URL = process.env.SUPABASE_URL || 'https://ggswwptjbwvesjkowwsc.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!KEY) { console.error('❌ SUPABASE_SERVICE_KEY 필요'); process.exit(1) }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const pwHash = createHash('sha256').update('seed').digest('hex')
const now = Date.now()
const daysAgo = d => new Date(now - d * 86400000 - Math.floor(Math.random() * 86400000)).toISOString()

async function upsert(table, rows, onConflict = 'id') {
  const res = await fetch(`${URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`${table} upsert ${res.status}: ${await res.text()}`)
}

async function getContents() {
  const res = await fetch(`${URL}/rest/v1/contents?select=id,type,title`, { headers: H })
  return res.json()
}

// ── 1) 샘플 작품 (예능/웹툰/웹소설) ──────────────────────────
const content = (id, type, title, platform, year, status, genres) => ({
  id, type, title, posterUrl: null, synopsis: '', genres, creators: [],
  platform, releaseYear: year, releaseDate: null, status, popularity: 50,
  avgRating: 0, reviewCount: 0, createdBy: 'seed', createdAt: new Date(now).toISOString(),
})

const SAMPLE_CONTENTS = [
  content('var-runningman', 'variety', '런닝맨', 'SBS', 2010, 'ongoing', ['예능']),
  content('var-youquiz', 'variety', '유 퀴즈 온 더 블럭', 'tvN', 2018, 'ongoing', ['예능', '토크']),
  content('var-nahonsan', 'variety', '나 혼자 산다', 'MBC', 2013, 'ongoing', ['예능', '관찰']),
  content('wt-hwasan', 'webtoon', '화산귀환', '네이버웹툰', 2021, 'ongoing', ['무협', '판타지']),
  content('wt-sololv', 'webtoon', '나 혼자만 레벨업', '카카오페이지', 2018, 'completed', ['판타지', '액션']),
  content('wt-goddess', 'webtoon', '여신강림', '네이버웹툰', 2018, 'ongoing', ['로맨스', '일상']),
  content('wn-orv', 'webnovel', '전지적 독자 시점', '문피아', 2018, 'completed', ['판타지', '성장']),
  content('wn-chaebol', 'webnovel', '재벌집 막내아들', '문피아', 2017, 'completed', ['판타지', '드라마']),
]

// ── 2) 샘플 글 ──────────────────────────────────────────────
const NAMES = ['방구석평론가', '넷플중독', '정주행요정', '새벽감성러', '팝콘각', '본방사수', '드덕후', '회귀자', '1화보고옴', '완결정주행', '스압주의', '겜생겜사']
let ni = 0
const nextName = () => NAMES[ni++ % NAMES.length]

// 특정 작품(샘플) 글
const FIXED = [
  ['var-runningman', '이번주 런닝맨 미쳤다ㅋㅋㅋ 진짜 배꼽 빠지는 줄'],
  ['var-runningman', '유재석 예능감은 진짜 국보급이다...'],
  ['var-youquiz', '유퀴즈 자기님들 사연 들으면 매번 울컥함'],
  ['var-youquiz', '큰자기 아기자기 케미 여전하네ㅎㅎ'],
  ['var-nahonsan', '나혼산 보면 자취 로망 생겼다가 현실 자각함'],
  ['wt-hwasan', '화산귀환 청명이 진짜 사이다 그 자체... 무협 입문작으로 강추'],
  ['wt-hwasan', '이거 애니화 언제됨? 작화 미쳤을 듯'],
  ['wt-sololv', '나혼렙 결말까지 완벽했다. 성진우 각성씬 소름'],
  ['wt-goddess', '여신강림 실사판보다 원작이 훨씬 낫다고 본다'],
  ['wn-orv', '전독시 소설 완결 정주행했는데 마지막에 진짜 펑펑 울었음'],
  ['wn-orv', '웹툰이랑 소설이랑 결이 좀 다른데 둘 다 명작'],
  ['wn-chaebol', '재벌집 소설이 드라마보다 디테일 훨 좋음. 결말도 다르고'],
]

async function main() {
  console.log('작품 upsert...')
  await upsert('contents', SAMPLE_CONTENTS)

  const all = await getContents()
  const movies = all.filter(c => c.type === 'movie').slice(0, 6)
  const dramas = all.filter(c => c.type === 'drama').slice(0, 6)

  const MOVIE_BODIES = ['영상미 진짜 미쳤다 스크린으로 본 거 후회 없음', '결말 해석 갈리던데 다들 어떻게 봄?', 'OST가 절반은 한 듯. 아직도 흥얼거림', '기대 안 하고 봤는데 인생영화 등극', '중반부 좀 늘어지는데 후반 몰아치는 맛이 있음']
  const DRAMA_BODIES = ['이거 정주행각이다 밤새서 다 봄ㅋㅋ', '남주 서사 진짜 탄탄하네', '2화까지 참으면 못 끊음 주의', '결말 열린 결말이라 시즌2 나와야 한다', '조연들이 다 캐리하는 드라마']

  const posts = []
  for (const [cid, body] of FIXED) posts.push({ contentId: cid, body, day: 1 + Math.floor(Math.random() * 20) })
  movies.forEach((m, i) => posts.push({ contentId: m.id, body: MOVIE_BODIES[i % MOVIE_BODIES.length], day: 1 + Math.floor(Math.random() * 20) }))
  dramas.forEach((m, i) => posts.push({ contentId: m.id, body: DRAMA_BODIES[i % DRAMA_BODIES.length], day: 1 + Math.floor(Math.random() * 20) }))

  const rows = posts.map((p, i) => ({
    id: `disc-seed-${now}-${i}`,
    contentId: p.contentId,
    authorId: null,
    guestName: nextName(),
    guestPwHash: pwHash,
    body: p.body,
    likes: [],
    createdAt: daysAgo(p.day),
  }))

  console.log(`글 ${rows.length}건 insert...`)
  await upsert('discussions', rows)
  console.log(`✅ 완료: 샘플작품 ${SAMPLE_CONTENTS.length}개 + 글 ${rows.length}건`)
}

main().catch(e => { console.error(e); process.exit(1) })
