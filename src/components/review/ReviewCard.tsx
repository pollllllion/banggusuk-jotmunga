import { useNavigate } from 'react-router-dom'
import { ScorePill } from '@/components/ui/Score'
import { ThumbUpIcon, ThumbDownIcon, CommentIcon, EyeIcon } from '@/components/ui/Icons'
import { TYPE_LABELS } from '@/utils/constants'
import { timeAgo } from '@/utils/helpers'
import * as DS from '@/api/dataService'
import type { Review } from '@/types'

/** 리뷰 피드 카드. showContent=true면 어떤 작품 리뷰인지 표시 */
export function ReviewCard({ review, showContent = true }: { review: Review; showContent?: boolean }) {
  const navigate = useNavigate()
  const content = showContent ? DS.getContentById(review.contentId) : null
  const commentCount = DS.getComments().filter(c => c.reviewId === review.id).length

  return (
    <div className="review-card fade-in" onClick={() => navigate(`/review/${review.id}`)}>
      {content && (
        <div className="review-card-top">
          <span className={`type-badge type-${content.type}`}>{TYPE_LABELS[content.type]}</span>
          <span className="review-content-title">{content.title}</span>
        </div>
      )}
      <div className="review-card-title">
        <ScorePill score={review.rating} />
        <span>{review.title}</span>
        {review.spoiler && <span className="spoiler-tag">스포일러</span>}
      </div>
      {review.tags.length > 0 && (
        <div className="tag-chips" style={{ margin: '4px 0 8px' }}>
          {review.tags.slice(0, 4).map(t => <span key={t} className="tag-chip readonly">{t}</span>)}
        </div>
      )}
      <div className="review-card-body">{review.spoiler ? '⚠️ 스포일러가 포함된 리뷰입니다. 클릭해서 확인하세요.' : review.body}</div>
      <div className="review-card-footer">
        <span className="review-content-title">{timeAgo(review.createdAt)}</span>
        <span><ThumbUpIcon /> {review.likes.length}</span>
        <span><ThumbDownIcon /> {review.dislikes.length}</span>
        <span><CommentIcon /> {commentCount}</span>
        <span><EyeIcon /> {review.views}</span>
      </div>
    </div>
  )
}
