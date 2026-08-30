/**
 * 앱 시작 로드 용량 감시 — 서버측 pagination 으로 갈아탈 시점을 미리 알려준다
 *
 *   npm run payload            # 현황 출력 (임계 넘으면 exit 1)
 *   WARN_KB=400 npm run payload
 *
 * 왜 (2026-08-17):
 *   이 앱은 시작할 때 테이블을 통째로 캐시에 올린다. 작품이 늘수록 첫 로딩이 무거워진다.
 *   컬럼을 덜어내 지금은 gzip 231KB 수준이고, TMDB 동기화가 하루 15~20건씩 쌓는다.
 *   임계에 닿기 전에 알려줘야 리팩터를 여유 있게 할 수 있다 → 주간 워크플로에서 자동 실행.
 *
 * 임계 (gzip, 사용자가 실제로 받는 크기 기준):
 *   ~350KB  괜찮음
 *   350KB~  경고 — 증분 동기화(IndexedDB + syncedAt 이후 변경분만) 준비 시작
 *   500KB~  착수 — 화면별 서버 쿼리(React Query) 전환
 *   순서가 중요하다. 증분 동기화가 훨씬 싸고 효과가 크다. pagination 은 그다음.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://ggswwptjbwvesjkowwsc.supabase.co'
const key = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_XRQiUZAforlq1XXAZytb0A_6CAkxx6t'
const WARN_KB = Number(process.env.WARN_KB || 350)
const ACT_KB = Number(process.env.ACT_KB || 500)

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

// users 는 이제 필요한 행만 골라 받으므로(cache.ts loadGuestUsers) 시작 로드에 안 넣는다
const TABLES = [
  ['contents', listCols()],
  ['profiles', '*'], ['discussions', '*'], ['discussion_comments', '*'],
  ['reviews', '*'], ['comments', '*'], ['announcements', '*'],
  // 큐레이션은 본문(body·items)을 상세에서 받는다 — 목록 컬럼만 시작 로드에 오른다
  ['curations', curationCols()],
]

let totalRaw = 0, totalGz = 0
console.log('앱 시작 로드 (비로그인 기준)')
for (const [t, cols] of TABLES) {
  const m = await measure(t, cols)
  totalRaw += m.raw; totalGz += m.gz
  console.log(`  ${t.padEnd(20)} ${String(m.rows).padStart(5)}행  ${(m.raw / 1024).toFixed(0).padStart(5)}KB → gzip ${(m.gz / 1024).toFixed(0).padStart(4)}KB`)
}
const gzKB = totalGz / 1024
console.log(`  ${'합계'.padEnd(19)} ${''.padStart(5)}    ${(totalRaw / 1024).toFixed(0).padStart(5)}KB → gzip ${gzKB.toFixed(0).padStart(4)}KB`)
console.log(`  임계: 경고 ${WARN_KB}KB · 착수 ${ACT_KB}KB (gzip 기준)`)

if (gzKB >= ACT_KB) {
  console.error(`\n🔴 착수 임계 초과 (${gzKB.toFixed(0)}KB ≥ ${ACT_KB}KB)`)
  console.error('   증분 동기화 → 화면별 서버 쿼리 순서로 전환할 때다.')
  process.exit(1)
}
if (gzKB >= WARN_KB) {
  console.error(`\n🟠 경고 임계 초과 (${gzKB.toFixed(0)}KB ≥ ${WARN_KB}KB)`)
  console.error('   증분 동기화(IndexedDB + syncedAt 이후 변경분만) 준비를 시작할 것.')
  console.error('   당장 급하진 않지만 여기서 더 두면 리팩터를 쫓기며 하게 된다.')
  process.exit(1)
}
console.log('\n🟢 여유 있음.')
