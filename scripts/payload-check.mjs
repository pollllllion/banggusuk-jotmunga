/**
 * 앱 시작 로드 용량 감시 — 서버측 pagination 으로 갈아탈 시점을 미리 알려준다
 *
 *   npm run payload            # 현황 출력 (임계 넘으면 exit 1)
 *   WARN_KB=400 npm run payload
 *
 * 왜 (2026-08-17):
 *   작품이 늘수록 시작 로드가 무거워진다. TMDB 동기화가 하루 15~20건씩 쌓는다.
 *   임계에 닿기 전에 알려줘야 리팩터를 여유 있게 할 수 있다 → 주간 워크플로에서 자동 실행.
 *
 * ★ 2026-09-09 — 시작 로드가 2단계가 되면서 재는 대상이 바뀌었다 ★
 *   1단계(loadEssential)  작은 표 전부 + 공개일 ±1~2개월 작품 → **첫 페인트를 막는 것**
 *   2단계(loadRest)       작품 전체 → 백그라운드, 화면을 막지 않는다
 *   사용자가 기다리는 건 1단계뿐이라 **임계는 1단계에만 건다.**
 *   2단계는 참고용으로 같이 출력한다(무한정 커져도 되는 건 아니다).
 *
 * 임계 (gzip · 1단계 기준):
 *   ~150KB  괜찮음
 *   150KB~  경고 — 창(window)을 좁히거나 증분 동기화(IndexedDB + syncedAt) 준비
 *   250KB~  착수 — 화면별 서버 쿼리 전환
 */
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://ggswwptjbwvesjkowwsc.supabase.co'
const key = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_XRQiUZAforlq1XXAZytb0A_6CAkxx6t'
const WARN_KB = Number(process.env.WARN_KB || 150)
const ACT_KB = Number(process.env.ACT_KB || 250)

const H = { apikey: key, Authorization: 'Bearer ' + key }
const __dirname = dirname(fileURLToPath(import.meta.url))

/** 실제 앱이 받는 컬럼 그대로 — contentColumns.ts 에서 읽어온다(둘이 어긋나면 측정이 거짓말이 된다) */
function colsFrom(file, constName) {
  const src = readFileSync(resolve(__dirname, `../src/api/${file}`), 'utf8')
  const block = src.split(`export const ${constName} = [`)[1].split('].join')[0]
  return block.match(/'([^']+)'/g).map(s => s.replace(/'/g, '')).join(',')
}

function listCols() { return colsFrom('contentColumns.ts', 'CONTENT_LIST_COLS') }
function curationCols() { return colsFrom('curationColumns.ts', 'CURATION_LIST_COLS') }

async function measure(table, cols) {
  let raw = 0, gz = 0, rows = 0
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${table}?select=${cols}&order=id.asc&offset=${from}&limit=1000`, { headers: H })
    if (!res.ok) { console.error(`  ${table} 조회 실패 ${res.status}`); return { raw: 0, gz: 0, rows: 0 } }
    const text = await res.text()
    raw += Buffer.byteLength(text)
    gz += gzipSync(Buffer.from(text)).length
    const j = JSON.parse(text)
    rows += j.length
    if (j.length < 1000) break
  }
  return { raw, gz, rows }
}

// users 는 필요한 행만 골라 받으므로(cache.ts loadGuestUsers) 시작 로드에 안 넣는다
// contents 는 1단계에서 '창'만 받으므로 따로 잰다
const SMALL_TABLES = [
  ['profiles', '*'], ['discussions', '*'], ['discussion_comments', '*'],
  ['reviews', '*'], ['comments', '*'], ['announcements', '*'],
  // 큐레이션은 본문(body·items)을 상세에서 받는다 — 목록 컬럼만 시작 로드에 오른다
  ['curations', curationCols()],
]

/** cache.ts 의 windowRange 와 같은 규칙 (지난달 1일 ~ 두 달 뒤 말일) */
function windowRange(base = new Date()) {
  const k = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    from: k(new Date(base.getFullYear(), base.getMonth() - 1, 1)),
    to: k(new Date(base.getFullYear(), base.getMonth() + 3, 0)),
  }
}

/** 한 번의 range 요청 크기 */
async function measureOne(table, cols, filter = '') {
  const res = await fetch(`${url}/rest/v1/${table}?select=${cols}${filter}`, { headers: H })
  if (!res.ok) { console.error(`  ${table} 조회 실패 ${res.status}`); return { raw: 0, gz: 0, rows: 0 } }
  const text = await res.text()
  return { raw: Buffer.byteLength(text), gz: gzipSync(Buffer.from(text)).length, rows: JSON.parse(text).length }
}

let totalRaw = 0, totalGz = 0
console.log('■ 1단계 — 첫 페인트를 막는 부분 (비로그인 기준)')
for (const [t, cols] of SMALL_TABLES) {
  const m = await measure(t, cols)
  totalRaw += m.raw; totalGz += m.gz
  console.log(`  ${t.padEnd(20)} ${String(m.rows).padStart(5)}행  ${(m.raw / 1024).toFixed(0).padStart(5)}KB → gzip ${(m.gz / 1024).toFixed(0).padStart(4)}KB`)
}
const { from, to } = windowRange()
const win = await measureOne('contents', listCols(), `&releaseDate=gte.${from}&releaseDate=lte.${to}`)
totalRaw += win.raw; totalGz += win.gz
console.log(`  ${('contents(창)').padEnd(20)} ${String(win.rows).padStart(5)}행  ${(win.raw / 1024).toFixed(0).padStart(5)}KB → gzip ${(win.gz / 1024).toFixed(0).padStart(4)}KB   ${from}~${to}`)

const gzKB = totalGz / 1024
console.log(`  ${'1단계 합계'.padEnd(17)} ${''.padStart(5)}    ${(totalRaw / 1024).toFixed(0).padStart(5)}KB → gzip ${gzKB.toFixed(0).padStart(4)}KB`)
console.log(`  임계: 경고 ${WARN_KB}KB · 착수 ${ACT_KB}KB (gzip 기준)`)

// 2단계는 화면을 막지 않는다 — 참고용
const all = await measure('contents', listCols())
console.log(`\n■ 2단계 — 백그라운드 (화면을 막지 않음)`)
console.log(`  ${'contents(전체)'.padEnd(20)} ${String(all.rows).padStart(5)}행  ${(all.raw / 1024).toFixed(0).padStart(5)}KB → gzip ${(all.gz / 1024).toFixed(0).padStart(4)}KB`)

if (gzKB >= ACT_KB) {
  console.error(`\n🔴 1단계가 착수 임계 초과 (${gzKB.toFixed(0)}KB ≥ ${ACT_KB}KB)`)
  console.error('   화면별 서버 쿼리로 전환할 때다.')
  process.exit(1)
}
if (gzKB >= WARN_KB) {
  console.error(`\n🟠 1단계가 경고 임계 초과 (${gzKB.toFixed(0)}KB ≥ ${WARN_KB}KB)`)
  console.error('   창(window)을 좁히거나, 증분 동기화(IndexedDB + syncedAt) 준비를 시작할 것.')
  console.error('   당장 급하진 않지만 여기서 더 두면 리팩터를 쫓기며 하게 된다.')
  process.exit(1)
}
console.log('\n🟢 여유 있음.')
