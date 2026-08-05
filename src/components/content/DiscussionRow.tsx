import { useNavigate } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { HeartIcon, CommentIcon } from '@/components/ui/Icons'
import { ExpertTag } from '@/components/profile/ExpertTag'
import { TYPE_EMOJIS, TYPE_LABELS } from '@/utils/constants'
import { timeAgo, scoreColor } from '@/utils/helpers'
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
  const canProfile = !isGuest && !!post.authorId && post.authorId !== 'deleted'
  const goProfile = (e: React.MouseEvent) => { e.stopPropagation(); if (canProfile) navigate(`/u/${post.authorId}`) }

  return (
    <div className="disc-row" onClick={onOpen}>
      {showContent && (
        <span className={`disc-row-badge type-badge type-${content.type}`}>{TYPE_EMOJIS[content.type]} {TYPE_LABELS[content.type]}</span>
      )}
      {post.rating != null && (
        <span className="disc-rating-pill" style={{ background: scoreColor(post.rating) }}>★ {post.rating}</span>
      )}
      <span className="disc-row-title">
        {post.spoiler && <span className="disc-spoiler-tag">스포</span>} {post.title || post.body.slice(0, 40)}
      </span>
      <ExpertTag authorId={post.authorId} type={content.type} />
      <span className="disc-row-counts">
        <span className="disc-row-stat"><HeartIcon filled={false} size={12} /> {post.likes.length || 0}</span>
        <span className="disc-row-stat"><CommentIcon /> {commentCount}</span>
      </span>
      <span className="disc-row-meta">
        {showContent && (
          <span className="disc-row-work" title={`${content.title} 작품방으로 이동`} onClick={goWork}>{content.title}</span>
        )}
        <span className={`disc-author ${canProfile ? 'linkable' : ''}`} onClick={goProfile}>{author}</span>
        <span className="disc-time">{timeAgo(post.createdAt)}</span>
      </span>
    </div>
  )
}
