/**
 * 데이터 계층의 뼈대 — 인메모리 캐시 + write-through 동기화 + 앱 시작 로드.
 *
 * 읽기(getX)는 캐시에서 동기적으로, 쓰기(saveX)는 캐시 갱신 + Supabase 동기화(비동기).
 * 도메인별 함수는 contents/reviews/discussions/social/users.ts 에 있고,
 * 전부 dataService.ts 에서 다시 내보낸다(기존 import 경로 유지).
 */
import { supabase } from '@/lib/supabaseClient'
import { UPCOMING_SEED } from '@/utils/upcomingSeed'
import { CONTENT_LIST_COLS } from './contentColumns'
import { CURATION_LIST_COLS } from './curationColumns'

export type Table =
  | 'users' | 'contents' | 'reviews' | 'comments'
  | 'bookmarks' | 'content_alerts' | 'watched' | 'blocks' | 'notifications' | 'reports' | 'announcements' | 'discussions' | 'discussion_comments' | 'profiles' | 'curations'

const TABLES: Table[] = ['users', 'contents', 'reviews', 'comments', 'bookmarks', 'content_alerts', 'watched', 'blocks', 'notifications', 'reports', 'announcements', 'discussions', 'discussion_comments', 'profiles', 'curations']

export const cache: Record<Table, any[]> = {
  users: [], contents: [], reviews: [], comments: [],
  bookmarks: [], content_alerts: [], watched: [], blocks: [], notifications: [], reports: [], announcements: [], discussions: [], discussion_comments: [], profiles: [], curations: [],
}

/** 테이블별 기본키 컬럼. watched·bookmarks·content_alerts·blocks 는 복합키라 id 컬럼이 아예 없다. */
function pkCols(t: Table): string[] {
  if (t === 'bookmarks' || t === 'content_alerts' || t === 'watched') return ['userId', 'contentId']
  if (t === 'blocks') return ['blockerId', 'blockedId']
  return ['id']
}

function rowKey(t: Table, r: any): string {
  return pkCols(t).map(c => r[c]).join('|')
}

function conflictCols(t: Table): string {
  if (t === 'bookmarks' || t === 'content_alerts') return 'userId,contentId'
  if (t === 'blocks') return 'blockerId,blockedId'
  return 'id'
}

// ── Cache primitives ────────────────────────────────────────
export function load<T>(key: Table): T[] { return cache[key] as T[] }

/** 쓰기 결과. ok=false 면 캐시에는 들어갔지만 서버에는 안 들어갔다는 뜻이다. */
export type PersistResult = { ok: true } | { ok: false; error: string }

/**
 * 서버까지 저장이 가지 못했을 때 던진다. 화면은 이걸 잡아 message 를 그대로 보여준다.
 * detail 에는 원인(RLS 거부·네트워크 등)이 들어 있다 — 사용자에겐 안 보여준다.
 */
export class SaveFailedError extends Error {
  detail: string
  constructor(detail: string) {
    super('저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.')
    this.name = 'SaveFailedError'
    this.detail = detail
  }
}

/**
 * 캐시 갱신 + 서버 동기화.
 *
 * 반환하는 Promise 를 **무시해도 되지만**, 사용자가 만든 콘텐츠(글·댓글)를 쓰는
 * 자리에서는 반드시 await 해서 실패를 화면에 알려야 한다. 안 그러면 저장이 실패해도
 * "올렸어요!" 가 뜨고, 사용자는 새로고침하고 나서야 글이 없어진 걸 안다.
 */
export function store(key: Table, val: any[]): Promise<PersistResult> {
  const prev = cache[key] || []
  cache[key] = val
  return persist(key, prev, val)
}

/**
 * ⚠️ supabase-js 는 RLS 거부·제약 위반을 **throw 하지 않고** { error } 로 돌려준다.
 *    예전엔 그 error 를 아무도 안 봐서 try/catch 가 네트워크 예외만 잡았고,
 *    권한 문제로 글이 안 써져도 조용히 성공한 척했다. 이제 매 호출의 error 를 본다.
 */
async function persist(t: Table, prev: any[], next: any[]): Promise<PersistResult> {
  try {
    const prevByKey = new Map(prev.map(r => [rowKey(t, r), r]))
    const nextKeys = new Set(next.map(r => rowKey(t, r)))
    // 삭제된 행
    const removed = prev.filter(r => !nextKeys.has(rowKey(t, r)))
    for (const r of removed) {
      const del = supabase.from(t).delete()
      const q = (t === 'bookmarks' || t === 'content_alerts') ? del.eq('userId', r.userId).eq('contentId', r.contentId)
        : t === 'blocks' ? del.eq('blockerId', r.blockerId).eq('blockedId', r.blockedId)
        : del.eq('id', r.id)
      const { error } = await q
      if (error) return fail(t, 'delete', error.message)
    }
    // 새로/바뀐 행만 upsert (RLS: 남의 행 통짜 upsert 방지 — 본인이 바꾼 것만 씀)
    const changed = next.filter(r => {
      const p = prevByKey.get(rowKey(t, r))
      return !p || JSON.stringify(p) !== JSON.stringify(r)
    })
    if (changed.length) {
      const rows = t === 'users' ? changed.map(({ password, ...u }: any) => u) : changed
      const { error } = await supabase.from(t).upsert(rows, { onConflict: conflictCols(t) })
      if (error) return fail(t, 'upsert', error.message)
    }
    return { ok: true }
  } catch (e: any) {
    return fail(t, 'exception', e?.message || String(e))
  }
}

function fail(t: Table, op: string, message: string): PersistResult {
  console.error('[supabase persist]', t, op, message)
  return { ok: false, error: message }
}

// ── Load all (앱 시작 시) ────────────────────────────────────
/** 같은 행이 두 번 들어오지 않게 PK 기준으로 접는다 (중복 방어의 마지막 관문) */
function dedupeRows(t: Table, rows: any[]): any[] {
  const byKey = new Map<string, any>()
  for (const r of rows) byKey.set(rowKey(t, r), r)
  return [...byKey.values()]
}

function selectCols(t: Table): string {
  if (t === 'contents') return CONTENT_LIST_COLS
  // 큐레이션 본문은 한 편에 수백~수천 자다 — 목록 화면이 안 쓰는 body·items 는 상세에서 받는다
  if (t === 'curations') return CURATION_LIST_COLS
  return '*'
}

/**
 * 한 테이블 전체를 페이지네이션으로 로드.
 * PostgREST는 한 번의 select에 기본 1000행만 반환하므로, .range()로 끝까지 긁는다.
 * (안 그러면 contents가 1000행을 넘는 순간 최근 행들이 캐시에 안 올라와
 *  그 content를 참조하는 watched/피드 항목이 화면에서 사라진다.)
 *
 * order 를 반드시 준다: ORDER BY 없는 LIMIT/OFFSET 은 순서를 보장하지 않아서,
 * 페이지를 넘기는 사이에 행이 UPDATE/INSERT 되면 같은 행이 두 페이지에 걸쳐
 * 두 번 들어오거나(→ 목록·검색에 같은 작품이 두 개) 어떤 행은 아예 빠진다.
 * 1000행을 넘긴 contents 에서 실제로 문제가 되는 지점.
 */
async function selectAllRows(t: Table): Promise<any[] | null> {
  const PAGE = 1000
  const all: any[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(t).select(selectCols(t))
    for (const col of pkCols(t)) q = q.order(col, { ascending: true })
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) { console.error('[supabase load]', t, error.message); return null }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
  }
  return dedupeRows(t, all)
}

export async function loadAll() {
  // users(레거시 게스트)는 방문자 수만큼 늘어나는 테이블이라 통째로 받지 않는다 — 아래서 따로.
  await Promise.all(TABLES.filter(t => t !== 'users').map(async t => {
    const rows = await selectAllRows(t)
    if (rows) cache[t] = rows
  }))
  await loadGuestUsers()
  injectUpcomingSeed()
}

/**
 * 게스트(유동닉) 계정 중 **화면에 이름이 필요한 행만** 받는다.
 * 전부 받으면 방문자 수에 비례해 커진다 — 2026-08-17 기준 1,076행 150KB 이고,
 * 방문자가 1만 명이 되면 그것만으로 1.4MB 를 매 방문마다 받게 된다.
 * 필요한 건 ① 이 브라우저의 게스트 계정 ② 글·댓글·차단·신고에 등장하는 작성자뿐이다.
 * (유동닉 글은 guestName 을 행에 직접 들고 있어서 대부분 이 테이블이 필요 없다)
 */
async function loadGuestUsers() {
  const ids = new Set<string>()
  try {
    const mine = localStorage.getItem('bangjot_anon_id')
    if (mine) ids.add(mine)
  } catch { /* 사생활 보호 모드 등에서 localStorage 접근 불가 */ }

  for (const rows of [cache.reviews, cache.comments, cache.discussions, cache.discussion_comments]) {
    for (const r of rows) if (r.authorId) ids.add(r.authorId)
  }
  for (const b of cache.blocks) { if (b.blockerId) ids.add(b.blockerId); if (b.blockedId) ids.add(b.blockedId) }
  for (const r of cache.reports) if (r.reporterId) ids.add(r.reporterId)

  // 계정(profiles)에 있는 id 는 users 테이블에 없다 — 조회할 필요가 없다
  const profileIds = new Set(cache.profiles.map((p: any) => p.id))
  const need = [...ids].filter(id => id && id !== 'deleted' && !profileIds.has(id))
  if (!need.length) { cache.users = []; return }

  const rows: any[] = []
  // URL 길이 제한 때문에 나눠서 조회
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100)
    const { data, error } = await supabase.from('users').select('*').in('id', chunk)
    if (error) { console.error('[supabase load] users', error.message); return }
    if (data) rows.push(...data)
  }
  cache.users = rows
}

/**
 * RLS로 "본인 것만" 보이는 유저별 테이블.
 * 이 테이블들은 auth.uid()가 있어야 행이 반환되므로, 로그인/로그아웃 등
 * 인증 상태가 바뀐 뒤 반드시 다시 로드해야 한다. (안 그러면 anon으로 로드된
 * 빈 캐시가 남아 내 피드/찜/알림이 텅 빈 것처럼 보인다.)
 */
const USER_SCOPED: Table[] = ['watched', 'bookmarks', 'content_alerts', 'blocks', 'notifications', 'reports']

export async function reloadUserScoped() {
  await Promise.all(USER_SCOPED.map(async t => {
    const rows = await selectAllRows(t)
    if (rows) cache[t] = rows
  }))
}

/**
 * 개봉예정 시드를 캐시에 주입 (클라이언트 전용, Supabase에는 쓰지 않음).
 * contents 테이블에 releaseDate가 실제로 채워지기 전까지 캘린더를 살아있게 유지한다.
 * 같은 제목이 이미 DB에 있으면 스킵 → 실데이터가 시드를 대체.
 */
function injectUpcomingSeed() {
  // DB에 이미 실제 예정작(releaseDate 보유)이 있으면 시드는 넣지 않는다.
  const hasReal = cache.contents.some((c: any) => c.releaseDate)
  if (hasReal) return
  const existing = new Set(cache.contents.map((c: any) => c.title))
  const add = UPCOMING_SEED.filter(s => !existing.has(s.title))
  if (add.length) cache.contents = [...add, ...cache.contents]
}

// authStore 호환용 별칭
export const seed = loadAll
