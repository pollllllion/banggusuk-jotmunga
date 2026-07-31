/**
 * 중복 작품 탐지·병합
 *
 *   npm run dedupe            # 탐지만 (읽기 전용 리포트)
 *   npm run dedupe -- --apply # 실제 병합 (백업 JSON 남김)
 *
 * 왜 RPC(merge_content)를 안 쓰나: 그 함수는 is_admin() = auth.uid() 기준이라
 * 로그인 세션이 필요하다. 스크립트는 세션이 없으므로 SUPABASE_SERVICE_KEY 로
 * 같은 절차(참조 이전 → 원본 삭제 → 재집계)를 그대로 재현한다. 절차가 바뀌면
 * supabase/migration_merge_content.sql 과 함께 고칠 것.
 *
 * 판정 원칙: "제목이 같다"만으로는 병합하지 않는다. 동명이작(예: '기프트' —
 * 야구 코치물 vs 휠체어 럭비물)이 실제로 존재하므로, 같은 작품이라는 근거가
 * 있을 때만 자동 병합하고 애매하면 '확인 필요'로 빼서 사람에게 넘긴다.
 */
import fs from 'fs'
import path from 'path'
import { planMerges } from './dedupe-lib.mjs'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
const APPLY = process.argv.includes('--apply')

if (!url || !key) {
  console.error('VITE_SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다 (.env).')
  process.exit(1)
}
const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }

const req = async (p, init = {}) => {
  const r = await fetch(url + '/rest/v1/' + p, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const txt = await r.text()
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${p} → ${r.status} ${txt}`)
  return txt ? JSON.parse(txt) : null
}

const selectAll = async (table, select = '*') => {
  const out = []
  for (let from = 0; ; from += 1000) {
    // order=id 필수 — 정렬 없는 offset 페이징은 같은 행을 두 번 주거나 빼먹는다
    const rows = await req(`${table}?select=${select}&order=id&limit=1000&offset=${from}`)
    if (!rows.length) break
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// ── 탐지 ────────────────────────────────────────────────────
const contents = await selectAll('contents')
const { plan, review, dupGroups } = planMerges(contents)

console.log(`작품 ${contents.length}개 · 중복 후보 그룹 ${dupGroups}개`)
if (!plan.length) console.log('자동 병합할 중복 없음.')
for (const m of plan) console.log(`  병합: ${m.from} → ${m.into}  (${m.label} — ${m.why})`)
for (const r of review) console.log(`  ⚠ 확인 필요(동명이작 가능): ${r.title} [${r.type}] — ${r.ids.join(' / ')}`)

if (!plan.length || !APPLY) {
  if (plan.length) console.log('\n실제로 합치려면: npm run dedupe -- --apply')
  process.exit(0)
}

// ── 병합 ────────────────────────────────────────────────────
const ids = [...new Set(plan.flatMap(m => [m.from, m.into]))]
const inList = `(${ids.join(',')})`
const refs = {
  reviews: await req(`reviews?select=*&contentId=in.${inList}`),
  watched: await req(`watched?select=*&contentId=in.${inList}`),
  bookmarks: await req(`bookmarks?select=*&contentId=in.${inList}`),
  discussions: await req(`discussions?select=*&contentId=in.${inList}`),
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = path.join('scripts', `merge-backup-${stamp}.json`)
fs.writeFileSync(backupPath, JSON.stringify({
  at: stamp, plan, contents: contents.filter(c => ids.includes(c.id)), ...refs,
}, null, 1), 'utf8')
console.log(`\n백업: ${backupPath}`)

for (const { from, into, label } of plan) {
  // watched/bookmarks 는 PK(userId,contentId) — 대상에 이미 있는 유저는 원본 링크를 지우고 나머지만 옮긴다
  for (const t of ['watched', 'bookmarks']) {
    const mine = refs[t].filter(r => r.contentId === from)
    const theirs = new Set(refs[t].filter(r => r.contentId === into).map(r => r.userId))
    for (const r of mine.filter(r => theirs.has(r.userId))) {
      await req(`${t}?contentId=eq.${from}&userId=eq.${r.userId}`, { method: 'DELETE' })
    }
    if (mine.some(r => !theirs.has(r.userId))) {
      await req(`${t}?contentId=eq.${from}`, { method: 'PATCH', body: JSON.stringify({ contentId: into }) })
    }
  }
  for (const t of ['reviews', 'discussions']) {
    if (refs[t].some(r => r.contentId === from)) {
      await req(`${t}?contentId=eq.${from}`, { method: 'PATCH', body: JSON.stringify({ contentId: into }) })
    }
  }
  await req(`contents?id=eq.${from}`, { method: 'DELETE' })

  const rs = await req(`reviews?select=rating&contentId=eq.${into}`)
  const avg = rs.length ? Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10 : 0
  await req(`contents?id=eq.${into}`, { method: 'PATCH', body: JSON.stringify({ avgRating: avg, reviewCount: rs.length }) })
  console.log(`  ✔ ${label}: ${from} → ${into} (평점 ${avg} / 리뷰 ${rs.length})`)
}
console.log('\n병합 완료. 다음 배포 빌드에서 sitemap·프리렌더가 갱신됩니다.')
