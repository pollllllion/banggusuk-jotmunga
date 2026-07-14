import { useNavigate } from 'react-router-dom'
import { ScorePill } from '@/components/ui/Score'
import { ThumbUpIcon, CommentIcon, EyeIcon } from '@/components/ui/Icons'
import { timeAgo } from '@/utils/helpers'
import * as DS from '@/api/dataService'
import type { Review } from '@/types'

/** 자유게시판 형식의 리뷰 목록 (포스터 그리드 대체) */
export function ReviewBoard({ reviews }: { reviews: Review[] }) {
  const navigate = useNavigate()

  return (
    <div className="board-list fade-in">
      <div className="board-head">
        <span className="bh-title">제목</span>
        <span className="bh-author">글쓴이</span>
        <span className="bh-score">평점</span>
        <span className="bh-stat">추천</span>
        <span className="bh-stat">조회</span>
      </div>
      {reviews.map(r => {
        const content = DS.getContentById(r.contentId)
        const authorName = r.guestName || DS.getUserById(r.authorId || '')?.nickname || '탈퇴회원'
        const commentCount = DS.getComments().filter(c => c.reviewId === r.id).length
        return (
          <div key={r.id} className="board-row" onClick={() => navigate(`/review/${r.id}`)}>
            <div className="br-title">
              {content && <span className="br-tag">🎬 {content.title}</span>}
              <span className="br-subject">{r.title}</span>
              {r.spoiler && <span className="spoiler-tag">스포</span>}
              {commentCount > 0 && <span className="br-comment"><CommentIcon /> {commentCount}</span>}
            </div>
            <span className="br-author">{authorName}</span>
            <span className="br-score"><ScorePill score={r.rating} /></span>
            <span className="br-stat"><ThumbUpIcon /> {r.likes.length}</span>
            <span className="br-stat"><EyeIcon /> {r.views}</span>
            <span className="br-time">{timeAgo(r.createdAt)}</span>
          </div>
        )
      })}
    </div>
  )
}
