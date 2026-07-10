import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { ScoreBadge, Stars } from '@/components/ui/Score'
import { BackIcon, FlagIcon, ShareIcon, ThumbUpIcon, ThumbDownIcon } from '@/components/ui/Icons'
import { TYPE_LABELS } from '@/utils/constants'
import { timeAgo, scoreLabel } from '@/utils/helpers'
import type { Comment as CommentType } from '@/types'

export function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { openReportModal } = useUIStore()
  const toast = useToastStore(s => s.show)
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)
  const [commentText, setCommentText] = useState('')
  const [revealSpoiler, setRevealSpoiler] = useState(false)

  const reviews = DS.getReviews()
  const review = reviews.find(r => r.id === id)
  if (!review) { navigate('/'); return null }

  const content = DS.getContentById(review.contentId)

  // 조회수 증가
  review.views++; DS.saveReviews(reviews)

  const allComments = DS.getComments().filter(c => c.reviewId === review.id)
  const topComments = allComments.filter(c => !c.parentId)
  const isOwner = review.authorId === user?.id
  const isLiked = user ? review.likes.includes(user.id) : false
  const isDisliked = user ? review.dislikes.includes(user.id) : false
  const reported = user ? DS.hasReported(user.id, 'review', review.id) : false
  const authorLabel = isOwner ? '나' : (review.authorId === 'deleted' ? '탈퇴한 사용자' : DS.getUserById(review.authorId)?.nickname || '익명')

  const toggleLike = () => {
    if (!user) return
    const di = review.dislikes.indexOf(user.id)
    if (di >= 0) review.dislikes.splice(di, 1)
    const i = review.likes.indexOf(user.id)
    if (i >= 0) review.likes.splice(i, 1)
    else { review.likes.push(user.id); DS.createNotification({ userId: review.authorId, type: 'like', reviewId: review.id, message: '누군가 회원님의 리뷰에 공감했습니다.' }) }
    DS.saveReviews(reviews); rerender()
  }

  const toggleDislike = () => {
    if (!user) return
    const li = review.likes.indexOf(user.id)
    if (li >= 0) review.likes.splice(li, 1)
    const i = review.dislikes.indexOf(user.id)
    if (i >= 0) review.dislikes.splice(i, 1)
    else review.dislikes.push(user.id)
    DS.saveReviews(reviews); rerender()
  }

  const handleDelete = () => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    DS.deleteReview(review.id); toast('리뷰가 삭제되었습니다.'); navigate('/')
  }

  const handleShare = () => {
    const url = `${location.origin}/review/${review.id}`
    navigator.clipboard?.writeText(url).then(() => toast('링크가 복사되었습니다.'))
  }

  const handleBlock = (blockedId: string) => {
    if (!user || !confirm('이 사용자를 차단하시겠습니까?\n\n차단하면 해당 사용자의 리뷰와 댓글이 보이지 않습니다.')) return
    DS.blockUser(user.id, blockedId); toast('사용자를 차단했습니다.'); navigate('/')
  }

  const addComment = () => {
    if (!user || !commentText.trim()) return
    DS.createComment({ reviewId: review.id, authorId: user.id, parentId: null, content: commentText.trim() })
    DS.createNotification({ userId: review.authorId, type: 'comment', reviewId: review.id, message: '누군가 회원님의 리뷰에 댓글을 남겼습니다.' })
    setCommentText(''); toast('댓글이 등록되었습니다.'); rerender()
  }

  const showBody = !review.spoiler || revealSpoiler || isOwner

  return (
    <>
      <div className="back-btn" onClick={() => navigate(-1)}><BackIcon /> 뒤로</div>
      <div className="review-detail fade-in">
        {content && (
          <div className="content-ref-card" onClick={() => navigate(`/content/${content.id}`)}>
            <div style={{ width: 46, flexShrink: 0 }}><Poster content={content} showScore={false} /></div>
            <div className="info">
              <span className={`type-badge type-${content.type}`}>{TYPE_LABELS[content.type]}</span>
              <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{content.title}</div>
              <div style={{ fontSize: 12, color: 'var(--subtext)' }}>
                {content.creators.join(', ')}{content.releaseYear ? ` · ${content.releaseYear}` : ''}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <ScoreBadge score={review.rating} size={26} />
          <Stars score={review.rating} size={18} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{scoreLabel(review.rating)}</span>
        </div>

        <h1 className="review-detail-title">{review.title}</h1>
        <div className="review-detail-meta">
          <span className="author">{authorLabel}</span>
          <span>·</span><span>{timeAgo(review.createdAt)}</span>
          <span>·</span><span>조회 {review.views}</span>
          {review.updatedAt && <span>· 수정됨</span>}
        </div>

        {review.tags.length > 0 && (
          <div className="tag-chips" style={{ marginTop: 12 }}>
            {review.tags.map(t => <span key={t} className="tag-chip readonly">{t}</span>)}
          </div>
        )}

        {showBody ? (
          <div className="review-detail-body">{review.body}</div>
        ) : (
          <div className="spoiler-cover" onClick={() => setRevealSpoiler(true)}>
            ⚠️ 스포일러가 포함된 리뷰입니다
            <small>클릭하면 내용을 표시합니다</small>
          </div>
        )}

        <div className="review-detail-actions">
          <button className={`btn-like ${isLiked ? 'active' : ''}`} onClick={toggleLike}>
            <ThumbUpIcon filled={isLiked} /> 공감 {review.likes.length}
          </button>
          <button className={`btn-dislike ${isDisliked ? 'active' : ''}`} onClick={toggleDislike}>
            <ThumbDownIcon filled={isDisliked} /> 비공감 {review.dislikes.length}
          </button>
          <button className="btn-text btn-small" onClick={handleShare}><ShareIcon /> 공유</button>
          {!isOwner && review.authorId !== 'deleted' && (
            <>
              <button className="btn-text btn-small" onClick={() => openReportModal('review', review.id)} disabled={reported} style={reported ? { opacity: 0.4 } : {}}>
                <FlagIcon /> {reported ? '신고완료' : '신고'}
              </button>
              <button className="btn-text btn-small" onClick={() => handleBlock(review.authorId)}>차단</button>
            </>
          )}
          {isOwner && (
            <div className="review-owner-actions">
              <button className="btn btn-secondary btn-small" onClick={() => navigate(`/review/edit/${review.id}`)}>수정</button>
              <button className="btn btn-danger btn-small" onClick={handleDelete}>삭제</button>
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="comments-section">
          <div className="comments-title">댓글 <span>{allComments.length}</span></div>
          <div className="comment-input-area">
            <textarea placeholder="댓글을 입력하세요..." value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() } }} />
            <button className="btn btn-primary btn-small" onClick={addComment}>등록</button>
          </div>
          <div>
            {topComments.map(c => (
              <CommentItem key={c.id} comment={c} allComments={allComments} reviewAuthorId={review.authorId} reviewId={review.id} rerender={rerender} />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function CommentItem({ comment: c, allComments, reviewAuthorId, reviewId, rerender }: { comment: CommentType; allComments: CommentType[]; reviewAuthorId: string; reviewId: string; rerender: () => void }) {
  const { user } = useAuthStore()
  const { openReportModal } = useUIStore()
  const toast = useToastStore(s => s.show)
  const [showReply, setShowReply] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(c.content)

  const isOwner = c.authorId === user?.id
  const blocked = user && !isOwner && DS.isBlocked(user.id, c.authorId)
  const isLiked = user ? c.likes.includes(user.id) : false
  const replies = allComments.filter(x => x.parentId === c.id)
  const isOP = c.authorId === reviewAuthorId
  const reported = user ? DS.hasReported(user.id, 'comment', c.id) : false
  const displayName = c.authorId === 'deleted' ? '탈퇴한 사용자' : isOwner ? '나' : isOP ? '리뷰어' : (DS.getUserById(c.authorId)?.nickname || '익명')

  if (blocked) {
    return (
      <>
        <div className={`comment-item ${c.parentId ? 'reply' : ''}`} style={{ opacity: 0.5 }}>
          <div className="comment-body" style={{ fontStyle: 'italic', color: 'var(--subtext)', fontSize: 13 }}>차단된 사용자의 댓글입니다.</div>
        </div>
        {replies.map(r => <CommentItem key={r.id} comment={r} allComments={allComments} reviewAuthorId={reviewAuthorId} reviewId={reviewId} rerender={rerender} />)}
      </>
    )
  }

  const toggleLike = () => {
    if (!user) return
    const comments = DS.getComments()
    const target = comments.find(x => x.id === c.id)
    if (!target) return
    const i = target.likes.indexOf(user.id)
    if (i >= 0) target.likes.splice(i, 1); else target.likes.push(user.id)
    DS.saveComments(comments); rerender()
  }

  const addReply = () => {
    if (!user || !replyText.trim()) return
    DS.createComment({ reviewId, authorId: user.id, parentId: c.id, content: replyText.trim() })
    DS.createNotification({ userId: c.authorId, type: 'reply', reviewId, message: '누군가 회원님의 댓글에 답글을 남겼습니다.' })
    setReplyText(''); setShowReply(false); toast('답글이 등록되었습니다.'); rerender()
  }

  const handleDelete = () => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return
    DS.deleteComment(c.id); toast('댓글이 삭제되었습니다.'); rerender()
  }

  const saveEdit = () => {
    if (!editText.trim()) { toast('댓글 내용을 입력하세요.'); return }
    DS.updateComment(c.id, { content: editText.trim() }); setEditing(false); toast('댓글이 수정되었습니다.'); rerender()
  }

  return (
    <>
      <div className={`comment-item ${c.parentId ? 'reply' : ''}`}>
        <div className="comment-header">
          <span className={`comment-author ${isOP ? 'is-op' : ''}`}>{displayName}</span>
          {isOP && !isOwner && <span style={{ fontSize: 11, background: 'var(--primary-light)', color: 'var(--primary)', padding: '1px 6px', borderRadius: 4 }}>리뷰어</span>}
          <span className="comment-time">{timeAgo(c.createdAt)}{c.updatedAt ? ' (수정됨)' : ''}</span>
        </div>
        {editing ? (
          <>
            <textarea className="form-input" value={editText} onChange={e => setEditText(e.target.value)} style={{ fontSize: 13, minHeight: 60, resize: 'vertical' }} />
            <div className="comment-actions">
              <button className="btn btn-primary btn-small" onClick={saveEdit}>저장</button>
              <button className="btn btn-secondary btn-small" onClick={() => setEditing(false)}>취소</button>
            </div>
          </>
        ) : (
          <>
            <div className="comment-body">{c.content}</div>
            <div className="comment-actions">
              <button className="btn-text btn-small" onClick={toggleLike} style={isLiked ? { color: 'var(--primary)' } : {}}>
                ♥ {c.likes.length || ''}
              </button>
              {!c.parentId && <button className="btn-text btn-small" onClick={() => setShowReply(!showReply)}>답글</button>}
              {!isOwner && c.authorId !== 'deleted' && (
                <button className="btn-text btn-small" onClick={() => openReportModal('comment', c.id)} disabled={reported}>
                  {reported ? '신고완료' : '신고'}
                </button>
              )}
              {isOwner && <button className="btn-text btn-small" onClick={() => { setEditing(true); setEditText(c.content) }}>수정</button>}
              {isOwner && <button className="btn-text btn-small btn-danger" onClick={handleDelete}>삭제</button>}
            </div>
          </>
        )}
        {showReply && (
          <div className="reply-input-area">
            <textarea placeholder="답글을 입력하세요..." value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addReply() } }} />
            <button className="btn btn-primary btn-small" onClick={addReply}>등록</button>
          </div>
        )}
      </div>
      {replies.map(r => <CommentItem key={r.id} comment={r} allComments={allComments} reviewAuthorId={reviewAuthorId} reviewId={reviewId} rerender={rerender} />)}
    </>
  )
}
