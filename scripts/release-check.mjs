/**
 * "끝" 릴리스 점검 — CLAUDE.md "끝" 프로토콜의 1~4단계를 한 번에 돌리고 단계별 결과표를 찍는다.
 *
 *   npm run release-check               # 전부 (빌드 포함, 1~2분)
 *   npm run release-check -- --no-build # 빌드·산출물 건수만 건너뜀 (중간 점검용, "끝" 에선 쓰지 말 것)
 *   npm run release-check -- --base <커밋>  # 기준 커밋 지정 (규칙을 과거 변경에 돌려 볼 때)
 *
 * exit 1 = ❌ 가 하나라도 있음 → 푸시 금지.
 * ⚠️ = 기계로는 판정 못 하는 항목. diff 를 읽고 무엇을 확인했는지 보고에 적어야 한다.
 *
 * 비교 범위: origin/main 과의 merge-base 이후 전부 — 아직 안 올린 커밋 + 작업 트리(스테이징 안 된 것·새 파일).
 * 즉 "지금 git add -A → push 하면 운영에 나가는 것" 과 같다.
 * 판정 로직은 release-check-lib.mjs (테스트 있음).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import * as L from './release-check-lib.mjs'

const noBuild = process.argv.includes('--no-build')

function run(cmd) {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  return { code: r.status ?? 1, stdout: r.stdout || '', all: (r.stdout || '') + (r.stderr || '') }
}
const tail = (s, n = 20) => s.trim().split('\n').slice(-n).map(l => l.trimEnd())
const step = msg => process.stderr.write(`▶ ${msg}\n`)

const rows = []
const add = (stepName, item, how, res) => rows.push({ step: stepName, item, how, ...res })

// ── 1. 품질 ──
step('타입체크')
const tsc = run('npm run typecheck')
add('1 품질', '타입체크', '`npm run typecheck`', tsc.code === 0 ? { status: 'pass', detail: [] } : { status: 'fail', detail: tail(tsc.all) })

step('테스트')
const test = run('npm test')
const testLine = (test.all.match(/Tests\s+([^\n]+)/) || [])[1]?.trim()
add('1 품질', '테스트', '`npm test`', test.code === 0 ? { status: 'pass', detail: testLine ? [testLine] : [] } : { status: 'fail', detail: tail(test.all) })

// ── 1·2. 빌드 + 산출물 ──
if (noBuild) {
  add('1 품질', '빌드', '`--no-build` 로 건너뜀', { status: 'review', detail: ['"끝" 에선 빌드까지 돌려야 한다'] })
} else {
  step('빌드 (사이트맵·프리렌더 포함, 1~2분)')
  const build = run('npm run build')
  add('1 품질', '빌드', '`npm run build`', build.code === 0 ? { status: 'pass', detail: [] } : { status: 'fail', detail: tail(build.all) })
  add('2 산출물', '사이트맵·프리렌더 건수', '빌드 로그 파싱', L.checkBuildOutput(build.all))
}

// ── 변경 범위 ──
step('변경 범위 수집 (git)')
run('git fetch -q origin')
// --base <ref> : 기준을 직접 준다(검사 규칙을 과거 커밋에 돌려 보는 용도). 기본은 origin/main 과의 merge-base
const baseArg = process.argv[process.argv.indexOf('--base') + 1]
const base = (process.argv.includes('--base') && baseArg) || run('git merge-base HEAD origin/main').stdout.trim() || 'HEAD'
const files = L.parseDiff(run(`git -c core.quotepath=false diff --unified=0 ${base}`).stdout)
const untracked = run('git -c core.quotepath=false ls-files --others --exclude-standard').stdout
  .split('\n').map(s => s.trim()).filter(Boolean)
for (const file of untracked) {
  let text = ''
  try { text = readFileSync(file, 'utf8') } catch { /* 바이너리 등 */ }
  files.push({
    file, isNew: true, isDeleted: false, removed: [],
    added: text.split('\n').map((t, i) => ({ line: i + 1, text: t.replace(/\r$/, '') })),
  })
}

// ── 3. 기능 손실 ──
add('3 기능 손실', '사라진 export·라우트·파일 + 읽을 diff', 'git diff 분석', L.checkFeatureLoss(files))

// ── 4. 아키텍처 ──
step('시작 로드 용량 (npm run payload)')
const payloadRun = run('npm run payload')
const gz = (payloadRun.all.match(/1단계 합계[^\n]*gzip\s*(\d+)KB/) || [])[1]
const payload = gz
  ? { status: payloadRun.code === 0 ? 'ok' : 'over', summary: `1단계 gzip ${gz}KB` }
  : { status: 'error', summary: '측정 실패' }

add('4 아키텍처', '① 데이터 접근은 dataService 한 겹', '추가된 줄에서 supabase 직접 호출 grep', L.checkDataLayer(files))
add('4 아키텍처', '② 시작 로드에 무거운 컬럼 금지', '`npm run payload` + contentColumns·cache 변경', L.checkStartupLoad(files, payload))
add('4 아키텍처', '③ RLS 우회 금지', 'SQL security definer·정책·grant, 비번 코드', L.checkRls(files))
add('4 아키텍처', '④ 프리렌더가 읽는 필드 유지', '컬럼 삭제·변경, scripts·src/shared·SEO 변경', L.checkPrerenderFields(files))
step('마이그레이션 적용 기록 (npm run migrate:status)')
// 원장에 옛 파일 기록이 비어 있어 exit code 는 늘 1 — 출력에서 이번에 바뀐 파일 줄만 본다
const ledgerRun = run('npm run migrate:status')
const ledger = L.parseMigrateStatus(ledgerRun.all)
add('4 아키텍처', '⑤ 마이그레이션 수동 적용', '바뀐 SQL 파일 × `npm run migrate:status` 적용 기록', L.checkMigrations(files, ledger.size ? ledger : null))

console.log(L.formatReport(rows, { base, fileCount: files.length }))
process.exit(rows.some(r => r.status === 'fail') ? 1 : 0)
