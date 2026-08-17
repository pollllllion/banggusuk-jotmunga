/**
 * 개인 기록·소통 — 찜(bookmarks), 본 작품(watched), 차단(blocks),
 * 알림(notifications), 신고(reports), 공지(announcements).
 *
 * bookmarks/watched/blocks/notifications/reports 는 RLS 상 "본인 것만" 보인다.
 * 로그인 상태가 바뀌면 cache.ts 의 reloadUserScoped() 로 다시 읽어야 한다.
 */
import { supabase } from '@/lib/supabaseClient'
import { uuid } from '@/utils/helpers'
import type { Bookmark, Watched, Block, Notification, Report, Announcement, Content, ContentType } from '@/types'
import { cache, load, store } from './cache'
import { currentUser } from './session'

// ── Bookmarks ───────────────────────────────────────────────
export function getBookmarks(): Bookmark[] { return load('bookmarks') }
export function saveBookmarks(bm: Bookmark[]) { store('bookmarks', bm) }

export function toggleBookmark(userId: string, contentId: string): boolean {
  const bm = getBookmarks()
  const exists = bm.some(b => b.userId === userId && b.contentId === contentId)
  if (exists) saveBookmarks(bm.filter(b => !(b.userId === userId && b.contentId === contentId)))
  else saveBookmarks([...bm, { userId, contentId, createdAt: new Date().toISOString() }])
  return !exists
}

export function isBookmarked(userId: string, contentId: string): boolean {
  return getBookmarks().some(b => b.userId === userId && b.contentId === contentId)
}

export function getUserBookmarks(userId: string): Bookmark[] {
  return getBookmarks().filter(b => b.userId === userId)
}

// ── Watched (내가 본 작품 — 내 피드) ────────────────────────
export function getWatched(): Watched[] { return load('watched') }

export function getUserWatched(userId: string): Watched[] {
  return getWatched()
    .filter(w => w.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function isWatched(userId: string, contentId: string): boolean {
  return getWatched().some(w => w.userId === userId && w.contentId === contentId)
}

export interface RegisterWatchedInput {
  contentId: string
  type: ContentType
  title: string
  posterUrl?: string | null
  platform?: string | null
  releaseYear?: number | null
  synopsis?: string
  genres?: string[]
  creators?: string[]
  /** 실제로 이 작품을 본 연도 (모르면 생략/null) */
  watchedYear?: number | null
}

/**
 * 본 작품 등록 — 서버 RPC(register_watched).
 * 작품이 없으면 서버에서 생성(RLS 우회) + watched 링크 추가. 생성/조회된 content 반환.
 */
export async function registerWatched(input: RegisterWatchedInput): Promise<Content> {
  const { data, error } = await supabase.rpc('register_watched', {
    p_content_id: input.contentId,
    p_type: input.type,
    p_title: input.title,
    p_poster_url: input.posterUrl ?? null,
    p_platform: input.platform ?? null,
    p_release_year: input.releaseYear ?? null,
    p_synopsis: input.synopsis ?? '',
    p_genres: input.genres ?? [],
    p_creators: input.creators ?? [],
    p_watched_year: input.watchedYear ?? null,
  })
  if (error) { console.error('[register_watched]', error); throw error }
  const content = data as Content
  // 캐시 반영 (즉시 표시)
  if (content && !cache.contents.some((c: any) => c.id === content.id)) {
    cache.contents = [content, ...cache.contents]
  }
  const uid = currentUser()?.id
  if (uid && !cache.watched.some((w: any) => w.userId === uid && w.contentId === content.id)) {
    cache.watched = [{ userId: uid, contentId: content.id, createdAt: new Date().toISOString(), watchedYear: input.watchedYear ?? null }, ...cache.watched]
  }
  return content
}

/** 본 작품 등록 취소 — 본인 watched 행만 삭제(RLS 허용) */
export async function unregisterWatched(userId: string, contentId: string): Promise<void> {
  cache.watched = cache.watched.filter((w: any) => !(w.userId === userId && w.contentId === contentId))
  try { await supabase.from('watched').delete().eq('userId', userId).eq('contentId', contentId) }
  catch (e) { console.error('[unregisterWatched]', e) }
}

/** 시청 연도 수정 — 본인 watched 행만 UPDATE (RLS: watched_update_own) */
export async function updateWatchedYear(userId: string, contentId: string, year: number | null): Promise<void> {
  cache.watched = cache.watched.map((w: any) =>
    w.userId === userId && w.contentId === contentId ? { ...w, watchedYear: year } : w
  )
  try { await supabase.from('watched').update({ watchedYear: year }).eq('userId', userId).eq('contentId', contentId) }
  catch (e) { console.error('[updateWatchedYear]', e) }
}

// ── Blocks ──────────────────────────────────────────────────
export function getBlocks(): Block[] { return load('blocks') }
export function saveBlocks(bl: Block[]) { store('blocks', bl) }

export function blockUser(blockerId: string, blockedId: string) {
  const bl = getBlocks()
  if (!bl.some(b => b.blockerId === blockerId && b.blockedId === blockedId)) {
    saveBlocks([...bl, { blockerId, blockedId, createdAt: new Date().toISOString() }])
  }
}

export function unblockUser(blockerId: string, blockedId: string) {
  saveBlocks(getBlocks().filter(b => !(b.blockerId === blockerId && b.blockedId === blockedId)))
}

export function isBlocked(blockerId: string, blockedId: string): boolean {
  return getBlocks().some(b => b.blockerId === blockerId && b.blockedId === blockedId)
}

export function getBlockedIds(userId: string): string[] {
  return getBlocks().filter(b => b.blockerId === userId).map(b => b.blockedId)
}

// ── Notifications ───────────────────────────────────────────
export function getNotifications(): Notification[] { return load('notifications') }
export function saveNotifications(n: Notification[]) { store('notifications', n) }

export function createNotification(data: Partial<Notification>) {
  const n = { id: uuid(), read: false, createdAt: new Date().toISOString(), ...data } as Notification
  saveNotifications([n, ...getNotifications()])
}

export function getUserNotifications(userId: string): Notification[] {
  return getNotifications()
    .filter(n => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getUnreadCount(userId: string): number {
  return getNotifications().filter(n => n.userId === userId && !n.read).length
}

export function markRead(notifId: string) {
  const ns = getNotifications()
  const idx = ns.findIndex(x => x.id === notifId)
  if (idx < 0) return
  const next = [...ns]; next[idx] = { ...ns[idx], read: true }
  saveNotifications(next)
}

export function markAllRead(userId: string) {
  saveNotifications(getNotifications().map(n => n.userId === userId ? { ...n, read: true } : n))
}

// ── Reports ─────────────────────────────────────────────────
export function getReports(): Report[] { return load('reports') }
export function saveReports(reports: Report[]) { store('reports', reports) }

export function createReport(data: Partial<Report>): Report {
  const report: Report = { id: uuid(), status: 'pending', createdAt: new Date().toISOString(), ...data } as Report
  saveReports([...getReports(), report])
  return report
}

export function updateReport(id: string, updates: Partial<Report>) {
  const reports = getReports()
  const idx = reports.findIndex(r => r.id === id)
  if (idx < 0) return
  const next = [...reports]; next[idx] = { ...reports[idx], ...updates }
  saveReports(next)
}

export function hasReported(userId: string, targetType: string, targetId: string): boolean {
  return getReports().some(r => r.reporterId === userId && r.targetType === targetType && r.targetId === targetId)
}

// ── Announcements ───────────────────────────────────────────
export function getAnnouncements(): Announcement[] { return load('announcements') }
export function saveAnnouncements(a: Announcement[]) { store('announcements', a) }

export function createAnnouncementItem(data: Partial<Announcement>) {
  const a = { id: uuid(), createdAt: new Date().toISOString(), ...data } as Announcement
  saveAnnouncements([a, ...getAnnouncements()])
}

export function deleteAnnouncementItem(id: string) {
  saveAnnouncements(getAnnouncements().filter(a => a.id !== id))
}
