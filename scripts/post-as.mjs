/**
 * 페르소나 계정으로 토론글·댓글 게시 (큐 파일 방식)
 *
 *   npm run post            # scripts/queue.json 을 읽어 아직 안 올린 항목만 게시
 *   npm run post -- --dry   # 실제 게시 없이 검증만 (작품 매칭·중복 확인)
 *
 * 큐 항목 형식 (scripts/queue.example.json 참고):
 *   글   { "as": "popcorn", "content": "머더클럽", "title": "...", "body": "...", "rating": 7, "spoiler": false, "minutesAgo": 90 }
 *   댓글 { "as": "binge",   "replyTo": "머더클럽",  "body": "..." }   ← replyTo 는 원글 제목 일부 또는 글 id
 *
 * 규칙(자동 검사):
 *   - content 는 작품 제목 일부 또는 작품 id. 여러 개가 걸리면 게시하지 않고 후보를 보여준다.
 *   - 댓글 작성자는 원글 작성자와 같을 수 없다 (자기 글에 자기가 댓글).
 *   - 같은 페르소나가 같은 작품에 이미 별점 글을 썼으면 별점을 빼고 올린다 (1작품 1별점).
 *   - 게시에 성공하면 큐 항목에 postedId 를 적어 되돌려 저장한다 → 재실행해도 중복 게시 없음.
 *
 * 계정은 create-personas.mjs 로 먼저 만들어야 한다 (scripts/personas.local.json 필요).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { personaByKey } from './personas.mjs'

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SVC = process.env.SUPABASE_SERVICE_KEY
const DRY = process.argv.includes('--dry')
if (!URL || !ANON || !SVC) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY 가 필요합니다 (.env).')
  process.exit(1)
}
const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }
const userH = jwt => ({ apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' })

const __dirname = dirname(fileURLToPath(import.meta.url))
const QUEUE = resolve(__dirname, 'queue.json')
const STORE = resolve(__dirname, 'personas.local.json')

if (!existsSync(QUEUE)) {
  console.error('scripts/queue.json 이 없습니다. scripts/queue.example.json 을 복사해서 만드세요.')
  process.exit(1)
}
if (!existsSync(STORE)) {
  console.error('scripts/personas.local.json 이 없습니다. 먼저 npm run personas:create 를 실행하세요.')
  process.exit(1)
}

const queue = JSON.parse(readFileSync(QUEUE, 'utf8'))
const accounts = JSON.parse(readFileSync(STORE, 'utf8'))

const get = async path => {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: svcH })
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`)
  return r.json()
}

/** 사람이 읽을 수 있는 id — 화면 목록의 기존 글들과 같은 모양(짧은 랜덤 문자열) */
const newId = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 9)
const isoAgo = min => new Date(Date.now() - (min || 0) * 60_000).toISOString()

const jwtCache = new Map()
async function login(key) {
  if (jwtCache.has(key)) return jwtCache.get(key)
  const acc = accounts[key]
  if (!acc?.password) throw new Error(`'${key}' 의 비밀번호를 모릅니다 (personas.local.json 확인)`)
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: acc.email, password: acc.password }),
  })
  const body = await r.json()
  if (!body.access_token) throw new Error(`'${key}' 로그인 실패: ${JSON.stringify(body).slice(0, 160)}`)
  jwtCache.set(key, body.access_token)
  return body.access_token
}

/**
 * 한 테이블을 끝까지 읽는다.
 * PostgREST 는 한 번에 1000행만 준다 — limit=5000 을 적어도 조용히 1000행에서 잘린다.
 * 작품이 2,000편을 넘은 뒤로는 그냥 두면 뒤쪽 작품이 통째로 "작품을 못 찾음" 이 된다.
 */
const getAll = async (table, select) => {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL}/rest/v1/${table}?select=${select}&order=id.asc`, {
      headers: { ...svcH, Range: `${from}-${from + 999}` },
    })
    if (!r.ok) throw new Error(`GET ${table} → ${r.status} ${(await r.text()).slice(0, 200)}`)
    const rows = await r.json()
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}

const contents = await getAll('contents', 'id,title,type')
const discussions = await getAll('discussions', 'id,contentId,authorId,title,body,rating')

function resolveContent(needle) {
  const byId = contents.find(c => c.id === needle)
  if (byId) return { ok: true, content: byId }
  const q = String(needle).toLowerCase().trim()
  const hits = contents.filter(c => c.title.toLowerCase().includes(q))
  if (hits.length === 1) return { ok: true, content: hits[0] }
  if (!hits.length) return { ok: false, why: `작품을 못 찾음: "${needle}"` }
  return { ok: false, why: `작품이 ${hits.length}개 걸림: ${hits.slice(0, 5).map(h => `${h.title}(${h.id})`).join(' / ')} → 정확한 id 를 쓰세요` }
}

function resolveDiscussion(needle) {
  // "#1" = 이 큐의 1번 항목에 달기 (같은 큐에서 글 → 댓글로 이어 쓸 때. 제목이 겹쳐도 안전)
  const ref = /^#(\d+)$/.exec(String(needle).trim())
  if (ref) {
    const target = queue[Number(ref[1]) - 1]
    if (!target) return { ok: false, why: `큐에 ${needle} 항목이 없음` }
    if (!target.postedId) return { ok: false, why: `${needle} 이(가) 아직 안 올라감 — 글이 앞 순서에 있어야 합니다` }
    const post = discussions.find(d => d.id === target.postedId)
    return post ? { ok: true, post } : { ok: false, why: `${needle} 의 글을 찾을 수 없음 (${target.postedId})` }
  }
  const byId = discussions.find(d => d.id === needle)
  if (byId) return { ok: true, post: byId }
  const q = String(needle).toLowerCase().trim()
  const hits = discussions.filter(d =>
    (d.title || '').toLowerCase().includes(q) ||
    (d.body || '').toLowerCase().includes(q) ||
    (contents.find(c => c.id === d.contentId)?.title || '').toLowerCase().includes(q))
  if (hits.length === 1) return { ok: true, post: hits[0] }
  if (!hits.length) return { ok: false, why: `원글을 못 찾음: "${needle}"` }
  return { ok: false, why: `원글이 ${hits.length}개 걸림: ${hits.slice(0, 5).map(h => `${h.title || h.body?.slice(0, 15)}(${h.id})`).join(' / ')} → 글 id 를 쓰세요` }
}

let posted = 0, skipped = 0, failed = 0

for (const [i, item] of queue.entries()) {
  const label = `#${i + 1}`
  if (item.postedId) { skipped++; continue }

  const persona = personaByKey(item.as)
  const acc = accounts[item.as]
  if (!persona || !acc?.id) { console.error(`${label} ✖ 모르는 페르소나: ${item.as}`); failed++; continue }

  try {
    // ── 댓글 ────────────────────────────────────────────────
    if (item.replyTo) {
      const r = resolveDiscussion(item.replyTo)
      if (!r.ok) { console.error(`${label} ✖ ${r.why}`); failed++; continue }
      if (r.post.authorId && r.post.authorId === acc.id) {
        console.error(`${label} ✖ 자기 글에 자기 댓글 (${persona.nick}) — 다른 페르소나로 바꾸세요`); failed++; continue
      }
      const row = {
        id: newId(), discussionId: r.post.id, authorId: acc.id,
        body: item.body, likes: [], createdAt: isoAgo(item.minutesAgo),
      }
      console.log(`${label} 댓글 · ${persona.nick} → "${(r.post.title || r.post.body || '').slice(0, 20)}"`)
      if (DRY) continue
      const jwt = await login(item.as)
      const res = await fetch(`${URL}/rest/v1/discussion_comments`, { method: 'POST', headers: userH(jwt), body: JSON.stringify(row) })
      if (!res.ok) { console.error(`   ✖ 실패 ${res.status} ${(await res.text()).slice(0, 160)}`); failed++; continue }
      item.postedId = row.id
      posted++
      continue
    }

    // ── 글 ──────────────────────────────────────────────────
    const c = resolveContent(item.content)
    if (!c.ok) { console.error(`${label} ✖ ${c.why}`); failed++; continue }

    let rating = item.rating ?? null
    if (rating != null && discussions.some(d => d.authorId === acc.id && d.contentId === c.content.id && d.rating != null)) {
      console.warn(`${label} ⚠ ${persona.nick} 은(는) "${c.content.title}" 에 이미 별점을 남김 → 별점 없이 게시`)
      rating = null
    }

    const row = {
      id: newId(), contentId: c.content.id, authorId: acc.id,
      title: item.title || null, body: item.body,
      rating, spoiler: !!item.spoiler, likes: [], createdAt: isoAgo(item.minutesAgo),
    }
    console.log(`${label} 글 · ${persona.nick} → ${c.content.title}${rating != null ? ` (★${rating})` : ''}`)
    if (DRY) continue
    const jwt = await login(item.as)
    const res = await fetch(`${URL}/rest/v1/discussions`, { method: 'POST', headers: userH(jwt), body: JSON.stringify(row) })
    if (!res.ok) { console.error(`   ✖ 실패 ${res.status} ${(await res.text()).slice(0, 160)}`); failed++; continue }
    item.postedId = row.id
    discussions.push({ ...row })
    posted++
  } catch (e) {
    console.error(`${label} ✖ ${e.message}`)
    failed++
  }
}

if (!DRY) writeFileSync(QUEUE, JSON.stringify(queue, null, 2), 'utf8')
console.log(`\n${DRY ? '[검증만] ' : ''}게시 ${posted} · 이미 올림 ${skipped} · 실패 ${failed}`)
if (!DRY && posted) console.log('큐에 postedId 를 기록했습니다 — 다시 돌려도 중복 게시되지 않습니다.')
