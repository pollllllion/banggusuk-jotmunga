import { useNavigate } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { HeartIcon, CommentIcon } from '@/components/ui/Icons'
import { TYPE_EMOJIS, TYPE_LABELS } from '@/utils/constants'
import { timeAgo } from '@/utils/helpers'
import type { Content, Discussion } from '@/types'

/** 게시판 한 줄 (디시 목록 스타일). showContent=true면 작품 태그도 표시(전체 게시판). */
export function DiscussionRow({ post, content, showContent, onOpen }: {
  post: Discussion
  content: Content
  showContent?: boolean
  onOpen: () => void
}) {
  const navigate = useNavigate()
  const isGuest = !!post.guestName
  const author = isGuest ? post.guestName : (DS.getUserById(post.authorId || '')?.nickname || '탈퇴한 사용자')
  const commentCount = DS.countDiscussionComments(post.id)

  const goWork = (e: React.MouseEvent) => { e.stopPropagation(); navigate(`/content/${content.id}?tab=talk`) }

  return (
    <div className="disc-row" onClick={onOpen}>
      {showContent && (
        <span className={`disc-row-badge type-badge type-${content.type}`}>{TYPE_EMOJIS[content.type]} {TYPE_LABELS[content.type]}</span>
      )}
      <span className="disc-row-title">{post.title || post.body.slice(0, 40)}</span>
      <span className="disc-row-counts">
        <span className="disc-row-stat"><HeartIcon filled={false} size={12} /> {post.likes.length || 0}</span>
        <span className="disc-row-stat"><CommentIcon /> {commentCount}</span>
      </span>
      <span className="disc-row-meta">
        {showContent && (
          <span className="disc-row-work" title={`${content.title} 작품방으로 이동`} onClick={goWork}>{content.title}</span>
        )}
        <span className="disc-author">{author}</span>
        <span className="disc-time">{timeAgo(post.createdAt)}</span>
      </span>
    </div>
  )
}
