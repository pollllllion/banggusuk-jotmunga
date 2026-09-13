/**
 * "끝" 릴리스 점검의 판정 로직 (순수 함수) — scripts/release-check.mjs 가 git diff·빌드 로그를 넘겨 부른다.
 *
 * 왜 (2026-09-14):
 *   "끝" 때 타입체크·테스트·빌드만 돌리고 아키텍처 점검을 건너뛴 채 푸시한 적이 있다.
 *   사람(Claude)의 기억에 맡기면 빠진다 → 기계로 잡을 수 있는 건 여기서 잡고,
 *   판단이 필요한 건 'review' 로 올려 **반드시 눈으로 보게** 한다.
 *
 * 결과 status:
 *   pass    ✅ 기계적으로 확인 끝
 *   review  ⚠️ 사람이 diff 를 읽고 판정해야 함 (보고에 무엇을 봤는지 적을 것)
 *   fail    ❌ 푸시 금지
 */

/** git diff --unified=0 출력 → [{ file, isNew, isDeleted, added: [{ line, text }], removed: [text] }] */
export function parseDiff(text) {
  const files = []
  let cur = null
  let inHunk = false
  let newLine = 0
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('diff --git ')) {
      const m = line.match(/ b\/(.+)$/)
      cur = { file: m ? m[1] : '', isNew: false, isDeleted: false, added: [], removed: [] }
      files.push(cur)
      inHunk = false
      continue
    }
    if (!cur) continue
    if (!inHunk) {
      // 헤더 구간. 헝크 안에서는 "--- " 로 시작하는 줄이 SQL 주석 삭제("-- ...")일 수 있어 여기서만 거른다
      if (line.startsWith('new file mode')) cur.isNew = true
      else if (line.startsWith('deleted file mode')) cur.isDeleted = true
    }
    const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (h) { inHunk = true; newLine = Number(h[1]); continue }
    if (!inHunk) continue
    if (line.startsWith('+')) { cur.added.push({ line: newLine, text: line.slice(1) }); newLine++ }
    else if (line.startsWith('-')) cur.removed.push(line.slice(1))
  }
  return files
}

const pass = (...detail) => ({ status: 'pass', detail })
const isComment = t => /^\s*(\/\/|\*|\/\*|--)/.test(t)
const at = (f, a) => `${f.file}:${a.line}  ${a.text.trim().slice(0, 140)}`

// ── 1·2. 빌드 산출물 ───────────────────────────────────────────

/** 빌드 로그에서 사이트맵·프리렌더 건수. 0건이거나 못 찾으면 DB 조회 실패 → fail */
export function checkBuildOutput(log) {
  const num = re => { const m = String(log).match(re); return m ? Number(m[1]) : null }
  const sitemap = num(/\[sitemap\]\s*(\d+)개 URL/)
  const sitemapWorks = num(/\[sitemap\]\s*작품\s*(\d+)/)
  const prerender = num(/\[prerender\]\s*(\d+)개 정적 페이지/)
  const prerenderWorks = num(/\[prerender\]\s*작품\s*(\d+)/)
  const line = `사이트맵 ${sitemap ?? '?'}개(작품 ${sitemapWorks ?? '?'}) · 프리렌더 ${prerender ?? '?'}개(작품 ${prerenderWorks ?? '?'})`
  if (!sitemap || !prerender || !sitemapWorks || !prerenderWorks) {
    return { status: 'fail', detail: [line, '건수가 0 이거나 로그에 없음 → DB 조회 실패 의심. 푸시 전 원인 확인'] }
  }
  const warns = String(log).split('\n').filter(l => /\[(sitemap|prerender)\].*(경고|실패|warn|error)/i.test(l))
  return warns.length ? { status: 'review', detail: [line, ...warns.map(w => w.trim())] } : pass(line)
}

// ── 3. 기능 손실 ───────────────────────────────────────────────

const EXPORT_RE = /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/

/**
 * 사라진 export·라우트·파일을 모으고, 변경량 큰 파일 순으로 나열한다.
 * 이름이 같게 다시 export 되면(시그니처 변경) 사라진 걸로 치지 않는다.
 * 항상 review — 기능이 빠졌는지는 diff 를 읽어야 안다. 목록은 "어디부터 읽을지" 다.
 */
export function checkFeatureLoss(files) {
  const readded = new Set()
  for (const f of files) for (const a of f.added) { const m = a.text.match(EXPORT_RE); if (m) readded.add(m[1]) }
  const lostExports = []
  const lostRoutes = []
  for (const f of files) {
    for (const r of f.removed) {
      const m = r.match(EXPORT_RE)
      if (m && !readded.has(m[1])) lostExports.push(`${f.file}  export ${m[1]}`)
      if (/^src\/App\.tsx$/.test(f.file) && /<Route\b/.test(r)) {
        const path = (r.match(/path=["'{]([^"'}]+)/) || [])[1]
        if (!f.added.some(a => path && a.text.includes(path))) lostRoutes.push(`라우트 ${path || r.trim()}`)
      }
    }
  }
  const deleted = files.filter(f => f.isDeleted).map(f => `삭제된 파일 ${f.file}`)
  const top = [...files]
    .map(f => ({ f: f.file, n: f.added.length + f.removed.length, a: f.added.length, r: f.removed.length }))
    .sort((x, y) => y.n - x.n)
    .slice(0, 8)
    .map(x => `변경 +${x.a} -${x.r}  ${x.f}`)
  const flagged = [...lostExports, ...lostRoutes, ...deleted]
  return {
    status: 'review',
    detail: [
      ...(flagged.length ? flagged : ['사라진 export·라우트·파일 없음']),
      '아래 파일 diff 를 위에서부터 읽을 것 (이번 세션에 쓴 코드여도):',
      ...top,
    ],
  }
}

// ── 4-1. 데이터 접근은 dataService 한 겹 ───────────────────────

/** supabase 를 직접 불러도 되는 곳. talkMedia 는 캐시 대상이 아닌 Storage 업로드라 허용(CLAUDE 메모리) */
export const DB_ALLOWED = [/^src\/api\//, /^src\/lib\//, /^src\/utils\/talkMedia\.ts$/]

export function checkDataLayer(files) {
  const fail = []
  const review = []
  for (const f of files) {
    if (!/^src\/.+\.(ts|tsx|js|mjs)$/.test(f.file) || /__tests__\//.test(f.file)) continue
    if (DB_ALLOWED.some(r => r.test(f.file))) continue
    for (const a of f.added) {
      if (isComment(a.text)) continue
      if (/\bsupabase\s*\.\s*(from|rpc|storage|channel|functions)\b/.test(a.text)) fail.push(at(f, a))
      else if (/@\/lib\/supabaseClient|\bsupabase\s*\.\s*auth\b/.test(a.text)) review.push(at(f, a))
    }
  }
  if (fail.length) return { status: 'fail', detail: ['페이지·컴포넌트에서 supabase 직접 호출 → dataService(src/api) 로 옮길 것', ...fail, ...review] }
  if (review.length) return { status: 'review', detail: ['supabase import/auth 추가 — 인증 화면 외라면 dataService 로', ...review] }
  return pass('src/api·src/lib 밖에서 새로 추가된 supabase 직접 호출 없음')
}

// ── 4-2. 시작 로드(loadAll)에 무거운 컬럼 금지 ─────────────────

/**
 * @param payload { status: 'ok'|'over'|'error', summary }  — npm run payload 결과
 */
export function checkStartupLoad(files, payload) {
  const touched = files.filter(f => /^src\/api\/(contentColumns|cache)\.ts$/.test(f.file))
  const detail = [`npm run payload: ${payload?.summary || '결과 없음'}`]
  if (payload?.status === 'over') return { status: 'fail', detail: [...detail, '시작 로드 임계 초과'] }
  const lines = touched.flatMap(f => f.added.filter(a => !isComment(a.text)).slice(0, 12).map(a => at(f, a)))
  if (touched.length) return { status: 'review', detail: [...detail, '시작 로드 컬럼·캐시 코드가 바뀜 — 큰 값(base64·긴 본문·배열)이 실리지 않는지 확인', ...lines] }
  if (payload?.status !== 'ok') return { status: 'review', detail: [...detail, '용량 측정 실패(네트워크?) — 직접 npm run payload'] }
  return pass(...detail, 'contentColumns.ts·cache.ts 변경 없음')
}

// ── 4-3. RLS 우회 금지 ─────────────────────────────────────────

const sqlFiles = files => files.filter(f => /\.sql$/i.test(f.file))

export function checkRls(files) {
  const fail = []
  const review = []
  for (const f of sqlFiles(files)) {
    const body = f.added.map(a => a.text).join('\n')
    // 함수 단위로 잘라 security definer 인데 search_path 고정이 없는 것을 찾는다(스키마 하이재킹)
    for (const chunk of body.split(/(?=create\s+(?:or\s+replace\s+)?function)/i)) {
      if (!/create\s+(?:or\s+replace\s+)?function/i.test(chunk)) continue
      const name = (chunk.match(/function\s+([\w.]+)/i) || [])[1]
      if (/security\s+definer/i.test(chunk) && !/set\s+search_path/i.test(chunk)) fail.push(`${f.file}  ${name}: security definer 인데 set search_path 없음`)
      else if (/security\s+definer/i.test(chunk)) review.push(`${f.file}  ${name}: security definer — 입력 검증(id 형식·소유자·비번)이 우회 경로가 되지 않는지`)
    }
    for (const a of f.added) {
      if (isComment(a.text)) continue
      if (/disable\s+row\s+level\s+security/i.test(a.text)) fail.push(at(f, a))
      if (/(using|with\s+check)\s*\(\s*true\s*\)/i.test(a.text)) review.push(`${at(f, a)}  ← 전체 공개 정책(setup.sql public_all 함정). select 전용인지`)
      if (/\bgrant\b.*\bto\b.*\banon\b/i.test(a.text)) review.push(`${at(f, a)}  ← 비로그인 실행 허용`)
    }
  }
  for (const f of files) {
    if (!/^src\//.test(f.file)) continue
    for (const a of f.added) {
      if (!isComment(a.text) && /passwordHash|password_hash/.test(a.text)) review.push(`${at(f, a)}  ← 유동닉 비번은 RPC 에서만 검증`)
    }
  }
  if (fail.length) return { status: 'fail', detail: [...fail, ...review] }
  if (review.length) return { status: 'review', detail: review }
  return pass(sqlFiles(files).length ? 'SQL 변경 있으나 위험 패턴 없음' : 'SQL·비번 관련 변경 없음')
}

// ── 4-4. 프리렌더가 읽는 필드 형식 유지 ────────────────────────

export function checkPrerenderFields(files) {
  const fail = []
  const review = []
  for (const f of sqlFiles(files)) {
    for (const a of f.added) {
      if (!isComment(a.text) && /(drop\s+column|rename\s+column|alter\s+column\s+\S+\s+(set\s+data\s+)?type)/i.test(a.text)) {
        fail.push(`${at(f, a)}  ← scripts/*.mjs 가 DB 를 직접 읽는다. 컬럼 삭제·이름·타입 변경은 프리렌더를 깬다`)
      }
    }
  }
  const touched = files.filter(f => /^scripts\/(prerender|generate-sitemap)\.mjs$|^src\/shared\//.test(f.file))
  for (const f of touched) review.push(`프리렌더 공용 코드 변경  ${f.file} (+${f.added.length} -${f.removed.length})`)
  const types = files.find(f => f.file === 'src/types/index.ts')
  if (types?.removed.some(r => /^\s+\w+\??:/.test(r))) review.push('src/types/index.ts 에서 필드 줄이 빠짐 — 이름을 바꿨다면 프리렌더 스크립트도 확인')
  const appSeo = files.some(f => /^src\/utils\/seo\.ts$|^src\/components\/seo\//.test(f.file))
  const sharedSeo = files.some(f => /^src\/shared\/\w*Seo\.mjs$/.test(f.file))
  if (appSeo !== sharedSeo) review.push(`SEO 메타가 한쪽만 바뀜 (앱 ${appSeo ? 'O' : 'X'} · src/shared ${sharedSeo ? 'O' : 'X'}) — 앱과 프리렌더가 갈리지 않았는지`)
  if (fail.length) return { status: 'fail', detail: [...fail, ...review] }
  if (review.length) return { status: 'review', detail: review }
  return pass('scripts/prerender·sitemap, src/shared, SEO, 컬럼 변경 없음')
}

// ── 4-5. 마이그레이션은 SQL Editor 수동 적용 ───────────────────

/**
 * `npm run migrate:status` 출력 → Map(파일명 → 'applied' | 'pending' | 'changed')
 * 원장(applied_migrations)은 옛 파일 기록이 비어 있어 전체 exit code 는 늘 1 이다 → 이번에 바뀐 파일만 본다.
 */
export function parseMigrateStatus(text) {
  const map = new Map()
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*([✓✗~])\s.*?(\S+\.sql)/)
    if (m) map.set(m[2], m[1] === '✓' ? 'applied' : m[1] === '✗' ? 'pending' : 'changed')
  }
  return map
}

/**
 * @param ledger parseMigrateStatus 결과. null 이면 조회 실패(서비스 키 없음 등)
 * 적용 기록이 없거나 적용 후 내용이 바뀐 SQL 은 fail — 그 SQL 에 기대는 코드가 먼저 배포되면 운영이 깨진다.
 * 이미 적용했는데 기록만 빠진 거면 `npm run migrate:mark <파일>` 로 기록하면 풀린다(원장도 정확해진다).
 */
export function checkMigrations(files, ledger) {
  const sql = sqlFiles(files).filter(f => !f.isDeleted && /^supabase\//.test(f.file))
  if (!sql.length) return pass('SQL 변경 없음')
  const detail = []
  let bad = false
  for (const f of sql) {
    const name = f.file.split('/').pop()
    const state = ledger?.get(name)
    if (!ledger) detail.push(`${f.file} — migrate:status 조회 실패. 운영 DB 적용 여부를 직접 확인`)
    else if (state === 'applied') detail.push(`✓ 적용 기록 있음  ${f.file}`)
    else {
      bad = true
      detail.push(state === 'changed'
        ? `~ 적용 후 내용이 바뀜  ${f.file} — SQL Editor 에 다시 적용 → npm run migrate:mark ${name}`
        : `✗ 적용 기록 없음  ${f.file} — SQL Editor 에 적용(또는 적용 확인) → npm run migrate:mark ${name}`)
    }
  }
  const cols = sql.flatMap(f => f.added.filter(a => /add\s+column/i.test(a.text)).map(a => at(f, a)))
  if (cols.length) detail.push('새 컬럼 — 적용 전에도 앱이 죽지 않게 옵셔널로 다루는지:', ...cols)
  if (bad) return { status: 'fail', detail }
  return { status: !ledger || cols.length ? 'review' : 'pass', detail }
}

// ── 출력 ───────────────────────────────────────────────────────

export const ICON = { pass: '✅', review: '⚠️', fail: '❌' }

/** rows: [{ step, item, how, status, detail }] → 마크다운 표 + 상세 */
export function formatReport(rows, { base, fileCount }) {
  const out = []
  out.push(`## "끝" 점검 결과  (기준 커밋 ${String(base).slice(0, 7)} 이후 · 변경 파일 ${fileCount}개)`, '')
  out.push('| 단계 | 항목 | 확인 방법 | 결과 |', '|---|---|---|---|')
  for (const r of rows) out.push(`| ${r.step} | ${r.item} | ${r.how} | ${ICON[r.status]} |`)
  out.push('')
  for (const r of rows) {
    if (!r.detail?.length) continue
    out.push(`### ${ICON[r.status]} ${r.step} · ${r.item}`)
    for (const d of r.detail) out.push(`- ${d}`)
    out.push('')
  }
  const count = s => rows.filter(r => r.status === s).length
  out.push(`합계: ❌ ${count('fail')} · ⚠️ ${count('review')} · ✅ ${count('pass')}`)
  out.push(count('fail')
    ? '→ ❌ 가 있어 푸시 금지. 고치고 다시 실행.'
    : '→ ⚠️ 항목은 diff 를 직접 읽고 판정한 내용을 보고에 적은 뒤 커밋·푸시.')
  return out.join('\n')
}
