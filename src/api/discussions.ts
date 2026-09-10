/**
 * 방구석 토론방 — 토론글(discussions) + 그 댓글(discussion_comments) + 유동닉 비번 RPC.
 *
 * 작품 평점(avgRating/reviewCount)은 별점을 단 토론글에서 집계한다 → recomputeContentRating.
 * (contents 캐시를 직접 손대므로 contents.ts 를 import 하지 않는다 — 순환 참조 방지)
 */
import { supabase } from '@/lib/supabaseClient'
import { uuid } from '@/utils/helpers'
import type { Discussion, DiscussionBoard, DiscussionComment, NotificationType } from '@/types'
import { cache, load, store, SaveFailedError } from './cache'
import { buildNotification, insertNotifications } from './social'
import { getUserById } from './users'
import { commentNotifyTargets, likeNotifyTarget, postLabel } from '@/utils/notify'

export function getDiscussions(): Discussion[] { return load('discussions') }
export function saveDiscussions(d: Discussion[]) { return store('discussions', d) }

/** 게시판별 글 — board 컬럼이 없던 시절 글(undefined)은 전부 방구석토론방 글로 친다. */
export function getDiscussionsByBoard(board: DiscussionBoard): Discussion[] {
  return getDiscussions().filter(d => (d.board || 'talk') === board)
}

export function getDiscussionsByContent(contentId: string): Discussion[] {
  return getDiscussions()
    .filter(d => d.contentId === contentId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getDiscussionsByAuthor(authorId: string): Discussion[] {
  return getDiscussions().filter(d => d.authorId === authorId)
}

/** 이 작성자가 이 작품에 이미 별점을 매겼는지 — 1작품 1별점 중복 방지용. */
export function getUserRatingForContent(userId: string, contentId: string): Discussion | undefined {
  return getDiscussions().find(d => d.authorId === userId && d.contentId === contentId && d.rating != null)
}

/** 평점 재집계 — 별점 단 토론글에서 집계한다. 캐시만 갱신(즉시 표시용).
 *  avgRating = 별점 평균, reviewCount = 별점 단 글 수. (DB 는 트리거가 맞춘다)
 *  자유방 글은 작품이 없어 null 이 들어온다 — DB 쪽 함수와 마찬가지로 조용히 넘긴다. */
export function recomputeContentRating(contentId: string | null | undefined) {
  if (!contentId) return
  const rated = getDiscussions().filter(d => d.contentId === contentId && d.rating != null)
  const count = rated.length
  const avg = count ? Math.round((rated.reduce((s, d) => s + (d.rating || 0), 0) / count) * 10) / 10 : 0
  const idx = cache.contents.findIndex((c: any) => c.id === contentId)
  if (idx >= 0) {
    const next = [...cache.contents]
    next[idx] = { ...cache.contents[idx], avgRating: avg, reviewCount: count }
    cache.contents = next
  }
}

/**
 * 토론글 작성.
 *
 * **서버 저장을 기다린다.** 예전엔 캐시에만 넣고 바로 돌려줘서, 저장이 실패해도
 * "글을 올렸어요!" 가 뜨고 사용자는 새로고침하고 나서야 글이 없어진 걸 알았다.
 * 실패하면 낙관적으로 넣었던 캐시를 되돌리고 SaveFailedError 를 던진다.
 */
export async function createDiscussion(data: Partial<Discussion>): Promise<Discussion> {
  const d: Discussion = { id: uuid(), likes: [], createdAt: new Date().toISOString(), ...data } as Discussion
  const prev = getDiscussions()
  const res = await saveDiscussions([d, ...prev])
  if (!res.ok) { cache.discussions = prev; throw new SaveFailedError(res.error) }
  if (d.rating != null) recomputeContentRating(d.contentId)
  return d
}

/** 토론글 조회수 +1 — 서버 RPC (남의 글도 올려야 하므로).
 *  migration_discussion_views 미적용이면 조용히 무시된다(인기글은 추천·댓글만으로 계산). */
export async function incrementDiscussionViews(id: string) {
  const ds = getDiscussions()
  const idx = ds.findIndex(d => d.id === id)
  if (idx >= 0) {
    const next = [...ds]; next[idx] = { ...ds[idx], views: (ds[idx].views || 0) + 1 }
    cache.discussions = next
  }
  try { await supabase.rpc('increment_discussion_views', { p_discussion_id: id }) }
  catch (e) { console.error('[increment_discussion_views]', e) }
}

/** 수다방 공감 토글 — 서버 RPC로 처리(추천=로그인만), 캐시는 낙관적 갱신 */
export async function toggleDiscussionLike(id: string, userId: string): Promise<void> {
  const ds = getDiscussions()
  const idx = ds.findIndex(d => d.id === id)
  if (idx >= 0) {
    const cur = ds[idx]
    const turningOn = !cur.likes.includes(userId)
    const likes = turningOn ? [...cur.likes, userId] : cur.likes.filter(u => u !== userId)
    const next = [...ds]; next[idx] = { ...cur, likes }; cache.discussions = next
    if (turningOn) notifyLike(cur.authorId, userId, cur, '글')
  }
  try { await supabase.rpc('toggle_discussion_like', { p_discussion_id: id }) }
  catch (e) { console.error('[toggle_discussion_like]', e) }
}

/** 토론글 삭제. 서버에서 지워진 걸 확인한 뒤에야 캐시에서 뺀다 —
 *  "지웠습니다" 를 띄웠는데 새로고침하면 되살아나는 일이 없게. */
export async function deleteDiscussion(id: string): Promise<void> {
  const prev = getDiscussions()
  const post = prev.find(d => d.id === id)
  const res = await saveDiscussions(prev.filter(d => d.id !== id))
  if (!res.ok) { cache.discussions = prev; throw new SaveFailedError(res.error) }
  // 딸린 댓글도 캐시에서 제거(서버는 FK on delete cascade)
  cache.discussion_comments = cache.discussion_comments.filter((c: any) => c.discussionId !== id)
  if (post && post.rating != null) recomputeContentRating(post.contentId)
}

/** 토론글 수정 (본문·제목·별점·스포일러·첨부). 별점 바뀌면 작품 평점 재집계.
 *  고정닉(계정) 글 전용 — RLS 상 본인/관리자만 update 가 통과한다. */
export async function updateDiscussion(id: string, updates: Partial<Discussion>): Promise<Discussion | null> {
  const ds = getDiscussions()
  const idx = ds.findIndex(d => d.id === id)
  if (idx < 0) return null
  const updated = { ...ds[idx], ...updates, updatedAt: new Date().toISOString() }
  const next = [...ds]; next[idx] = updated
  const res = await saveDiscussions(next)
  if (!res.ok) { cache.discussions = ds; throw new SaveFailedError(res.error) }
  recomputeContentRating(updated.contentId)
  return updated
}

// ── 유동닉(게스트) 글 — 비번 검증은 전부 서버에서 ──────────
/** 유동닉 글 비번 확인 — 수정 화면에 들어가기 전 게이트 */
export async function verifyGuestPost(table: 'reviews' | 'discussions' | 'comments' | 'discussion_comments', id: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_guest_post', { p_table: table, p_id: id, p_password: password })
  if (error) { console.error('[verify_guest_post]', error); return false }
  return data === true
}

/** 유동닉 토론글 수정 — 서버에서 비번 검증(RLS 상 anon 은 직접 update 불가).
 *  성공하면 캐시만 직접 손본다 (persist 를 타면 막힌 upsert 가 한 번 더 나간다). */
export async function updateGuestDiscussion(
  id: string,
  password: string,
  patch: { title: string; body: string; bodyHtml: string | null; rating: number | null; spoiler: boolean; images: string[] },
): Promise<boolean> {
  const { data, error } = await supabase.rpc('update_guest_discussion', {
    p_id: id, p_password: password,
    p_title: patch.title, p_body: patch.body, p_body_html: patch.bodyHtml,
    p_rating: patch.rating, p_spoiler: patch.spoiler, p_images: patch.images,
  })
  if (error) { console.error('[update_guest_discussion]', error); return false }
  if (data !== true) return false

  const ds = getDiscussions()
  const idx = ds.findIndex(d => d.id === id)
  if (idx >= 0) {
    const next = [...ds]
    next[idx] = { ...ds[idx], ...patch, updatedAt: new Date().toISOString() }
    cache.discussions = next
    recomputeContentRating(next[idx].contentId)
  }
  return true
}

/** 유동닉 글 삭제 — 서버에서 비번 검증(bcrypt). 성공 시 true, 비번 틀리면 false */
export async function deleteGuestPost(table: 'reviews' | 'discussions' | 'comments' | 'discussion_comments', id: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_guest_post', { p_table: table, p_id: id, p_password: password })
  if (error) { console.error('[delete_guest_post]', error); return false }
  if (data === true) {
    cache[table] = cache[table].filter((r: any) => r.id !== id)
  }
  return data === true
}

// ── 알림 ────────────────────────────────────────────────────
/**
 * 토론방·자유방에서 나가는 알림.
 * 누구에게 갈지는 utils/notify.ts 가 정한다(순수 함수 · 테스트로 고정).
 * 여기서는 표시명을 붙여 행으로 만들어 넣기만 한다.
 *
 * 넣기 실패는 조용히 넘어간다 — 알림은 곁다리고, 글·댓글은 이미 저장된 뒤다.
 */

/** 행동한 사람의 표시명 — 유동닉이면 그 닉, 계정이면 프로필 닉 */
function actorName(authorId: string | null | undefined, guestName?: string | null): string {
  if (guestName) return guestName
  return getUserById(authorId || '')?.nickname || '누군가'
}

function sendTargets(targets: { userId: string; type: NotificationType; message: string }[], postId: string) {
  void insertNotifications(targets.map(t => buildNotification(t.userId, t.type, postId, t.message)))
}

function notifyDiscussionComment(post: Discussion, comment: DiscussionComment) {
  sendTargets(commentNotifyTargets({
    postAuthorId: post.authorId,
    commenterId: comment.authorId,
    participantIds: getDiscussionCommentsByPost(post.id).map(c => c.authorId),
    label: postLabel(post.title, post.body),
    actor: actorName(comment.authorId, comment.guestName),
  }), post.id)
}

/** 추천 알림 — 켤 때만 보낸다(껐다 켰다를 알림으로 만들지 않는다). 추천은 로그인 전용. */
function notifyLike(targetAuthorId: string | null | undefined, actorId: string, post: Discussion, what: '글' | '댓글') {
  const target = likeNotifyTarget({
    targetAuthorId, actorId,
    actor: actorName(actorId),
    label: postLabel(post.title, post.body),
    what,
  })
  if (target) sendTargets([target], post.id)
}

// ── Discussion Comments (게시글 댓글) ───────────────────────
export function getDiscussionComments(): DiscussionComment[] { return load('discussion_comments') }
export function saveDiscussionComments(c: DiscussionComment[]) { return store('discussion_comments', c) }

export function getDiscussionCommentsByPost(discussionId: string): DiscussionComment[] {
  return getDiscussionComments()
    .filter(c => c.discussionId === discussionId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

export function countDiscussionComments(discussionId: string): number {
  // 삭제 표시만 남은 자리는 세지 않는다 — 목록의 [3] 은 '읽을 것이 몇 개인가'다
  return getDiscussionComments().filter(c => c.discussionId === discussionId && !c.deleted).length
}

/** 댓글 작성 — 글과 같은 이유로 서버 저장을 기다린다(실패 시 롤백 + throw). */
export async function createDiscussionComment(data: Partial<DiscussionComment>): Promise<DiscussionComment> {
  const c: DiscussionComment = { id: uuid(), likes: [], createdAt: new Date().toISOString(), ...data } as DiscussionComment
  const prev = getDiscussionComments()
  const res = await saveDiscussionComments([...prev, c])
  if (!res.ok) { cache.discussion_comments = prev; throw new SaveFailedError(res.error) }
  const post = getDiscussions().find(d => d.id === c.discussionId)
  if (post) notifyDiscussionComment(post, c)
  return c
}

/** 이 댓글에 달린 답글이 하나라도 있나 — 지울 때 행을 남길지 정하는 기준 */
export function hasReplies(commentId: string): boolean {
  return getDiscussionComments().some(c => c.parentId === commentId)
}

/**
 * 댓글 삭제 (고정닉·관리자).
 *
 * 답글이 달려 있으면 **행을 남기고 본문만 비운다** — 화면에는 "삭제된 댓글입니다" 가 뜨고
 * 답글은 원래 자리에 그대로 붙어 있다. 행째로 지우면 남이 쓴 답글이 맥락을 잃는다
 * (부모 없는 답글이 원댓글 자리로 올라와 혼자 딴소리를 한다).
 * 답글이 없으면 빈 자리를 남길 이유가 없으므로 예전처럼 진짜로 지운다.
 */
export async function deleteDiscussionComment(id: string): Promise<void> {
  const prev = getDiscussionComments()
  const next = hasReplies(id)
    ? prev.map(c => (c.id === id ? { ...c, body: '', deleted: true } : c))
    : prev.filter(c => c.id !== id)
  const res = await saveDiscussionComments(next)
  if (!res.ok) { cache.discussion_comments = prev; throw new SaveFailedError(res.error) }
}

/** 유동닉 댓글 삭제 표시 — 비번 확인은 서버 RPC 가 한다(유동닉 행은 RLS update 가 막는다) */
export async function softDeleteGuestDiscussionComment(id: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('soft_delete_guest_discussion_comment', { p_id: id, p_password: password })
  if (error) { console.error('[soft_delete_guest_discussion_comment]', error); return false }
  if (data === true) {
    cache.discussion_comments = cache.discussion_comments.map((c: DiscussionComment) =>
      c.id === id ? { ...c, body: '', deleted: true } : c)
  }
  return data === true
}

/** 댓글 수정 (본문만) — 고정닉 글 전용. RLS 상 본인/관리자만 통과한다. */
export async function updateDiscussionComment(id: string, body: string): Promise<void> {
  const cs = getDiscussionComments()
  const idx = cs.findIndex(c => c.id === id)
  if (idx < 0) return
  const next = [...cs]
  next[idx] = { ...cs[idx], body, updatedAt: new Date().toISOString() }
  const res = await saveDiscussionComments(next)
  if (!res.ok) { cache.discussion_comments = cs; throw new SaveFailedError(res.error) }
}

/** 유동닉 댓글 수정 — 서버에서 비번 검증. 성공 시 캐시만 직접 손본다. */
export async function updateGuestDiscussionComment(id: string, password: string, body: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('update_guest_discussion_comment', { p_id: id, p_password: password, p_body: body })
  if (error) { console.error('[update_guest_discussion_comment]', error); return false }
  if (data !== true) return false

  const cs = getDiscussionComments()
  const idx = cs.findIndex(c => c.id === id)
  if (idx >= 0) {
    const next = [...cs]
    next[idx] = { ...cs[idx], body, updatedAt: new Date().toISOString() }
    cache.discussion_comments = next
  }
  return true
}

/** 게시글 댓글 공감 토글 — 서버 RPC(추천=로그인만), 캐시 낙관적 갱신 */
export async function toggleDiscussionCommentLike(id: string, userId: string): Promise<void> {
  const cs = getDiscussionComments()
  const idx = cs.findIndex(c => c.id === id)
  if (idx >= 0) {
    const cur = cs[idx]
    const turningOn = !cur.likes.includes(userId)
    const likes = turningOn ? [...cur.likes, userId] : cur.likes.filter(u => u !== userId)
    const next = [...cs]; next[idx] = { ...cur, likes }; cache.discussion_comments = next
    // 알림 링크는 댓글이 달린 글로 보낸다(댓글만 가리키는 주소가 없다)
    const post = turningOn ? getDiscussions().find(d => d.id === cur.discussionId) : undefined
    if (post) notifyLike(cur.authorId, userId, post, '댓글')
  }
  try { await supabase.rpc('toggle_discussion_comment_like', { p_comment_id: id }) }
  catch (e) { console.error('[toggle_discussion_comment_like]', e) }
}
