/**
 * 마이그레이션 적용 현황 — supabase/*.sql 파일 vs DB 의 applied_migrations 대조
 *
 *   npm run migrate:status              # 현황 출력
 *   npm run migrate:mark <파일명>       # 방금 SQL Editor 에서 실행한 파일을 적용됨으로 기록
 *   npm run migrate:mark -- --all-hash  # 기록은 있는데 해시가 빈 옛 항목을 현재 내용으로 채움
 *
 * 왜 필요한가 (2026-08-17):
 *   이 프로젝트는 Supabase CLI 를 안 쓰고 SQL Editor 에 손으로 붙여 실행한다.
 *   파일이 30개를 넘으면서 "이거 적용했었나?" 를 알 방법이 없어졌다.
 *   applied_migrations 테이블(migration_ledger_and_ratelimit.sql)에 기록을 남기고
 *   이 스크립트가 파일 목록과 대조해준다.
 *
 * 표시:
 *   ✓ 적용됨        기록이 있고 파일 내용도 그대로
 *   ~ 내용 바뀜     적용 후 파일을 고쳤다 → 다시 실행하고 mark 할 것
 *   ✗ 미적용        SQL Editor 에서 실행하고 mark 할 것
 */
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('VITE_SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다 (.env).')
  process.exit(1)
}
const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }
const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../supabase')

// 롤백 스크립트는 "적용 대상"이 아니다
const SKIP = new Set(['migration_rls_disable.sql'])

const files = readdirSync(DIR).filter(f => f.endsWith('.sql') && !SKIP.has(f)).sort()
const hashOf = f => createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex')

async function rows() {
  const res = await fetch(`${url}/rest/v1/applied_migrations?select=*`, { headers: H })
  if (!res.ok) {
    if (res.status === 404 || (await res.clone().text()).includes('applied_migrations')) {
      console.error('applied_migrations 테이블이 없습니다 — supabase/migration_ledger_and_ratelimit.sql 을 먼저 실행하세요.')
      process.exit(1)
    }
    console.error('조회 실패', res.status, await res.text())
    process.exit(1)
  }
  return res.json()
}

const [, , cmd, arg] = process.argv

if (cmd === 'mark') {
  const applied = await rows()
  if (arg === '--all-hash') {
    // 해시가 비어 있는 기존 기록을 현재 파일 내용으로 채운다(최초 도입용)
    const targets = applied.filter(r => !r.sha256 && files.includes(r.filename))
    for (const r of targets) {
      await fetch(`${url}/rest/v1/applied_migrations?filename=eq.${encodeURIComponent(r.filename)}`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ sha256: hashOf(r.filename) }),
      })
    }
    console.log(`해시 채움: ${targets.length}건`)
    process.exit(0)
  }
  if (!arg) { console.error('파일명을 주세요. 예: npm run migrate:mark migration_rls_fix.sql'); process.exit(1) }
  if (!files.includes(arg)) { console.error(`supabase/${arg} 가 없습니다.`); process.exit(1) }
  const res = await fetch(`${url}/rest/v1/applied_migrations`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ filename: arg, sha256: hashOf(arg), applied_at: new Date().toISOString() }),
  })
  console.log(res.ok ? `기록 완료: ${arg}` : `실패 ${res.status} ${await res.text()}`)
  process.exit(res.ok ? 0 : 1)
}

const applied = new Map((await rows()).map(r => [r.filename, r]))
let pending = 0, changed = 0
for (const f of files) {
  const rec = applied.get(f)
  if (!rec) { console.log(`  ✗ 미적용     ${f}`); pending++; continue }
  if (rec.sha256 && rec.sha256 !== hashOf(f)) { console.log(`  ~ 내용 바뀜  ${f}`); changed++; continue }
  console.log(`  ✓ 적용됨     ${f}${rec.sha256 ? '' : ' (해시 미기록)'}`)
}
const ghosts = [...applied.keys()].filter(f => !files.includes(f))
for (const f of ghosts) console.log(`  ? 파일 없음  ${f} (기록만 있음)`)

console.log(`\n총 ${files.length}개 · 미적용 ${pending} · 내용 바뀜 ${changed}`)
if (pending || changed) {
  console.log('SQL Editor 에서 실행한 뒤 `npm run migrate:mark <파일명>` 으로 기록하세요.')
  process.exit(1)
}
