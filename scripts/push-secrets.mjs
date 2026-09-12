/**
 * 활동 알림 Edge Function 시크릿 4개를 한 번에 올린다.
 *
 *   node --env-file=.env scripts/push-secrets.mjs <PUSH_HOOK_SECRET>
 *
 * 값은 전부 로컬 .env 에서 읽는다 — 파일로 떨구지 않고 CLI 인자로 바로 넘긴다.
 * PUSH_HOOK_SECRET 은 SQL 웹훅(migration_push_webhook.sql)의 X-Hook-Secret 과 같은 값이어야 한다.
 * 자세한 맥락은 supabase/README-push.md.
 */
import { spawnSync } from 'child_process'

const PROJECT_REF = 'ggswwptjbwvesjkowwsc'
const hook = process.argv[2]
if (!hook) { console.error('사용법: node --env-file=.env scripts/push-secrets.mjs <PUSH_HOOK_SECRET>'); process.exit(1) }

const pairs = {
  SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_PUBLIC_KEY: process.env.VITE_VAPID_PUBLIC_KEY,
  PUSH_HOOK_SECRET: hook,
}
const missing = Object.entries(pairs).filter(([, v]) => !v).map(([k]) => k)
if (missing.length) { console.error('.env 에 없는 값:', missing.join(', ')); process.exit(1) }

const args = ['supabase', 'secrets', 'set', '--project-ref', PROJECT_REF,
  ...Object.entries(pairs).map(([k, v]) => `${k}=${v}`)]
const r = spawnSync('npx', args, { stdio: 'inherit', shell: true })
process.exit(r.status ?? 1)
