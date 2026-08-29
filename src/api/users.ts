/**
 * 사용자 — 고정닉 계정(profiles) + 유동닉 게스트(users) + 출석 streak + 탈퇴.
 *
 * 이 앱은 신원이 둘이다:
 *   profiles = Supabase Auth 계정(고정닉).  users = 브라우저 로컬 게스트(유동닉, 레거시)
 * getUserById 는 둘을 합쳐서 보여준다.
 */
import { supabase } from '@/lib/supabaseClient'
import { uuid } from '@/utils/helpers'
import type { User } from '@/types'
import { cache, load, store, type Table } from './cache'
import { getSession, setSession } from './session'
import { getReviews, saveReviews, getComments, saveComments } from './reviews'

export function getUsers(): User[] { return load('users') }
export function saveUsers(users: User[]) { store('users', users) }

/** 계정(profiles) + 게스트(users) 통합 조회 — 닉네임 표시 등에 사용 */
export function getUserById(id: string): User | undefined {
  const u = getUsers().find(u => u.id === id)
  if (u) return u
  const p = cache.profiles.find((p: any) => p.id === id)
  if (p) return profileToUser(p, '')
  return undefined
}

/** 고정닉(계정)인지 — profiles 에 있으면 계정, users 에만 있으면 게스트(유동닉). */
export function isAccountId(id: string | null | undefined): boolean {
  return !!id && id !== 'deleted' && cache.profiles.some((p: any) => p.id === id)
}

/** profiles 행 → User (공개 취향·streak 필드 포함). */
function profileToUser(p: any, email: string): User {
  return {
    id: p.id, nickname: p.nickname, email, role: p.role, banned: p.banned, createdAt: p.createdAt,
    lastVisit: p.lastVisit ?? null, streak: p.streak ?? 0, visitDays: p.visitDays ?? 0,
    tasteBio: p.tasteBio ?? null,
    favoriteWorks: p.favoriteWorks ?? [],
    favoriteGenres: p.favoriteGenres ?? [],
    favoriteDirectors: p.favoriteDirectors ?? [],
  }
}
export function findUserByEmail(email: string) { return getUsers().find(u => u.email === email) }

// ── Profiles (Supabase Auth 고정닉 계정) ────────────────────
/** auth 사용자에 대응하는 profiles 행 확보(없으면 생성) → User 형태로 반환 */
export async function ensureProfile(authUser: { id: string; email?: string | null }, nickname?: string): Promise<User> {
  const existing = cache.profiles.find((p: any) => p.id === authUser.id)
  if (existing) return profileToUser(existing, authUser.email || '')
  const row = {
    id: authUser.id,
    nickname: nickname || ('회원' + Math.floor(1000 + Math.random() * 9000)),
    role: 'user' as const,
    banned: false,
    createdAt: new Date().toISOString(),
  }
  cache.profiles = [row, ...cache.profiles]
  try { await supabase.from('profiles').upsert(row, { onConflict: 'id' }) }
  catch (e) { console.error('[profile upsert]', e) }
  return { id: row.id, nickname: row.nickname, email: authUser.email || '', role: row.role, banned: row.banned, createdAt: row.createdAt }
}

/** 프로필 갱신(닉네임/권한/밴). role·banned 는 DB 트리거가 관리자 외에는 무시한다. */
export async function updateProfileRow(id: string, updates: Partial<User>) {
  const patch: any = {}
  if (updates.nickname !== undefined) patch.nickname = updates.nickname
  if (updates.role !== undefined) patch.role = updates.role
  if (updates.banned !== undefined) patch.banned = updates.banned
  // 공개 취향 프로필
  if (updates.tasteBio !== undefined) patch.tasteBio = updates.tasteBio
  if (updates.favoriteWorks !== undefined) patch.favoriteWorks = updates.favoriteWorks
  if (updates.favoriteGenres !== undefined) patch.favoriteGenres = updates.favoriteGenres
  if (updates.favoriteDirectors !== undefined) patch.favoriteDirectors = updates.favoriteDirectors
  const idx = cache.profiles.findIndex((p: any) => p.id === id)
  if (idx >= 0) cache.profiles[idx] = { ...cache.profiles[idx], ...patch }
  try { await supabase.from('profiles').update(patch).eq('id', id) }
  catch (e) { console.error('[profile update]', e) }
}

// ── 출석 streak ─────────────────────────────────────────────
/** 로컬 기준 'YYYY-MM-DD' */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// profiles 에 streak 컬럼이 없으면(마이그레이션 미적용) 첫 실패 후 조용히 꺼둔다.
let attendanceDisabled = false

/** 하루 최초 접속 시 연속 출석/방문일을 갱신한다. 계정(고정닉) 전용.
 *  컬럼이 없으면 no-op → 마이그레이션 적용 전까지 기능이 꺼진 상태로 안전하게 유지. */
export async function touchAttendance(userId: string): Promise<{ streak: number; visitDays: number } | null> {
  if (attendanceDisabled) return null
  const idx = cache.profiles.findIndex((p: any) => p.id === userId)
  if (idx < 0) return null
  const row: any = cache.profiles[idx]

  const now = new Date()
  const today = dateKey(now)
  if (row.lastVisit === today) return { streak: row.streak ?? 0, visitDays: row.visitDays ?? 0 }

  const yesterday = dateKey(new Date(now.getTime() - 86400000))
  const streak = row.lastVisit === yesterday ? (row.streak ?? 0) + 1 : 1
  const visitDays = (row.visitDays ?? 0) + 1
  const patch = { lastVisit: today, streak, visitDays }

  // DB 반영이 성공한 뒤에만 캐시를 갱신한다 — 컬럼이 없으면(마이그레이션 전)
  // 캐시도 안 건드려 완전한 no-op 을 보장한다.
  try {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) { attendanceDisabled = true; console.warn('[attendance] 비활성(profiles 마이그레이션 미적용?):', error.message); return null }
  } catch (e) {
    attendanceDisabled = true; console.warn('[attendance] 비활성:', e); return null
  }
  cache.profiles[idx] = { ...row, ...patch }
  return { streak, visitDays }
}

// ── 게스트(유동닉) 계정 ─────────────────────────────────────
export function createUser(data: Partial<User>): User {
  const users = getUsers()
  const user: User = { id: uuid(), createdAt: new Date().toISOString(), role: 'user', banned: false, ...data } as User
  saveUsers([...users, user])
  return user
}

export function updateUser(id: string, updates: Partial<User>): User | null {
  const users = getUsers()
  const idx = users.findIndex(u => u.id === id)
  if (idx < 0) return null
  const updated = { ...users[idx], ...updates }
  const next = [...users]; next[idx] = updated
  saveUsers(next)
  return updated
}

export function deleteUser(id: string) {
  saveReviews(getReviews().map(r => r.authorId === id ? { ...r, authorId: 'deleted' } : r))
  saveComments(getComments().map(c => c.authorId === id ? { ...c, authorId: 'deleted' } : c))
  saveUsers(getUsers().filter(u => u.id !== id))
}

/**
 * 회원 탈퇴 (계정=고정닉 전용) — 개인정보 처리방침 3항과 같은 동작.
 * 서버 RPC 하나로 처리한다: 글·댓글 작성자 표시 제거(본문 유지), 추천 기록에서 id 제거,
 * 찜·본작품·알림·차단 삭제, 프로필 행과 auth 계정 삭제.
 * (anon 키로는 auth.users 를 지울 수 없어 SECURITY DEFINER RPC 가 필요하다.
 *  supabase/migration_delete_account.sql 미적용이면 실패를 그대로 돌려준다 — 조용히 로그아웃시키지 않는다.)
 */
export async function deleteMyAccount(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('delete_my_account')
  if (error) { console.error('[delete_my_account]', error); return { ok: false, error: error.message } }

  // 서버가 지운 모양 그대로 캐시도 맞춘다 (persist 를 타면 안 되므로 캐시를 직접 손본다)
  const POST_TABLES: Table[] = ['discussions', 'discussion_comments', 'reviews', 'comments']
  for (const t of POST_TABLES) {
    cache[t] = cache[t].map((r: any) => r.authorId === userId
      ? { ...r, authorId: null, guestName: null, guestPwHash: null }
      : r)
    cache[t] = cache[t].map((r: any) => ({
      ...r,
      likes: Array.isArray(r.likes) ? r.likes.filter((u: string) => u !== userId) : r.likes,
      ...(Array.isArray(r.dislikes) ? { dislikes: r.dislikes.filter((u: string) => u !== userId) } : {}),
    }))
  }
  cache.bookmarks = cache.bookmarks.filter((b: any) => b.userId !== userId)
  cache.content_alerts = cache.content_alerts.filter((a: any) => a.userId !== userId)
  cache.watched = cache.watched.filter((w: any) => w.userId !== userId)
  cache.notifications = cache.notifications.filter((n: any) => n.userId !== userId)
  cache.blocks = cache.blocks.filter((b: any) => b.blockerId !== userId && b.blockedId !== userId)
  cache.reports = cache.reports.map((r: any) => r.reporterId === userId ? { ...r, reporterId: null } : r)
  cache.profiles = cache.profiles.filter((p: any) => p.id !== userId)
  return { ok: true }
}

/** 세션에 담긴 사용자 정보를 캐시 기준으로 다시 채운다 */
export function refreshSession() {
  const s = getSession()
  if (!s) return
  const fresh = getUserById(s.id)
  if (fresh) setSession(fresh)
}
