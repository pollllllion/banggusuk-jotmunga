import { useNavigate } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { HeartIcon, CommentIcon, EyeIcon } from '@/components/ui/Icons'
import { ExpertTag } from '@/components/profile/ExpertTag'
import { LevelTag } from '@/components/profile/LevelTag'
import { TYPE_EMOJIS, TYPE_LABELS } from '@/utils/constants'
import { timeAgo, scoreColor } from '@/utils/helpers'
import type { Content, Discussion } from '@/types'

/** 게시판 한 줄 (디시 목록 스타일). showContent=true면 작품 태그도 표시(전체 게시판). */
export function DiscussionRow({ post, content, showContent, rank, onOpen }: {
  post: Discussion
  content: Content
  showContent?: boolean
  /** 인기글 섹션에서 매기는 순위 (1부터). 없으면 순위 배지를 안 그린다 */
  rank?: number
  onOpen: () => void
}) {
  const navigate = useNavigate()
  const isGuest = !!post.guestName
  const author = isGuest ? post.guestName : (DS.getUserById(post.authorId || '')?.nickname || '탈퇴한 사용자')
  const commentCount = DS.countDiscussionComments(post.id)

  const goWork = (e: React.MouseEvent) => { e.stopPropagation(); navigate(`/content/${content.id}?tab=talk`) }
  // 고정닉(계정)만 강조·프로필 링크. 유동닉과 레거시 방문객 글은 회색 일반 표기.
  const isAccount = DS.isAccountId(post.authorId)
  const canProfile = isAccount
  const goProfile = (e: React.MouseEvent) => { e.stopPropagation(); if (canProfile) navigate(`/u/${post.authorId}`) }

  const title = post.title || post.body.slice(0, 40)
  // 짤 붙은 글은 목록에서 바로 티가 나게 (댓글 수처럼 작은 표시)
  const hasMedia = !!post.images?.length

  // 인기글 섹션 — 순위 차트. 아래 목록과 같은 글이라도 생김새를 달리해서 중복감을 줄인다.
  if (rank != null) {
    return (
      <div className="disc-row disc-row-rank" onClick={onOpen}>
        <span className={`disc-rank ${rank <= 3 ? 'top' : ''}`}>{rank}</span>
        <span className="disc-row-title">
          {post.spoiler && <span className="disc-spoiler-tag">스포</span>} {title}
          {hasMedia && <span className="disc-media-tag" title="짤 첨부">🖼</span>}
        </span>
        <span className="disc-rank-meta">
          <span className="disc-rank-work" title={`${content.title} 작품방으로 이동`} onClick={goWork}>{content.title}</span>
          <Stats post={post} commentCount={commentCount} />
        </span>
      </div>
    )
  }

  return (
    <div className="disc-row" onClick={onOpen}>
      {showContent && (
        <span className={`disc-row-badge type-badge type-${content.type}`} title={TYPE_LABELS[content.type]}>
          {TYPE_EMOJIS[content.type]}
        </span>
      )}
      {/* 별점 자리는 없어도 비워둔다 — 있고 없고에 따라 제목 시작점이 흔들리지 않게 */}
      <span className="disc-row-rating">
        {post.rating != null && (
          <span className="disc-rating-pill" style={{ color: scoreColor(post.rating) }}>★ {post.rating}</span>
        )}
      </span>
      <span className="disc-row-title">
        {post.spoiler && <span className="disc-spoiler-tag">스포</span>} {title}
        {hasMedia && <span className="disc-media-tag" title="짤 첨부">🖼</span>}
      </span>
      <ExpertTag authorId={post.authorId} type={content.type} />
      <Stats post={post} commentCount={commentCount} />
      <span className="disc-row-meta">
        {showContent && (
          <span className="disc-row-work" title={`${content.title} 작품방으로 이동`} onClick={goWork}>{content.title}</span>
        )}
        <span className="disc-writer">
          <LevelTag authorId={post.authorId} />
          <span
            className={`disc-author ${isAccount ? '' : 'guest'} ${canProfile ? 'linkable' : ''}`}
            onClick={goProfile}>
            {author}
          </span>
        </span>
        <span className="disc-time">{timeAgo(post.createdAt)}</span>
      </span>
    </div>
  )
}

/** 추천·댓글·조회 — 0인 항목은 그리지 않는다 (전부 0이면 아예 안 보임). */
function Stats({ post, commentCount }: { post: Discussion; commentCount: number }) {
  const likes = post.likes.length
  const views = post.views || 0
  if (!likes && !commentCount && !views) return null
  return (
    <span className="disc-row-counts">
      {likes > 0 && <span className="disc-row-stat"><HeartIcon filled={false} size={12} /> {likes}</span>}
      {commentCount > 0 && <span className="disc-row-stat"><CommentIcon /> {commentCount}</span>}
      {views > 0 && <span className="disc-row-stat"><EyeIcon size={12} /> {views}</span>}
    </span>
  )
}
