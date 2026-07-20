/**
 * DataService - Supabase 백엔드 (인메모리 캐시 + write-through)
 *
 * 앱 시작 시 loadAll()로 모든 테이블을 캐시에 로드합니다.
 * 읽기(getX)는 캐시에서 동기적으로, 쓰기(saveX)는 캐시 갱신 + Supabase 동기화(비동기)로 처리합니다.
 * → 페이지 코드는 기존 방식 그대로 두고 데이터 계층만 교체.
 */
import { supabase } from '@/lib/supabaseClient'
import { uuid } from '@/utils/helpers'
import { UPCOMING_SEED } from '@/utils/upcomingSeed'
import type {
  User, Content, ContentType, Review, Comment, Notification,
  Report, Block, Bookmark, Watched, Announcement, Discussion,
} from '@/types'

type Table =
  | 'users' | 'contents' | 'reviews' | 'comments'
  | 'bookmarks' | 'watched' | 'blocks' | 'notifications' | 'reports' | 'announcements' | 'discussions' | 'profiles'

const TABLES: Table[] = ['users', 'contents', 'reviews', 'comments', 'bookmarks', 'watched', 'blocks', 'notifications', 'reports', 'announcements', 'discussions', 'profiles']

const cache: Record<Table, any[]> = {
  users: [], contents: [], reviews: [], comments: [],
  bookmarks: [], watched: [], blocks: [], notifications: [], reports: [], announcements: [], discussions: [], profiles: [],
}

function rowKey(t: Table, r: any): string {
  if (t === 'bookmarks') return `${r.userId}|${r.contentId}`
  if (t === 'blocks') return `${r.blockerId}|${r.blockedId}`
  return r.id
}

function conflictCols(t: Table): string {
  if (t === 'bookmarks') return 'userId,contentId'
  if (t === 'blocks') return 'blockerId,blockedId'
  return 'id'
}

// ── Cache primitives ────────────────────────────────────────
function load<T>(key: Table): T[] { return cache[key] as T[] }

function store(key: Table, val: any[]) {
  const prev = cache[key] || []
  cache[key] = val
  void persist(key, prev, val)
}

async function persist(t: Table, prev: any[], next: any[]) {
  try {
    const prevByKey = new Map(prev.map(r => [rowKey(t, r), r]))
    const nextKeys = new Set(next.map(r => rowKey(t, r)))
    // 삭제된 행
    const removed = prev.filter(r => !nextKeys.has(rowKey(t, r)))
    for (const r of removed) {
      if (t === 'bookmarks') await supabase.from(t).delete().eq('userId', r.userId).eq('contentId', r.contentId)
      else if (t === 'blocks') await supabase.from(t).delete().eq('blockerId', r.blockerId).eq('blockedId', r.blockedId)
      else await supabase.from(t).delete().eq('id', r.id)
    }
    // 새로/바뀐 행만 upsert (RLS: 남의 행 통짜 upsert 방지 — 본인이 바꾼 것만 씀)
    const changed = next.filter(r => {
      const p = prevByKey.get(rowKey(t, r))
      return !p || JSON.stringify(p) !== JSON.stringify(r)
    })
    if (changed.length) {
      const rows = t === 'users' ? changed.map(({ password, ...u }: any) => u) : changed
      await supabase.from(t).upsert(rows, { onConflict: conflictCols(t) })
    }
  } catch (e) {
    console.error('[supabase persist]', t, e)
  }
}

// ── Load all (앱 시작 시) ────────────────────────────────────
export async function loadAll() {
  await Promise.all(TABLES.map(async t => {
    const { data, error } = await supabase.from(t).select('*')
    if (error) { console.error('[supabase load]', t, error.message); return }
    if (data) cache[t] = data
  }))
  injectUpcomingSeed()
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

// ── Users ───────────────────────────────────────────────────
export function getUsers(): User[] { return load('users') }
export function saveUsers(users: User[]) { store('users', users) }

/** 계정(profiles) + 게스트(users) 통합 조회 — 닉네임 표시 등에 사용 */
export function getUserById(id: string): User | undefined {
  const u = getUsers().find(u => u.id === id)
  if (u) return u
  const p = cache.profiles.find((p: any) => p.id === id)
  if (p) return { id: p.id, nickname: p.nickname, email: '', role: p.role, banned: p.banned, createdAt: p.createdAt }
  return undefined
}
export function findUserByEmail(email: string) { return getUsers().find(u => u.email === email) }

// ── Profiles (Supabase Auth 고정닉 계정) ────────────────────
/** auth 사용자에 대응하는 profiles 행 확보(없으면 생성) → User 형태로 반환 */
export async function ensureProfile(authUser: { id: string; email?: string | null }, nickname?: string): Promise<User> {
  const existing = cache.profiles.find((p: any) => p.id === authUser.id)
  if (existing) {
    return { id: existing.id, nickname: existing.nickname, email: authUser.email || '', role: existing.role, banned: existing.banned, createdAt: existing.createdAt }
  }
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

/** 프로필 갱신(닉네임/권한/밴) */
export async function updateProfileRow(id: string, updates: Partial<User>) {
  const patch: any = {}
  if (updates.nickname !== undefined) patch.nickname = updates.nickname
  if (updates.role !== undefined) patch.role = updates.role
  if (updates.banned !== undefined) patch.banned = updates.banned
  const idx = cache.profiles.findIndex((p: any) => p.id === id)
  if (idx >= 0) cache.profiles[idx] = { ...cache.profiles[idx], ...patch }
  try { await supabase.from('profiles').update(patch).eq('id', id) }
  catch (e) { console.error('[profile update]', e) }
}

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

// ── Contents ────────────────────────────────────────────────
export function getContents(): Content[] { return load('contents') }
export function saveContents(contents: Content[]) { store('contents', contents) }
export function getContentById(id: string) { return getContents().find(c => c.id === id) }

export function createContent(data: Partial<Content>): Content {
  const content: Content = {
    id: uuid(), posterUrl: null, synopsis: '', genres: [], creators: [],
    platform: null, releaseYear: null, releaseDate: null, status: null, popularity: 0,
    avgRating: 0, reviewCount: 0, createdAt: new Date().toISOString(),
    ...data,
  } as Content
  saveContents([content, ...getContents()])
  return content
}

export function updateContent(id: string, updates: Partial<Content>): Content | null {
  const contents = getContents()
  const idx = contents.findIndex(c => c.id === id)
  if (idx < 0) return null
  const updated = { ...contents[idx], ...updates }
  const next = [...contents]; next[idx] = updated
  saveContents(next)
  return updated
}

export function deleteContent(id: string) {
  const removedReviews = getReviews().filter(r => r.contentId === id).map(r => r.id)
  saveContents(getContents().filter(c => c.id !== id))
  saveReviews(getReviews().filter(r => r.contentId !== id))
  saveComments(getComments().filter(c => !removedReviews.includes(c.reviewId)))
}

/** 평점 재집계 — 캐시만 갱신(즉시 표시용). DB는 reviews 트리거가 처리 */
export function recomputeContentRating(contentId: string) {
  const reviews = getReviews().filter(r => r.contentId === contentId)
  const count = reviews.length
  const avg = count ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0
  const contents = getContents()
  const idx = contents.findIndex(c => c.id === contentId)
  if (idx >= 0) {
    const next = [...contents]; next[idx] = { ...contents[idx], avgRating: avg, reviewCount: count }
    cache.contents = next
  }
}

/** 리뷰 조회수 +1 — 서버 RPC(남의 리뷰도 올릴 수 있어야 하므로) */
export async function incrementReviewViews(id: string) {
  const reviews = getReviews()
  const idx = reviews.findIndex(r => r.id === id)
  if (idx >= 0) {
    const next = [...reviews]; next[idx] = { ...reviews[idx], views: reviews[idx].views + 1 }
    cache.reviews = next
  }
  try { await supabase.rpc('increment_review_views', { p_review_id: id }) }
  catch (e) { console.error('[increment_review_views]', e) }
}

// ── Reviews ─────────────────────────────────────────────────
export function getReviews(): Review[] { return load('reviews') }
export function saveReviews(reviews: Review[]) { store('reviews', reviews) }
export function getReviewById(id: string) { return getReviews().find(r => r.id === id) }
export function getReviewsByContent(contentId: string) { return getReviews().filter(r => r.contentId === contentId) }
export function getReviewsByAuthor(authorId: string) { return getReviews().filter(r => r.authorId === authorId) }
export function getUserReviewForContent(userId: string, contentId: string) {
  return getReviews().find(r => r.authorId === userId && r.contentId === contentId)
}

export function createReview(data: Partial<Review>): Review {
  const review: Review = {
    id: uuid(), likes: [], dislikes: [], views: 0, spoiler: false, tags: [],
    createdAt: new Date().toISOString(), updatedAt: null,
    ...data,
  } as Review
  saveReviews([review, ...getReviews()])
  if (review.contentId) recomputeContentRating(review.contentId)
  return review
}

export function updateReview(id: string, updates: Partial<Review>): Review | null {
  const reviews = getReviews()
  const idx = reviews.findIndex(r => r.id === id)
  if (idx < 0) return null
  const updated = { ...reviews[idx], ...updates, updatedAt: new Date().toISOString() }
  const next = [...reviews]; next[idx] = updated
  saveReviews(next)
  recomputeContentRating(updated.contentId)
  return updated
}

export function deleteReview(id: string) {
  const review = getReviewById(id)
  saveReviews(getReviews().filter(r => r.id !== id))
  saveComments(getComments().filter(c => c.reviewId !== id))
  if (review) recomputeContentRating(review.contentId)
}

// ── Comments ────────────────────────────────────────────────
export function getComments(): Comment[] { return load('comments') }
export function saveComments(cmts: Comment[]) { store('comments', cmts) }

export function createComment(data: Partial<Comment>): Comment {
  const comment: Comment = { id: uuid(), likes: [], createdAt: new Date().toISOString(), ...data } as Comment
  saveComments([...getComments(), comment])
  return comment
}

export function updateComment(id: string, updates: Partial<Comment>): Comment | null {
  const cmts = getComments()
  const idx = cmts.findIndex(c => c.id === id)
  if (idx < 0) return null
  const updated = { ...cmts[idx], ...updates, updatedAt: new Date().toISOString() }
  const next = [...cmts]; next[idx] = updated
  saveComments(next)
  return updated
}

export function deleteComment(id: string) {
  saveComments(getComments().filter(c => c.id !== id && c.parentId !== id))
}

// ── Discussions (출시 전 수다방) ────────────────────────────
export function getDiscussions(): Discussion[] { return load('discussions') }
export function saveDiscussions(d: Discussion[]) { store('discussions', d) }

export function getDiscussionsByContent(contentId: string): Discussion[] {
  return getDiscussions()
    .filter(d => d.contentId === contentId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function createDiscussion(data: Partial<Discussion>): Discussion {
  const d: Discussion = { id: uuid(), likes: [], createdAt: new Date().toISOString(), ...data } as Discussion
  saveDiscussions([d, ...getDiscussions()])
  return d
}

/** 수다방 공감 토글 — 서버 RPC로 처리(추천=로그인만), 캐시는 낙관적 갱신 */
export async function toggleDiscussionLike(id: string, userId: string): Promise<void> {
  const ds = getDiscussions()
  const idx = ds.findIndex(d => d.id === id)
  if (idx >= 0) {
    const cur = ds[idx]
    const likes = cur.likes.includes(userId) ? cur.likes.filter(u => u !== userId) : [...cur.likes, userId]
    const next = [...ds]; next[idx] = { ...cur, likes }; cache.discussions = next
  }
  try { await supabase.rpc('toggle_discussion_like', { p_discussion_id: id }) }
  catch (e) { console.error('[toggle_discussion_like]', e) }
}

/** 리뷰 공감(1)/비공감(-1) 토글 — 서버 RPC */
export async function toggleReviewVote(reviewId: string, value: 1 | -1, userId: string): Promise<void> {
  const reviews = getReviews()
  const idx = reviews.findIndex(r => r.id === reviewId)
  if (idx >= 0) {
    const r = reviews[idx]
    let likes: string[], dislikes: string[]
    if (value === 1) {
      dislikes = r.dislikes.filter(u => u !== userId)
      likes = r.likes.includes(userId) ? r.likes.filter(u => u !== userId) : [...r.likes, userId]
    } else {
      likes = r.likes.filter(u => u !== userId)
      dislikes = r.dislikes.includes(userId) ? r.dislikes.filter(u => u !== userId) : [...r.dislikes, userId]
    }
    const next = [...reviews]; next[idx] = { ...r, likes, dislikes }; cache.reviews = next
  }
  try { await supabase.rpc('toggle_review_vote', { p_review_id: reviewId, p_value: value }) }
  catch (e) { console.error('[toggle_review_vote]', e) }
}

/** 댓글 공감 토글 — 서버 RPC */
export async function toggleCommentLike(id: string, userId: string): Promise<void> {
  const cmts = getComments()
  const idx = cmts.findIndex(c => c.id === id)
  if (idx >= 0) {
    const cur = cmts[idx]
    const likes = cur.likes.includes(userId) ? cur.likes.filter(u => u !== userId) : [...cur.likes, userId]
    const next = [...cmts]; next[idx] = { ...cur, likes }; cache.comments = next
  }
  try { await supabase.rpc('toggle_comment_like', { p_comment_id: id }) }
  catch (e) { console.error('[toggle_comment_like]', e) }
}

export function deleteDiscussion(id: string): void {
  saveDiscussions(getDiscussions().filter(d => d.id !== id))
}

/** 유동닉 글 삭제 — 서버에서 비번 검증(pgcrypto). 성공 시 true, 비번 틀리면 false */
export async function deleteGuestPost(table: 'reviews' | 'discussions' | 'comments', id: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_guest_post', { p_table: table, p_id: id, p_password: password })
  if (error) { console.error('[delete_guest_post]', error); return false }
  if (data === true) {
    cache[table] = cache[table].filter((r: any) => r.id !== id)
  }
  return data === true
}

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
  })
  if (error) { console.error('[register_watched]', error); throw error }
  const content = data as Content
  // 캐시 반영 (즉시 표시)
  if (content && !cache.contents.some((c: any) => c.id === content.id)) {
    cache.contents = [content, ...cache.contents]
  }
  const uid = currentUser()?.id
  if (uid && !cache.watched.some((w: any) => w.userId === uid && w.contentId === content.id)) {
    cache.watched = [{ userId: uid, contentId: content.id, createdAt: new Date().toISOString() }, ...cache.watched]
  }
  return content
}

/** 본 작품 등록 취소 — 본인 watched 행만 삭제(RLS 허용) */
export async function unregisterWatched(userId: string, contentId: string): Promise<void> {
  cache.watched = cache.watched.filter((w: any) => !(w.userId === userId && w.contentId === contentId))
  try { await supabase.from('watched').delete().eq('userId', userId).eq('contentId', contentId) }
  catch (e) { console.error('[unregisterWatched]', e) }
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

// ── Session (브라우저 로컬) ──────────────────────────────────
export function setSession(user: User | null) {
  if (user) sessionStorage.setItem('bangjot_session', JSON.stringify(user))
  else sessionStorage.removeItem('bangjot_session')
}

export function getSession(): User | null {
  try { return JSON.parse(sessionStorage.getItem('bangjot_session') || 'null') }
  catch { return null }
}

export function currentUser(): User | null {
  return getSession()
}

export function refreshSession() {
  const s = getSession()
  if (!s) return
  const fresh = getUserById(s.id)
  if (fresh) setSession(fresh)
}
