/**
 * 리뷰(reviews) + 리뷰 댓글(comments).
 *
 * 리뷰 작성 UI 는 토론글로 통합됐지만(=> discussions), 기존 데이터와
 * 작품 상세의 리뷰 목록이 아직 이 테이블을 쓴다.
 * 평점 재집계는 별점을 단 토론글 기준이라 discussions.ts 의 recomputeContentRating 을 부른다.
 */
import { supabase } from '@/lib/supabaseClient'
import { uuid } from '@/utils/helpers'
import type { Review, Comment } from '@/types'
import { cache, load, store } from './cache'
import { recomputeContentRating } from './discussions'

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

// ── Comments (리뷰 댓글) ────────────────────────────────────
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
