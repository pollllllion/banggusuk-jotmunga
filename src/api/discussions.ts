/**
 * 방구석 토론방 — 토론글(discussions) + 그 댓글(discussion_comments) + 유동닉 비번 RPC.
 *
 * 작품 평점(avgRating/reviewCount)은 별점을 단 토론글에서 집계한다 → recomputeContentRating.
 * (contents 캐시를 직접 손대므로 contents.ts 를 import 하지 않는다 — 순환 참조 방지)
 */
import { supabase } from '@/lib/supabaseClient'
import { uuid } from '@/utils/helpers'
import type { Discussion, DiscussionBoard, DiscussionComment } from '@/types'
import { cache, load, store } from './cache'

export function getDiscussions(): Discussion[] { return load('discussions') }
export function saveDiscussions(d: Discussion[]) { store('discussions', d) }

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

export function createDiscussion(data: Partial<Discussion>): Discussion {
  const d: Discussion = { id: uuid(), likes: [], createdAt: new Date().toISOString(), ...data } as Discussion
  saveDiscussions([d, ...getDiscussions()])
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
    const likes = cur.likes.includes(userId) ? cur.likes.filter(u => u !== userId) : [...cur.likes, userId]
    const next = [...ds]; next[idx] = { ...cur, likes }; cache.discussions = next
  }
  try { await supabase.rpc('toggle_discussion_like', { p_discussion_id: id }) }
  catch (e) { console.error('[toggle_discussion_like]', e) }
}

export function deleteDiscussion(id: string): void {
  const post = getDiscussions().find(d => d.id === id)
  saveDiscussions(getDiscussions().filter(d => d.id !== id))
  // 딸린 댓글도 캐시에서 제거(서버는 FK on delete cascade)
  cache.discussion_comments = cache.discussion_comments.filter((c: any) => c.discussionId !== id)
  if (post && post.rating != null) recomputeContentRating(post.contentId)
}

/** 토론글 수정 (본문·제목·별점·스포일러·첨부). 별점 바뀌면 작품 평점 재집계.
 *  고정닉(계정) 글 전용 — RLS 상 본인/관리자만 update 가 통과한다. */
export function updateDiscussion(id: string, updates: Partial<Discussion>): Discussion | null {
  const ds = getDiscussions()
  const idx = ds.findIndex(d => d.id === id)
  if (idx < 0) return null
  const updated = { ...ds[idx], ...updates, updatedAt: new Date().toISOString() }
  const next = [...ds]; next[idx] = updated
  saveDiscussions(next)
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

/** 댓글 수정 (본문만) — 고정닉 글 전용. RLS 상 본인/관리자만 통과한다. */
export function updateDiscussionComment(id: string, body: string): void {
  const cs = getDiscussionComments()
  const idx = cs.findIndex(c => c.id === id)
  if (idx < 0) return
  const next = [...cs]
  next[idx] = { ...cs[idx], body, updatedAt: new Date().toISOString() }
  saveDiscussionComments(next)
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
    const likes = cur.likes.includes(userId) ? cur.likes.filter(u => u !== userId) : [...cur.likes, userId]
    const next = [...cs]; next[idx] = { ...cur, likes }; cache.discussion_comments = next
  }
  try { await supabase.rpc('toggle_discussion_comment_like', { p_comment_id: id }) }
  catch (e) { console.error('[toggle_discussion_comment_like]', e) }
}
