/**
 * 짤 고아 파일 청소 — 어느 글에도 안 붙어 있는 업로드본 삭제
 *
 * 저장소 두 곳을 다 본다 (2026-09-22~ 새 업로드는 R2):
 *   Supabase 'talk-media' 버킷 · Cloudflare R2 'ottcal-media'(worker/ 관리 API, MEDIA_ADMIN_TOKEN 필요)
 *
 *   npm run clean:media          # 대상만 출력 (기본은 건드리지 않는다)
 *   npm run clean:media -- --apply
 *   GRACE_HOURS=48 npm run clean:media
 *
 * 왜 필요한가 (2026-08-17):
 *   토론방은 유동닉도 짤을 올릴 수 있다(디시 갤러리 방식). 그런데 짤을 올려두고
 *   글을 안 쓰고 나가면 파일만 버킷에 남는다. anon 은 삭제 권한이 없으므로
 *   (남의 짤 지우기 방지) 그 고아 파일은 영원히 쌓인다.
 *   실측: 버킷 9개 19.92MB 중 실제로 글에 붙어 있는 건 1개뿐이었다.
 *   업로드 한도를 낮추는 것보다 이 청소가 스토리지 대책으로 훨씬 효과가 크다.
 *
 * 판정: 아래 어디에도 파일명이 안 나오면 고아.
 *   discussions.images / discussions.bodyHtml / discussions.body
 *   discussion_comments.body / reviews.body / comments.body
 *   profiles.avatarUrl
 *   (본문 HTML 에 <img src> 로 박히는 경우가 있어 컬럼만 보면 안 된다)
 *
 * ⚠️ 이 버킷을 쓰는 곳이 늘면 **반드시 referencedNames() 에 추가한다.**
 *   글에 안 붙었다는 이유로 지워지기 때문이다. 실제로 프로필 사진이 그렇게 날아갔다
 *   (2026-09-16): 아바타는 profiles 에 붙어 있는데 여기서는 글만 보고 있었고,
 *   업로드 24시간이 지난 아바타가 고아로 잡혀 삭제됐다.
 *
 * 안전장치: 올라온 지 GRACE_HOURS(기본 24)시간이 안 된 파일은 건드리지 않는다.
 *   — 글 쓰는 중에 올린 짤을 지워버리면 안 되므로.
 */
import { extractMediaRefs } from './media-refs.mjs'

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
const APPLY = process.argv.includes('--apply')
const GRACE_HOURS = Math.max(1, parseInt(process.env.GRACE_HOURS || '24', 10))
const BUCKET = 'talk-media'
// R2(worker 관리 API) — 토큰이 없으면 R2 쪽은 건너뛴다 (Supabase 쪽만 예전처럼 청소)
const MEDIA_BASE = process.env.MEDIA_BASE || 'https://ottcal.com'
const MEDIA_TOKEN = process.env.MEDIA_ADMIN_TOKEN

if (!url || !key) {
  console.error('VITE_SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다 (.env).')
  process.exit(1)
}
const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }
const mb = b => (b / 1024 / 1024).toFixed(2)

/** 버킷 전체 파일 목록 (폴더 한 겹까지 내려간다 — 실제 구조는 talk/<uuid>.<ext>) */
async function listAll(prefix = '') {
  const out = []
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (!res.ok) throw new Error(`목록 조회 실패 ${res.status} ${await res.text()}`)
    const items = await res.json()
    if (!items.length) break
    for (const it of items) {
      // id 가 null 이면 폴더다 (Supabase Storage 는 폴더를 가상으로 만든다)
      if (it.id === null) out.push(...await listAll(prefix ? `${prefix}/${it.name}` : it.name))
      else out.push({ path: prefix ? `${prefix}/${it.name}` : it.name, size: it.metadata?.size || 0, createdAt: it.created_at })
    }
    if (items.length < 100) break
  }
  return out
}

/** 글·댓글 본문 + 프로필에서 참조 중인 talk-media 파일명 모으기 */
async function referencedNames() {
  const get = async path => {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: H })
    if (!res.ok) throw new Error(`${path} 조회 실패 ${res.status}`)
    return res.json()
  }
  const blobs = []
  for (const row of await get('discussions?select=images,bodyHtml,body')) {
    blobs.push((row.images || []).join(' '), row.bodyHtml || '', row.body || '')
  }
  // 댓글도 글과 똑같이 bodyHtml 안에 <img> 로 짤을 품는다 (migration_comment_media).
  // 이 줄에서 bodyHtml 을 빼면 댓글 짤이 전부 고아로 잡혀 24시간 뒤 지워진다.
  for (const row of await get('discussion_comments?select=body,bodyHtml')) {
    blobs.push(row.body || '', row.bodyHtml || '')
  }
  for (const row of await get('reviews?select=body')) blobs.push(row.body || '')
  // 리뷰 댓글은 본문 컬럼 이름이 content 다 (discussion_comments 와 다르다)
  for (const row of await get('comments?select=content')) blobs.push(row.content || '')
  // 프로필 사진은 글이 아니라 profiles 에 붙어 있다 — 여기를 빼면 아바타가 고아로 잡힌다
  for (const row of await get('profiles?select=avatarUrl')) blobs.push(row.avatarUrl || '')

  // 주소 형태가 바뀌어도 견디도록 "talk-media/ 뒤쪽 경로"(Supabase)·"/media/ 뒤쪽 키"(R2)만 뽑는다
  return extractMediaRefs(blobs)
}

/** R2 전체 목록 — worker 의 관리 API 를 거친다 (R2 에 직접 붙는 키를 따로 두지 않으려고) */
async function listR2() {
  const out = []
  for (let cursor = null; ;) {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    const res = await fetch(`${MEDIA_BASE}/api/media-admin/list${qs}`, { headers: { Authorization: `Bearer ${MEDIA_TOKEN}` } })
    if (!res.ok) throw new Error(`R2 목록 조회 실패 ${res.status} ${(await res.text()).slice(0, 200)}`)
    const page = await res.json()
    for (const o of page.objects) out.push({ path: o.key, size: o.size, createdAt: o.uploaded })
    if (!page.cursor) break
    cursor = page.cursor
  }
  return out
}

async function deleteSupabase(paths) {
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: paths }),
  })
  if (!res.ok) throw new Error(`삭제 실패 ${res.status} ${(await res.text()).slice(0, 200)}`)
}

async function deleteR2(keys) {
  const res = await fetch(`${MEDIA_BASE}/api/media-admin/delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MEDIA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  })
  if (!res.ok) throw new Error(`R2 삭제 실패 ${res.status} ${(await res.text()).slice(0, 200)}`)
}

const used = await referencedNames()
const cutoff = Date.now() - GRACE_HOURS * 3600 * 1000

// 저장소마다 [이름, 파일 목록, 참조 집합, 삭제 함수]. R2 는 토큰이 있을 때만 본다
const stores = [['Supabase talk-media', await listAll(), used.supabase, deleteSupabase]]
if (MEDIA_TOKEN) stores.push(['R2 ottcal-media', await listR2(), used.r2, deleteR2])
else console.log('MEDIA_ADMIN_TOKEN 이 없어 R2 는 건너뜁니다.\n')

let failed = false
for (const [name, files, refs, remove] of stores) {
  const orphans = files.filter(f => !refs.has(f.path) && new Date(f.createdAt).getTime() < cutoff)
  const young = files.filter(f => !refs.has(f.path) && new Date(f.createdAt).getTime() >= cutoff)
  const total = files.reduce((s, f) => s + f.size, 0)
  const freed = orphans.reduce((s, f) => s + f.size, 0)

  console.log(`[${name}] ${files.length}개 ${mb(total)}MB / 사용중 ${files.length - orphans.length - young.length}개`)
  console.log(`고아 ${orphans.length}개 ${mb(freed)}MB${young.length ? ` (유예중 ${young.length}개는 보존)` : ''}`)
  for (const f of orphans) console.log(`  - ${f.path} ${mb(f.size)}MB ${f.createdAt}`)

  if (!orphans.length) { console.log('지울 것 없음.\n'); continue }
  if (!APPLY) { console.log('--apply 를 붙이면 실제로 삭제합니다.\n'); continue }

  // 한 번에 너무 많이 보내지 않도록 100개씩
  try {
    for (let i = 0; i < orphans.length; i += 100) await remove(orphans.slice(i, i + 100).map(f => f.path))
    console.log(`삭제 완료: ${orphans.length}개 ${mb(freed)}MB 회수\n`)
  } catch (e) {
    console.error(String(e.message || e))
    failed = true
  }
}
if (failed) process.exit(1)
