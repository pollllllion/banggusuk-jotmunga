import { useNavigate } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { LevelTag } from '@/components/profile/LevelTag'
import { timeAgo } from '@/utils/helpers'
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
          <Stats commentCount={commentCount} />
        </span>
      </div>
    )
  }

  return (
    <div className="disc-row" onClick={onOpen}>
      {/* 타입 이모지(🎬📺…)는 안 그린다 — 줄 맨 앞에서 제목보다 먼저 읽혔다.
          어떤 작품인지는 오른쪽 작품명이 말해 준다. */}
      {/* 별점도 안 그린다 — 글쓴이 한 명의 점수라 훑을 때 판단 근거가 약하고,
          줄마다 다른 색이 켜져서 제목보다 먼저 눈에 띈다. 작품 평균은 작품 상세에 있다. */}
      <span className="disc-row-title">
        {post.spoiler && <span className="disc-spoiler-tag">스포</span>} {title}
        {hasMedia && <span className="disc-media-tag" title="짤 첨부">🖼</span>}
      </span>
      {/* ExpertTag 는 여기 안 붙인다 — 아래 LevelTag 가 좋문가면 👑 를 그려서 왕관이 두 번 나온다 */}
      <Stats commentCount={commentCount} />
      <span className="disc-row-meta">
        {showContent && (
          <span className="disc-row-work" title={`${content.title} 작품방으로 이동`} onClick={goWork}>{content.title}</span>
        )}
        <span className="disc-writer">
          <LevelTag authorId={post.authorId} expertOnly />
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

/**
 * 목록에 붙는 숫자 — **댓글수만**.
 * 추천·조회는 뺐다. 지금 값이 0~15 범위라 줄마다 구분이 안 되면서 자리만 차지했고,
 * "읽을 만한 글인가"는 인기글 섹션이 이미 답한다. 댓글수는 "대화가 붙었나" 라
 * 목록에서 유일하게 남길 값으로 봤다. (2026-08-27 목록 정리)
 */
function Stats({ commentCount }: { commentCount: number }) {
  if (!commentCount) return null
  return (
    <span className="disc-row-counts">
      <span className="disc-row-stat">💬 {commentCount}</span>
    </span>
  )
}
