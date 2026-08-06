/**
 * 시드 페르소나 고정닉 계정 생성 (일회성 · 멱등)
 *
 *   npm run personas:create
 *
 * 하는 일:
 *   1) personas.mjs 의 각 항목마다 Supabase auth 계정 생성 (이메일 인증 완료 상태로)
 *   2) profiles 행 생성/갱신 → 이 계정들이 '고정닉'으로 잡히고 레벨도 쌓인다
 *   3) 이메일·비밀번호를 scripts/personas.local.json 에 저장 (gitignore · 재실행 시 재사용)
 *
 * 이미 있는 계정은 건너뛰고 닉네임만 맞춘다. 비밀번호는 처음 만들 때만 생성한다.
 * SUPABASE_SERVICE_KEY 필요.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PERSONAS, personaEmail } from './personas.mjs'

const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) {
  console.error('VITE_SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다 (.env).')
  process.exit(1)
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORE = resolve(__dirname, 'personas.local.json')

const store = existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : {}
// 특수문자 없이도 충분히 긴 무작위 비밀번호 (사람이 안 외워도 되는 값)
const newPassword = () => `Sd${randomBytes(15).toString('base64url')}1!`

async function findAuthUser(email) {
  const r = await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=1&email=${encodeURIComponent(email)}`, { headers: H })
  if (!r.ok) return null
  const data = await r.json()
  const list = data.users || []
  return list.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null
}

async function main() {
  let created = 0, kept = 0
  for (const p of PERSONAS) {
    const email = personaEmail(p.key)
    const saved = store[p.key]
    let userId = null

    const existing = await findAuthUser(email)
    if (existing) {
      userId = existing.id
      kept++
    } else {
      const password = saved?.password || newPassword()
      const r = await fetch(`${URL}/auth/v1/admin/users`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ email, password, email_confirm: true }),
      })
      const body = await r.json()
      if (!r.ok || !body.id) { console.error(`  ✖ ${p.nick}: 계정 생성 실패 ${r.status} ${JSON.stringify(body).slice(0, 160)}`); continue }
      userId = body.id
      store[p.key] = { email, password, id: userId, nick: p.nick }
      created++
    }

    // profiles upsert — 고정닉 판정과 닉네임 표시의 근거
    const row = {
      id: userId, nickname: p.nick, role: 'user', banned: false,
      createdAt: existing?.created_at || new Date().toISOString(),
    }
    const r2 = await fetch(`${URL}/rest/v1/profiles?on_conflict=id`, {
      method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    })
    if (!r2.ok) console.error(`  ✖ ${p.nick}: profiles 실패 ${r2.status} ${(await r2.text()).slice(0, 160)}`)

    store[p.key] = { ...(store[p.key] || {}), email, id: userId, nick: p.nick }
  }

  writeFileSync(STORE, JSON.stringify(store, null, 2), 'utf8')
  console.log(`페르소나 ${PERSONAS.length}개 — 새로 만듦 ${created} · 이미 있음 ${kept}`)
  console.log(`계정 정보: scripts/personas.local.json (gitignore · 비밀번호 포함)`)
  const missing = PERSONAS.filter(p => !store[p.key]?.password).map(p => p.nick)
  if (missing.length) {
    console.warn(`⚠ 비밀번호를 모르는 계정 ${missing.length}개: ${missing.join(', ')}`)
    console.warn('  (이 PC 밖에서 만든 계정) — post-as 로 글을 쓰려면 Supabase 대시보드에서 비밀번호를 재설정해 넣어주세요.')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
