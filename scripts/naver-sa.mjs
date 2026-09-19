/**
 * 네이버 유입 검색어 받아오기 (서치어드바이저 → Supabase) — 내 PC 전용
 *
 *   node --env-file-if-exists=.env scripts/naver-sa.mjs            # 수집해서 반영 (작업 스케줄러가 주 1회 부른다)
 *   node --env-file-if-exists=.env scripts/naver-sa.mjs --dry      # 미리보기
 *   node --env-file-if-exists=.env scripts/naver-sa.mjs --login    # 처음 한 번 / 로그인이 풀렸을 때
 *
 * 왜 PC 에서 도나:
 *   서치어드바이저는 공개 API 가 없고 로그인한 화면에서만 보인다. 그래서 구글(fetch-gsc, GitHub Actions)처럼
 *   서버에서 돌 수 없고, 로그인 상태를 저장해 둔 이 PC 의 크롬 프로필로 읽는다.
 *   프로필은 scripts/.naver-profile/ (gitignore — 네이버 로그인 쿠키가 들어 있다).
 *
 * 무엇을 읽나 (2026-09-19 실측):
 *   화면이 부르는 /api-console/report/expose/{사용자 id}?period=N&topN=… 를 그대로 부른다.
 *   · period 는 1·7·30·90 만 된다. 날짜를 고르는 인자는 없다 — period=1 은 '가장 최근 하루'뿐이다
 *   · 검색어별 값은 최근 7일치까지만 나온다(7·30·90 이 똑같이 나온다)
 *   · 클릭이 난 검색어는 전부 나온다(검색어 합 = 전체 클릭). 노출만 있는 검색어는 일부만
 *   · 평균 노출 순위(exposedRank)도 준다 — 손으로 붙여넣을 땐 없던 값이다
 *
 * 그래서 이렇게 적는다 (주 1회만 돌아도 합계가 네이버 화면과 맞게):
 *   ① period=1 → 가장 최근 하루(L)를 그 날짜로
 *   ② period=7 에서 ①과 이미 적힌 날들을 뺀 나머지 → 비어 있는 날들 중 첫날에 한 덩어리로
 *   관리자 통계는 기간 안의 행을 합쳐 보여주므로(search_queries_summary) 덩어리여도 합계는 정확하다.
 *   7일보다 오래 안 돌면 그 사이 날짜는 네이버에서도 사라져 못 받는다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROFILE = path.join(HERE, '.naver-profile')
const CONFIG = path.join(HERE, '.naver-profile', 'ottcal-sa.json')   // 사용자 id — 프로필과 함께 산다
const CONSOLE = 'https://searchadvisor.naver.com/console/board'
const SITE = 'https://ottcal.com'

const LOGIN = process.argv.includes('--login')
const DRY = process.argv.includes('--dry')
const SUPA = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://ggswwptjbwvesjkowwsc.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_KEY

const openBrowser = headless => chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless, viewport: { width: 1280, height: 900 },
})

// ── 로그인 ──────────────────────────────────────────────────
if (LOGIN) {
  const ctx = await openBrowser(false)
  // 서치어드바이저가 로그인 직후 돌려주는 사용자 id(enc_id)를 적어 둔다 — 리포트 주소에 들어간다
  ctx.on('response', async res => {
    if (!/searchadvisor\.naver\.com\/api\/auth\/login-token/.test(res.url())) return
    try {
      const encId = JSON.parse(await res.text())?.userData?.enc_id
      if (encId) { fs.writeFileSync(CONFIG, JSON.stringify({ encId })); console.log('✓ 로그인 확인') }
    } catch { /* 무시 */ }
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(CONSOLE)
  console.log('\n크롬 창에서 네이버에 로그인하세요 ("로그인 상태 유지" 체크). 사이트 목록이 보이면 창을 닫으면 됩니다.\n')
  await new Promise(r => ctx.on('close', r))
  console.log(fs.existsSync(CONFIG) ? '완료 — 이제 주간 수집이 이 로그인으로 돕니다.' : '⚠️ 로그인을 확인하지 못했습니다. 다시 --login 해 주세요.')
  process.exit(0)
}

// ── 수집 ────────────────────────────────────────────────────
if (!KEY && !DRY) { console.error('SUPABASE_SERVICE_KEY 가 없습니다 (.env).'); process.exit(1) }

/** 작업 스케줄러는 창 없이 돈다 — 사람이 손써야 할 때만 화면에 알림을 띄운다 */
function alertUser(text) {
  execFile('msg', ['*', `[오티티칼] ${text}`], () => {})
}

const ymd = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function sb(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPA}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status} ${await res.text()}`)
  return res
}

async function writeLog(status, extra = {}) {
  if (DRY || !KEY) return
  try {
    await sb('sync_logs', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([{ job: 'naver-sa', status, finishedAt: new Date().toISOString(), ...extra }]),
    })
  } catch (e) { console.warn('로그 기록 실패:', e.message) }
}

async function fetchReports() {
  const encId = fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG, 'utf8')).encId : null
  if (!encId) return { needLogin: true }
  const ctx = await openBrowser(true)
  try {
    const page = ctx.pages()[0] || await ctx.newPage()
    await page.goto(CONSOLE)
    await page.waitForTimeout(2500)
    // 로그인이 풀렸으면 네이버 로그인 화면으로 넘어간다
    if (/nid\.naver\.com/.test(page.url())) return { needLogin: true }
    const base = `https://searchadvisor.naver.com/api-console/report/expose/${encId}?site=${encodeURIComponent(SITE)}&device=d&topN=1000`
    const get = async period => {
      const text = await page.evaluate(async u => (await fetch(u, { credentials: 'include' })).text(), `${base}&period=${period}`)
      let j; try { j = JSON.parse(text) } catch { return null }
      return j?.code === 0 ? { latest: j.meta?.latestDate, ...j.items?.[0] } : null
    }
    const day = await get(1), week = await get(7)
    if (!day || !week) return { needLogin: true }
    return { day, week }
  } finally { await ctx.close() }
}

const toRow = (day, q) => ({
  source: 'naver', day, query: String(q.key).slice(0, 200),
  clicks: q.clickCount || 0, impressions: q.exposeCount || 0,
  position: q.exposedRank ?? null, updatedAt: new Date().toISOString(),
})

try {
  const r = await fetchReports()
  if (r.needLogin) {
    console.error('네이버 로그인이 필요합니다: node --env-file-if-exists=.env scripts/naver-sa.mjs --login')
    alertUser('네이버 서치어드바이저 로그인이 풀려 검색어를 받지 못했습니다. 방좋 폴더에서 npm run naver:login 을 실행해 주세요.')
    await writeLog('failed', { errors: [{ message: 'login required' }] })
    process.exit(1)
  }

  const L = ymd(r.day.latest)
  const windowStart = addDays(L, -6)
  const rows = (r.day.querys || []).map(q => toRow(L, q))

  // 이미 적힌 날(L 제외)을 빼고 남은 7일치를 비어 있는 첫날에 한 덩어리로
  const existing = DRY && !KEY ? [] : await (await sb(
    `search_queries?select=day,query,clicks,impressions&source=eq.naver&day=gte.${windowStart}&day=lt.${L}`,
  )).json()
  const covered = new Set(existing.map(e => e.day))
  const missing = []
  for (let d = windowStart; d < L; d = addDays(d, 1)) if (!covered.has(d)) missing.push(d)
  let lump = []
  if (missing.length) {
    const sub = new Map()
    const add = (q, c, i) => { const s = sub.get(q) || { c: 0, i: 0 }; s.c += c; s.i += i; sub.set(q, s) }
    for (const e of existing) add(e.query, e.clicks, e.impressions)
    for (const q of r.day.querys || []) add(String(q.key), q.clickCount || 0, q.exposeCount || 0)
    lump = (r.week.querys || []).map(q => {
      const s = sub.get(String(q.key)) || { c: 0, i: 0 }
      return { ...toRow(missing[0], q), clicks: Math.max(0, (q.clickCount || 0) - s.c), impressions: Math.max(0, (q.exposeCount || 0) - s.i) }
    }).filter(x => x.clicks > 0 || x.impressions > 0)
  }

  const clicks = rs => rs.reduce((n, x) => n + x.clicks, 0)
  console.log(`최근 하루 ${L}: 검색어 ${rows.length}개 · 클릭 ${clicks(rows)}`)
  console.log(missing.length
    ? `비어 있던 ${missing[0]}~${missing[missing.length - 1]} (${missing.length}일): 검색어 ${lump.length}개 · 클릭 ${clicks(lump)} → ${missing[0]} 에 합쳐 적음`
    : '그 앞 6일은 이미 받아 둠')
  console.log(`7일 합계(네이버): 클릭 ${r.week.period?.clickCount} · 노출 ${r.week.period?.exposeCount}`)

  if (DRY) { console.log('(DRY-RUN: DB 미반영)'); process.exit(0) }
  const all = [...rows, ...lump]
  for (let i = 0; i < all.length; i += 200) {
    await sb('search_queries?on_conflict=source,day,query', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(all.slice(i, i + 200)),
    })
  }
  await writeLog('success', { rangeStart: missing[0] || L, rangeEnd: L, stats: { day: rows.length, lump: lump.length, missingDays: missing.length } })
  console.log(`✅ ${all.length}행 저장`)
} catch (e) {
  console.error('❌', e.message)
  alertUser(`네이버 검색어 수집이 실패했습니다: ${e.message}`)
  await writeLog('failed', { errors: [{ message: e.message }] })
  process.exit(1)
}
