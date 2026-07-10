/**
 * DataService - localStorage 기반 데이터 레이어
 *
 * 백엔드 API가 준비되면 api/*.api.ts로 교체하면 됩니다.
 */
import { uuid } from '@/utils/helpers'
import type {
  User, Content, Review, Comment, Notification,
  Report, Block, Bookmark, Announcement,
} from '@/types'

// ── Storage Helpers ─────────────────────────────────────────

function store(key: string, val: unknown) {
  localStorage.setItem('doljikgu_' + key, JSON.stringify(val))
}

function load<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem('doljikgu_' + key) || 'null')
  } catch {
    return null
  }
}

// ── Users ───────────────────────────────────────────────────

export function getUsers(): User[] { return load('users') ?? [] }
export function saveUsers(users: User[]) { store('users', users) }
export function getUserById(id: string) { return getUsers().find(u => u.id === id) }
export function findUserByEmail(email: string) { return getUsers().find(u => u.email === email) }

export function createUser(data: Partial<User>): User {
  const users = getUsers()
  const user: User = { id: uuid(), createdAt: new Date().toISOString(), role: 'user', banned: false, ...data } as User
  users.push(user)
  saveUsers(users)
  return user
}

export function updateUser(id: string, updates: Partial<User>): User | null {
  const users = getUsers()
  const idx = users.findIndex(u => u.id === id)
  if (idx < 0) return null
  Object.assign(users[idx], updates)
  saveUsers(users)
  return users[idx]
}

export function deleteUser(id: string) {
  const reviews = getReviews().map(r => r.authorId === id ? { ...r, authorId: 'deleted' } : r)
  saveReviews(reviews)
  const comments = getComments().map(c => c.authorId === id ? { ...c, authorId: 'deleted' } : c)
  saveComments(comments)
  saveUsers(getUsers().filter(u => u.id !== id))
}

// ── Contents (작품) ─────────────────────────────────────────

export function getContents(): Content[] { return load('contents') ?? [] }
export function saveContents(contents: Content[]) { store('contents', contents) }
export function getContentById(id: string) { return getContents().find(c => c.id === id) }

export function createContent(data: Partial<Content>): Content {
  const contents = getContents()
  const content: Content = {
    id: uuid(), posterUrl: null, synopsis: '', genres: [], creators: [],
    platform: null, releaseYear: null, status: null,
    avgRating: 0, reviewCount: 0,
    createdAt: new Date().toISOString(),
    ...data,
  } as Content
  contents.unshift(content)
  saveContents(contents)
  return content
}

export function updateContent(id: string, updates: Partial<Content>): Content | null {
  const contents = getContents()
  const idx = contents.findIndex(c => c.id === id)
  if (idx < 0) return null
  Object.assign(contents[idx], updates)
  saveContents(contents)
  return contents[idx]
}

export function deleteContent(id: string) {
  saveContents(getContents().filter(c => c.id !== id))
  const removedReviews = getReviews().filter(r => r.contentId === id).map(r => r.id)
  saveReviews(getReviews().filter(r => r.contentId !== id))
  saveComments(getComments().filter(c => !removedReviews.includes(c.reviewId)))
}

/** 리뷰 목록으로부터 작품 평균 점수/리뷰 수 재계산 */
export function recomputeContentRating(contentId: string) {
  const reviews = getReviews().filter(r => r.contentId === contentId)
  const count = reviews.length
  const avg = count ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0
  updateContent(contentId, { avgRating: avg, reviewCount: count })
}

// ── Reviews ─────────────────────────────────────────────────

export function getReviews(): Review[] { return load('reviews') ?? [] }
export function saveReviews(reviews: Review[]) { store('reviews', reviews) }
export function getReviewById(id: string) { return getReviews().find(r => r.id === id) }
export function getReviewsByContent(contentId: string) { return getReviews().filter(r => r.contentId === contentId) }
export function getReviewsByAuthor(authorId: string) { return getReviews().filter(r => r.authorId === authorId) }
export function getUserReviewForContent(userId: string, contentId: string) {
  return getReviews().find(r => r.authorId === userId && r.contentId === contentId)
}

export function createReview(data: Partial<Review>): Review {
  const reviews = getReviews()
  const review: Review = {
    id: uuid(), likes: [], dislikes: [], views: 0, spoiler: false, tags: [],
    createdAt: new Date().toISOString(), updatedAt: null,
    ...data,
  } as Review
  reviews.unshift(review)
  saveReviews(reviews)
  if (review.contentId) recomputeContentRating(review.contentId)
  return review
}

export function updateReview(id: string, updates: Partial<Review>): Review | null {
  const reviews = getReviews()
  const idx = reviews.findIndex(r => r.id === id)
  if (idx < 0) return null
  Object.assign(reviews[idx], updates, { updatedAt: new Date().toISOString() })
  saveReviews(reviews)
  recomputeContentRating(reviews[idx].contentId)
  return reviews[idx]
}

export function deleteReview(id: string) {
  const review = getReviewById(id)
  saveReviews(getReviews().filter(r => r.id !== id))
  saveComments(getComments().filter(c => c.reviewId !== id))
  if (review) recomputeContentRating(review.contentId)
}

// ── Comments ────────────────────────────────────────────────

export function getComments(): Comment[] { return load('comments') ?? [] }
export function saveComments(cmts: Comment[]) { store('comments', cmts) }

export function createComment(data: Partial<Comment>): Comment {
  const cmts = getComments()
  const comment: Comment = { id: uuid(), likes: [], createdAt: new Date().toISOString(), ...data } as Comment
  cmts.push(comment)
  saveComments(cmts)
  return comment
}

export function updateComment(id: string, updates: Partial<Comment>): Comment | null {
  const cmts = getComments()
  const idx = cmts.findIndex(c => c.id === id)
  if (idx < 0) return null
  Object.assign(cmts[idx], updates, { updatedAt: new Date().toISOString() })
  saveComments(cmts)
  return cmts[idx]
}

export function deleteComment(id: string) {
  saveComments(getComments().filter(c => c.id !== id && c.parentId !== id))
}

// ── Bookmarks (작품 찜) ─────────────────────────────────────

export function getBookmarks(): Bookmark[] { return load('bookmarks') ?? [] }
export function saveBookmarks(bm: Bookmark[]) { store('bookmarks', bm) }

export function toggleBookmark(userId: string, contentId: string): boolean {
  const bm = getBookmarks()
  const idx = bm.findIndex(b => b.userId === userId && b.contentId === contentId)
  if (idx >= 0) bm.splice(idx, 1)
  else bm.push({ userId, contentId, createdAt: new Date().toISOString() })
  saveBookmarks(bm)
  return idx < 0
}

export function isBookmarked(userId: string, contentId: string): boolean {
  return getBookmarks().some(b => b.userId === userId && b.contentId === contentId)
}

export function getUserBookmarks(userId: string): Bookmark[] {
  return getBookmarks().filter(b => b.userId === userId)
}

// ── Blocks ──────────────────────────────────────────────────

export function getBlocks(): Block[] { return load('blocks') ?? [] }
export function saveBlocks(bl: Block[]) { store('blocks', bl) }

export function blockUser(blockerId: string, blockedId: string) {
  const bl = getBlocks()
  if (!bl.some(b => b.blockerId === blockerId && b.blockedId === blockedId)) {
    bl.push({ blockerId, blockedId, createdAt: new Date().toISOString() })
    saveBlocks(bl)
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

export function getNotifications(): Notification[] { return load('notifications') ?? [] }
export function saveNotifications(n: Notification[]) { store('notifications', n) }

export function createNotification(data: Partial<Notification>) {
  const ns = getNotifications()
  ns.unshift({ id: uuid(), read: false, createdAt: new Date().toISOString(), ...data } as Notification)
  saveNotifications(ns)
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
  const n = ns.find(x => x.id === notifId)
  if (n) { n.read = true; saveNotifications(ns) }
}

export function markAllRead(userId: string) {
  const ns = getNotifications()
  ns.filter(n => n.userId === userId).forEach(n => { n.read = true })
  saveNotifications(ns)
}

// ── Reports ─────────────────────────────────────────────────

export function getReports(): Report[] { return load('reports') ?? [] }
export function saveReports(reports: Report[]) { store('reports', reports) }

export function createReport(data: Partial<Report>): Report {
  const reports = getReports()
  const report: Report = { id: uuid(), status: 'pending', createdAt: new Date().toISOString(), ...data } as Report
  reports.push(report)
  saveReports(reports)
  return report
}

export function updateReport(id: string, updates: Partial<Report>) {
  const reports = getReports()
  const idx = reports.findIndex(r => r.id === id)
  if (idx >= 0) { Object.assign(reports[idx], updates); saveReports(reports) }
}

export function hasReported(userId: string, targetType: string, targetId: string): boolean {
  return getReports().some(
    r => r.reporterId === userId && r.targetType === targetType && r.targetId === targetId
  )
}

// ── Announcements ───────────────────────────────────────────

export function getAnnouncements(): Announcement[] { return load('announcements') ?? [] }
export function saveAnnouncements(a: Announcement[]) { store('announcements', a) }

export function createAnnouncementItem(data: Partial<Announcement>) {
  const anns = getAnnouncements()
  anns.unshift({ id: uuid(), createdAt: new Date().toISOString(), ...data } as Announcement)
  saveAnnouncements(anns)
}

export function deleteAnnouncementItem(id: string) {
  saveAnnouncements(getAnnouncements().filter(a => a.id !== id))
}

// ── Session ─────────────────────────────────────────────────

export function setSession(user: User | null) {
  if (user) sessionStorage.setItem('doljikgu_session', JSON.stringify(user))
  else sessionStorage.removeItem('doljikgu_session')
}

export function getSession(): User | null {
  try { return JSON.parse(sessionStorage.getItem('doljikgu_session') || 'null') }
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

// ── Seed ────────────────────────────────────────────────────

export async function seed() {
  if (load('seeded_v1')) return
  try {
    const [users, contents, reviews, comments, reports] = await Promise.all([
      fetch('/data/users.json').then(r => r.json()),
      fetch('/data/contents.json').then(r => r.json()),
      fetch('/data/reviews.json').then(r => r.json()),
      fetch('/data/comments.json').then(r => r.json()),
      fetch('/data/reports.json').then(r => r.json()),
    ])
    saveUsers(users)
    saveContents(contents)
    saveReviews(reviews)
    saveComments(comments)
    saveReports(reports)
    // 시드 작품들의 집계값 보정
    contents.forEach((c: Content) => recomputeContentRating(c.id))
  } catch (e) {
    console.warn('JSON seed fetch failed:', e)
  }
  store('seeded_v1', true)
}
