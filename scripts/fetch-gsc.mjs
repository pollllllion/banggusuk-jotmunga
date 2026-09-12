/**
 * 구글 유입 검색어 받아오기 (Search Console API → Supabase)
 *
 *   node --env-file-if-exists=.env scripts/fetch-gsc.mjs [--days 10]
 *
 * 왜 필요한가:
 *   "밖에서 뭘 검색해 들어왔나"는 우리 사이트에서 알 수 없다 — 브라우저가 referrer 에서
 *   검색어를 지우고 도메인만 넘긴다(2026-09-09 실측). 검색엔진 쪽에서 받아 오는 수밖에 없다.
 *
 * 필요한 것 (GitHub Actions 시크릿 / 로컬 .env):
 *   GSC_SERVICE_ACCOUNT_JSON  구글 서비스 계정 키 JSON **전문**
 *   SUPABASE_SERVICE_KEY      Supabase service_role 키
 *
 * 사람이 한 번만 해 두는 준비:
 *   ① Google Cloud 프로젝트에서 "Google Search Console API" 사용 설정
 *   ② 서비스 계정 생성 → JSON 키 내려받기
 *   ③ Search Console → 설정 → 사용자 및 권한 → 그 서비스 계정 이메일을 사용자로 추가
 *      (client_email 필드에 있는 …@….iam.gserviceaccount.com 주소)
 *
 * 며칠치를 다시 받는 이유: 구글 데이터는 2~3일 뒤에도 늘어난다. 겹치는 날은
 * 같은 키(source·day·query)로 덮어써서 최신값만 남는다.
 */
import crypto from 'crypto'

const SITE = 'sc-domain:ottcal.com'
const SUPA = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://ggswwptjbwvesjkowwsc.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_KEY
const DAYS = Number((process.argv.find(a => a.startsWith('--days=')) || '').split('=')[1]) || 10

const raw = process.env.GSC_SERVICE_ACCOUNT_JSON
// 키가 아직 없으면 조용히 건너뛴다 — 이것 때문에 매일 도는 수집 워크플로가 빨갛게 뜨면 안 된다
if (!raw) { console.log('GSC_SERVICE_ACCOUNT_JSON 이 없어 건너뜁니다 (준비 절차는 이 파일 맨 위 주석에).'); process.exit(0) }
if (!KEY) { console.error('SUPABASE_SERVICE_KEY 가 없습니다.'); process.exit(1) }

let sa
try { sa = JSON.parse(raw) } catch { console.error('GSC_SERVICE_ACCOUNT_JSON 을 JSON 으로 읽지 못했습니다.'); process.exit(1) }
if (!sa.client_email || !sa.private_key) { console.error('키 JSON 에 client_email / private_key 가 없습니다.'); process.exit(1) }

const b64url = buf => Buffer.from(buf).toString('base64url')

/** 서비스 계정 JWT 로 액세스 토큰 받기 (라이브러리 없이 — 의존성을 늘리지 않는다) */
async function accessToken() {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(sa.private_key)
  const jwt = `${header}.${claim}.${b64url(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`토큰 발급 실패 ${res.status}: ${JSON.stringify(json)}`)
  return json.access_token
}

const ymd = d => d.toISOString().slice(0, 10)

async function fetchRows(token) {
  const end = new Date()
  const start = new Date(Date.now() - DAYS * 86400_000)
  const out = []
  // 한 번에 최대 25,000행. 우리 규모엔 넘칠 일이 없지만 늘어날 때를 대비해 넘겨 받는다.
  for (let startRow = 0; ; startRow += 5000) {
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: ymd(start), endDate: ymd(end),
          dimensions: ['date', 'query'],
          type: 'web',
          rowLimit: 5000,
          startRow,
        }),
      })
    const json = await res.json()
    if (!res.ok) {
      // 권한 문제는 메시지가 길어서 그대로 보여 준다 — 서비스 계정을 GSC 사용자로 추가했는지 확인해야 한다
      throw new Error(`Search Console ${res.status}: ${JSON.stringify(json).slice(0, 500)}`)
    }
    const rows = json.rows || []
    out.push(...rows)
    if (rows.length < 5000) break
  }
  return out
}

async function upsert(rows) {
  if (!rows.length) return 0
  // 같은 키(source·day·query)는 덮어쓴다 — 구글 수치는 며칠 뒤에도 늘어난다
  const res = await fetch(`${SUPA}/rest/v1/search_queries?on_conflict=source,day,query`, {
    method: 'POST',
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return rows.length
}

const token = await accessToken()
const rows = await fetchRows(token)
const mapped = rows.map(r => ({
  source: 'google',
  day: r.keys[0],
  query: String(r.keys[1]).slice(0, 200),
  clicks: Math.round(r.clicks || 0),
  impressions: Math.round(r.impressions || 0),
  position: r.position != null ? Number(r.position.toFixed(2)) : null,
}))

// 같은 실행 안에서 키가 겹치면 ON CONFLICT 가 "두 번 건드렸다"고 거부한다 — 마지막 것만 남긴다
const byKey = new Map()
for (const m of mapped) byKey.set(`${m.day}|${m.query}`, m)
const unique = [...byKey.values()]

const n = await upsert(unique)
const clicks = unique.reduce((s, r) => s + r.clicks, 0)
console.log(`구글 검색어 ${n}행 저장 (최근 ${DAYS}일 · 클릭 합계 ${clicks})`)
if (!n) console.log('검색어가 하나도 없습니다 — 아직 노출이 적거나, 서비스 계정이 GSC 사용자로 추가되지 않았을 수 있습니다.')
