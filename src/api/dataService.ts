/**
 * DataService - Supabase 백엔드 (인메모리 캐시 + write-through)
 *
 * 앱 시작 시 loadAll()로 모든 테이블을 캐시에 로드합니다.
 * 읽기(getX)는 캐시에서 동기적으로, 쓰기(saveX)는 캐시 갱신 + Supabase 동기화(비동기)로 처리합니다.
 * → 페이지 코드는 기존 방식 그대로 두고 데이터 계층만 교체.
 */
import { supabase } from '@/lib/supabaseClient'
import { uuid, normalizeTitle } from '@/utils/helpers'
import { UPCOMING_SEED } from '@/utils/upcomingSeed'
import type {
  User, Content, ContentType, Review, Comment, Notification,
  Report, Block, Bookmark, Watched, Announcement, Discussion, DiscussionComment,
} from '@/types'

type Table =
  | 'users' | 'contents' | 'reviews' | 'comments'
  | 'bookmarks' | 'watched' | 'blocks' | 'notifications' | 'reports' | 'announcements' | 'discussions' | 'discussion_comments' | 'profiles'

const TABLES: Table[] = ['users', 'contents', 'reviews', 'comments', 'bookmarks', 'watched', 'blocks', 'notifications', 'reports', 'announcements', 'discussions', 'discussion_comments', 'profiles']

const cache: Record<Table, any[]> = {
  users: [], contents: [], reviews: [], comments: [],
  bookmarks: [], watched: [], blocks: [], notifications: [], reports: [], announcements: [], discussions: [], discussion_comments: [], profiles: [],
}

/** 테이블별 기본키 컬럼. watched·bookmarks·blocks 는 복합키라 id 컬럼이 아예 없다. */
function pkCols(t: Table): string[] {
  if (t === 'bookmarks' || t === 'watched') return ['userId', 'contentId']
  if (t === 'blocks') return ['blockerId', 'blockedId']
  return ['id']
}

function rowKey(t: Table, r: any): string {
  return pkCols(t).map(c => r[c]).join('|')
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
/** 같은 행이 두 번 들어오지 않게 PK 기준으로 접는다 (중복 방어의 마지막 관문) */
function dedupeRows(t: Table, rows: any[]): any[] {
  const byKey = new Map<string, any>()
  for (const r of rows) byKey.set(rowKey(t, r), r)
  return [...byKey.values()]
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
/**
 * 상세 페이지에서만 쓰는 무거운 컬럼 — 시작 로드에서 뺀다.
 * castMembers 는 contents 전체에서 가장 큰 항목(수백 KB)이고 backdropUrl 은 화면에서 안 쓴다.
 * 작품 상세로 들어갈 때 loadContentDetail() 이 그 한 행만 채워 넣는다.
 */
const CONTENT_DETAIL_COLS = ['castMembers', 'backdropUrl'] as const

/** contents 시작 로드 컬럼 = 전체 - 상세 전용. PostgREST 는 '제외'가 안 돼서 열거해야 한다. */
const CONTENT_LIST_COLS = [
  'id', 'type', 'title', 'posterUrl', 'synopsis', 'genres', 'creators', 'platform',
  'releaseYear', 'releaseDate', 'status', 'popularity', 'avgRating', 'reviewCount',
  'createdBy', 'createdAt', 'verified', 'tmdbId', 'mediaType', 'eventType', 'seasonNumber',
  'originalTitle', 'manualReleaseDate', 'manualOverride', 'releaseDateSource', 'providers',
  'voteAverage', 'voteCount', 'tmdbUrl', 'source', 'region', 'hidden', 'syncedAt',
  'releasePattern', 'networks', 'runtime', 'numberOfSeasons', 'numberOfEpisodes',
].join(',')

function selectCols(t: Table): string {
  return t === 'contents' ? CONTENT_LIST_COLS : '*'
}

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
  await Promise.all(TABLES.map(async t => {
    const rows = await selectAllRows(t)
    if (rows) cache[t] = rows
  }))
  injectUpcomingSeed()
}

/**
 * RLS로 "본인 것만" 보이는 유저별 테이블.
 * 이 테이블들은 auth.uid()가 있어야 행이 반환되므로, 로그인/로그아웃 등
 * 인증 상태가 바뀐 뒤 반드시 다시 로드해야 한다. (안 그러면 anon으로 로드된
 * 빈 캐시가 남아 내 피드/찜/알림이 텅 빈 것처럼 보인다.)
 */
const USER_SCOPED: Table[] = ['watched', 'bookmarks', 'blocks', 'notifications', 'reports']

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

// 상세 컬럼을 이미 받아온 작품 (같은 작품을 다시 열어도 재요청하지 않게)
const detailLoaded = new Set<string>()

/**
 * 작품 상세 전용 컬럼(출연진·배경이미지)만 뒤늦게 채운다.
 * 시작 로드에서는 이 컬럼들을 빼기 때문에(CONTENT_DETAIL_COLS) 상세 화면·관리자 편집처럼
 * 실제로 필요한 곳에서 이걸 부른 뒤 화면을 갱신해야 한다.
 * @returns 캐시가 바뀌었으면 true (호출한 쪽에서 리렌더)
 */
export async function loadContentDetail(id: string): Promise<boolean> {
  if (!id || detailLoaded.has(id)) return false
  const { data, error } = await supabase
    .from('contents')
    .select(['id', ...CONTENT_DETAIL_COLS].join(','))
    .eq('id', id)
    .maybeSingle()
  if (error) { console.error('[loadContentDetail]', error.message); return false }
  detailLoaded.add(id)
  if (!data) return false
  const idx = cache.contents.findIndex((c: any) => c.id === id)
  if (idx < 0) return false
  cache.contents[idx] = { ...cache.contents[idx], ...(data as any) }
  return true
}

/**
 * 이 TMDB 작품이 이미 DB에 있나 — 통합검색의 TMDB 폴백에서 중복 노출을 막는 용도.
 * tmdbId 컬럼이 비어 있는 옛 행과 시즌별 행(tmdb-dr-123-s2)도 잡도록 행 id 로도 확인한다.
 */
export function hasTmdbContent(kind: 'movie' | 'tv', tmdbId: number): boolean {
  const prefix = kind === 'movie' ? `tmdb-mv-${tmdbId}` : `tmdb-dr-${tmdbId}`
  return getContents().some(c =>
    (c.tmdbId === tmdbId && (c.mediaType ?? kind) === kind) ||
    c.id === prefix || c.id.startsWith(`${prefix}-`))
}

/**
 * 통합 작품 검색 — 공백·문장부호를 무시(normalizeTitle)하고 매칭한다.
 * "유퀴즈" → "유 퀴즈 온 더 블럭", "전지적독자시점" → "전지적 독자 시점" 처럼
 * 띄어쓰기를 다르게 쳐도 찾아진다. (기존엔 원문 substring 이라 한 칸만 달라도 0건이었다)
 *
 * 점수: 제목 완전일치 > 제목 앞부분 > 제목 포함 > 원제 > 감독·작가 > 장르.
 * 동점이면 화제도(popularity) → 리뷰수 순. 숨긴 작품은 제외.
 */
export function searchContents(query: string, limit = 8): Content[] {
  const q = normalizeTitle(query)
  if (!q) return []
  const hits: { c: Content; score: number }[] = []
  for (const c of getContents()) {
    if (c.hidden) continue
    const title = normalizeTitle(c.title)
    const original = normalizeTitle(c.originalTitle || '')
    let score = 0
    if (title === q) score = 100
    else if (title.startsWith(q)) score = 80
    else if (title.includes(q)) score = 60
    else if (original && original.startsWith(q)) score = 50
    else if (original && original.includes(q)) score = 40
    else if ((c.creators || []).some(cr => normalizeTitle(cr).includes(q))) score = 30
    else if ((c.genres || []).some(g => normalizeTitle(g).includes(q))) score = 20
    if (score) hits.push({ c, score })
  }
  hits.sort((a, b) =>
    b.score - a.score ||
    (b.c.popularity ?? 0) - (a.c.popularity ?? 0) ||
    (b.c.reviewCount ?? 0) - (a.c.reviewCount ?? 0))
  return hits.slice(0, limit).map(h => h.c)
}

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

/**
 * 중복 작품 병합 — 서버 RPC(merge_content). fromId 를 intoId 로 합치고 fromId 삭제.
 * watched·bookmarks·reviews·discussions 의 참조를 intoId 로 옮긴다. 관리자만.
 */
export async function mergeContent(fromId: string, intoId: string): Promise<void> {
  const { error } = await supabase.rpc('merge_content', { p_from: fromId, p_into: intoId })
  if (error) { console.error('[merge_content]', error); throw error }

  // 캐시 반영 — watched/bookmarks 는 대상에 이미 있으면 원본 링크 제거 후 이전
  const movePk = (rows: any[]) => {
    const intoUsers = new Set(rows.filter(r => r.contentId === intoId).map(r => r.userId))
    return rows
      .filter(r => !(r.contentId === fromId && intoUsers.has(r.userId)))
      .map(r => r.contentId === fromId ? { ...r, contentId: intoId } : r)
  }
  cache.watched = movePk(cache.watched)
  cache.bookmarks = movePk(cache.bookmarks)
  cache.reviews = cache.reviews.map((r: any) => r.contentId === fromId ? { ...r, contentId: intoId } : r)
  cache.discussions = cache.discussions.map((d: any) => d.contentId === fromId ? { ...d, contentId: intoId } : d)
  cache.contents = cache.contents.filter((c: any) => c.id !== fromId)
  // 대상 평점/리뷰수 재집계
  const revs = cache.reviews.filter((r: any) => r.contentId === intoId)
  const avg = revs.length ? Math.round((revs.reduce((s: number, r: any) => s + (r.rating || 0), 0) / revs.length) * 10) / 10 : 0
  cache.contents = cache.contents.map((c: any) => c.id === intoId ? { ...c, avgRating: avg, reviewCount: revs.length } : c)
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
  // 딸린 댓글도 캐시에서 제거(서버는 FK on delete cascade)
  cache.discussion_comments = cache.discussion_comments.filter((c: any) => c.discussionId !== id)
}

// ── Discussion Comments (게시글 댓글) ───────────────────────
export function getDiscussionComments(): DiscussionComment[] { return load('discussion_comments') }
export function saveDiscussionComments(c: DiscussionComment[]) { store('discussion_comments', c) }

export function getDiscussionCommentsByPost(discussionId: string): DiscussionComment[] {
  return getDiscussionComments()
    .filter(c => c.discussionId === discussionId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

export function countDiscussionComments(discussionId: string): number {
  return getDiscussionComments().filter(c => c.discussionId === discussionId).length
}

export function createDiscussionComment(data: Partial<DiscussionComment>): DiscussionComment {
  const c: DiscussionComment = { id: uuid(), likes: [], createdAt: new Date().toISOString(), ...data } as DiscussionComment
  saveDiscussionComments([...getDiscussionComments(), c])
  return c
}

export function deleteDiscussionComment(id: string): void {
  saveDiscussionComments(getDiscussionComments().filter(c => c.id !== id))
}

/** 게시글 댓글 공감 토글 — 서버 RPC(추천=로그인만), 캐시 낙관적 갱신 */
export async function toggleDiscussionCommentLike(id: string, userId: string): Promise<void> {
  const cs = getDiscussionComments()
  const idx = cs.findIndex(c => c.id === id)
  if (idx >= 0) {
    const cur = cs[idx]
    const likes = cur.likes.includes(userId) ? cur.likes.filter(u => u !== userId) : [...cur.likes, userId]
    const next = [...cs]; next[idx] = { ...cur, likes }; cache.discussion_comments = next
  }
  try { await supabase.rpc('toggle_discussion_comment_like', { p_comment_id: id }) }
  catch (e) { console.error('[toggle_discussion_comment_like]', e) }
}

/** 유동닉 글 삭제 — 서버에서 비번 검증(pgcrypto). 성공 시 true, 비번 틀리면 false */
export async function deleteGuestPost(table: 'reviews' | 'discussions' | 'comments' | 'discussion_comments', id: string, password: string): Promise<boolean> {
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

export interface EnsureContentInput {
  contentId: string
  type: ContentType
  title: string
  posterUrl?: string | null
  releaseYear?: number | null
  synopsis?: string
  platform?: string | null
}

/**
 * 통합검색 TMDB 폴백용 — 작품이 DB에 없으면 그 자리에서 만들어 준다(RPC ensure_content).
 * 이미 있으면 서버가 기존 행을 그대로 돌려주므로 중복이 생기지 않는다.
 * 시청 기록(watched)은 만들지 않는다 — 검색해서 눌러본 것뿐이므로.
 */
export async function ensureContent(input: EnsureContentInput): Promise<Content> {
  const cached = getContentById(input.contentId)
  if (cached) return cached
  const { data, error } = await supabase.rpc('ensure_content', {
    p_content_id: input.contentId,
    p_type: input.type,
    p_title: input.title,
    p_poster_url: input.posterUrl ?? null,
    p_release_year: input.releaseYear ?? null,
    p_synopsis: input.synopsis ?? '',
    p_platform: input.platform ?? null,
  })
  if (error) {
    console.error('[ensure_content]', error)
    // 마이그레이션(supabase/migration_ensure_content.sql)이 아직 SQL Editor에 적용 안 된 경우
    if (error.code === 'PGRST202') throw new Error('작품 등록 기능이 아직 서버에 반영되지 않았어요.')
    throw error
  }
  const content = data as Content
  // 캐시 반영 (store 를 쓰면 클라이언트가 contents 를 upsert 하려다 RLS에 막힌다)
  if (content && !cache.contents.some((c: any) => c.id === content.id)) {
    cache.contents = [content, ...cache.contents]
  }
  return content
}

/** 본 작품 등록 취소 — 본인 watched 행만 삭제(RLS 허용) */
export async function unregisterWatched(userId: string, contentId: string): Promise<void> {
  cache.watched = cache.watched.filter((w: any) => !(w.userId === userId && w.contentId === contentId))
  try { await supabase.from('watched').delete().eq('userId', userId).eq('contentId', contentId) }
  catch (e) { console.error('[unregisterWatched]', e) }
}

export interface UpdateMyContentInput {
  contentId: string
  title: string
  posterUrl?: string | null
  platform?: string | null
  releaseYear?: number | null
}

/**
 * 내가 등록한 작품 정보 수정 — 서버 RPC(update_my_content).
 * createdBy = 본인인 작품만 수정됨(서버에서 검증). 수정된 content 반환.
 */
export async function updateMyContent(input: UpdateMyContentInput): Promise<Content> {
  const { data, error } = await supabase.rpc('update_my_content', {
    p_content_id: input.contentId,
    p_title: input.title,
    p_poster_url: input.posterUrl ?? null,
    p_platform: input.platform ?? null,
    p_release_year: input.releaseYear ?? null,
  })
  if (error) { console.error('[update_my_content]', error); throw error }
  const content = data as Content
  // 캐시 반영 (즉시 표시)
  cache.contents = cache.contents.map((c: any) => c.id === content.id ? content : c)
  return content
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
