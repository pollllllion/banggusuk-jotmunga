/**
 * 개인 기록·소통 — 찜(bookmarks), 공개알림(content_alerts), 본 작품(watched),
 * 차단(blocks), 알림(notifications), 신고(reports), 공지(announcements).
 *
 * bookmarks/content_alerts/watched/blocks/notifications/reports 는 RLS 상 "본인 것만" 보인다.
 * 로그인 상태가 바뀌면 cache.ts 의 reloadUserScoped() 로 다시 읽어야 한다.
 */
import { supabase } from '@/lib/supabaseClient'
import { uuid } from '@/utils/helpers'
import type { Bookmark, ContentAlert, Watched, Block, Notification, NotificationType, Report, Announcement, Content, ContentType } from '@/types'
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

// ── ContentAlert (공개알림) ─────────────────────────────────
// 찜과 별개다. 찜해도 알림은 안 가고, 여기 행이 있는 작품만 공개일에 푸시된다.
// 브라우저 푸시 구독(push_subscriptions)은 이것과 또 별개 — 둘 다 있어야 실제로 온다.
export function getContentAlerts(): ContentAlert[] { return load('content_alerts') }
export function saveContentAlerts(rows: ContentAlert[]) { store('content_alerts', rows) }

export function toggleContentAlert(userId: string, contentId: string): boolean {
  const rows = getContentAlerts()
  const exists = rows.some(a => a.userId === userId && a.contentId === contentId)
  if (exists) saveContentAlerts(rows.filter(a => !(a.userId === userId && a.contentId === contentId)))
  else saveContentAlerts([...rows, { userId, contentId, createdAt: new Date().toISOString() }])
  return !exists
}

export function isContentAlerted(userId: string, contentId: string): boolean {
  return getContentAlerts().some(a => a.userId === userId && a.contentId === contentId)
}

export function getUserContentAlerts(userId: string): ContentAlert[] {
  return getContentAlerts().filter(a => a.userId === userId)
}

// ── Watched (내가 본 작품 — 내 피드) ────────────────────────
export function getWatched(): Watched[] { return load('watched') }

/**
 * 남의 '본 작품' 목록을 서버에서 직접 받아온다 (프로필 화면용).
 *
 * 캐시(cache.watched)에는 **내 행만** 들어 있다 — RLS 가 그렇게 좁히고, 전부 받으면
 * 시작 로드가 사용자 수만큼 커진다. 그래서 프로필을 열 때 그 사람 것만 물어본다.
 *
 * ⚠️ watched 의 select 정책이 "본인만"이면 남의 것은 **빈 배열**로 돌아온다.
 *    공개하려면 migration_watched_public.sql 을 적용해야 한다.
 *    적용 전에도 오류 없이 그냥 안 보일 뿐이라 순서를 신경 쓰지 않아도 된다.
 */
export async function fetchUserWatched(userId: string): Promise<Watched[]> {
  const { data, error } = await supabase.from('watched').select('*').eq('userId', userId)
  if (error) { console.error('[fetchUserWatched]', error.message); return [] }
  return (data || []) as Watched[]
}

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

/** 알림 행 하나 만들기 — id·시각·읽음 기본값만 채운다. 넣는 건 insertNotifications. */
export function buildNotification(
  userId: string, type: NotificationType, reviewId: string, message: string,
): Notification {
  return { id: uuid(), userId, type, reviewId, message, read: false, createdAt: new Date().toISOString() }
}

/**
 * 알림 넣기 — **남의 알림 행**이라 캐시(store)를 타지 않고 바로 넣는다.
 * store 를 태우면 내 것도 아닌 행이 내 목록에 섞이고, 다음 persist 가 그걸 또 upsert 한다.
 *
 * RLS: notifications_insert 는 with check (true) — 유동닉도 넣을 수 있다.
 * 실패해도 사용자의 글·댓글은 이미 저장된 뒤다. 화면을 막지 않고 로그만 남긴다.
 */
export async function insertNotifications(rows: Notification[]): Promise<void> {
  if (!rows.length) return
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) console.error('[notifications insert]', error.message)
}

/** 한 번에 받아오는 알림 수. 패널이 30개만 보여주므로 이 정도면 넉넉하다. */
const NOTIF_FETCH_LIMIT = 100

/**
 * 알림 다시 받아오기.
 *
 * 시작 로드(cache.ts)는 앱이 뜨는 그 한 순간만 캐시를 채운다 — 탭을 켜 둔 채로 온
 * 알림은 새로고침 전까지 안 보인다. 종을 열 때·탭으로 돌아올 때 이걸 부른다.
 * (RLS 가 select 를 이미 본인 행으로 좁히므로 userId 조건을 따로 걸지 않는다)
 */
export async function refreshNotifications(): Promise<void> {
  const { data, error } = await supabase
    .from('notifications').select('*')
    .order('createdAt', { ascending: false })
    .limit(NOTIF_FETCH_LIMIT)
  if (error) { console.error('[notifications refresh]', error.message); return }
  cache.notifications = data || []
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

// ── 방문 통계 (관리자) ──────────────────────────────────────
export type AnalyticsSummary = {
  days: number
  totals: { views: number; visitors: number; members: number }
  daily: { day: string; views: number; visitors: number }[]
  topPaths: { path: string; views: number; visitors: number }[]
  topRefs: { ref: string; views: number }[]
  topQueries: { q: string; count: number }[]
}

/**
 * 방문 통계 — 집계는 **DB 함수**가 한다(migration_analytics.sql).
 * 원본 행을 브라우저로 내려받아 세면 행이 늘수록 화면이 무거워지고,
 * 그 자체가 개인정보를 옮기는 일이 된다. 함수는 관리자만 부를 수 있다.
 */
export async function fetchAnalytics(days: number): Promise<AnalyticsSummary | null> {
  const { data, error } = await supabase.rpc('analytics_summary', { p_days: days })
  if (error) { console.error('[analytics_summary]', error.message); return null }
  return data as AnalyticsSummary
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
