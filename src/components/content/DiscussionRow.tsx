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
          {post.spoiler && <span className="disc-spoiler-tag">스포</span>}
          {title}
          {hasMedia && <span className="disc-media-tag" title="짤 첨부">🖼</span>}
          {commentCount > 0 && <span className="disc-row-cc">[{commentCount}]</span>}
        </span>
        <span className="disc-rank-meta">
          <span className="disc-rank-work" title={`${content.title} 작품방으로 이동`} onClick={goWork}>{content.title}</span>
        </span>
      </div>
    )
  }

  // 말머리형 고정 컬럼 (2026-08-27 · 디시·클리앙 목록 구조 참고)
  //   [작품(말머리)] [제목 + 댓글수] [글쓴이] [조회] [날짜]
  // 열 폭을 고정해야 닉네임·날짜가 줄마다 같은 x 좌표에 온다 → 세로로 훑을 수 있다.
  // 예전엔 flex 라 작품명 길이에 따라 오른쪽이 줄마다 밀렸고, 그게 "지저분함"의 원인이었다.
  // 작품방(showContent=false)에서는 전부 같은 작품이라 말머리 열을 뺀다.
  return (
    <div className={`disc-row ${showContent ? 'has-tag' : ''}`} onClick={onOpen}>
      {showContent && (
        <span className="disc-row-work" title={`${content.title} 작품방으로 이동`} onClick={goWork}>
          {content.title}
        </span>
      )}
      <span className="disc-row-title">
        {post.spoiler && <span className="disc-spoiler-tag">스포</span>}
        {title}
        {hasMedia && <span className="disc-media-tag" title="짤 첨부">🖼</span>}
        {commentCount > 0 && <span className="disc-row-cc">[{commentCount}]</span>}
      </span>
      {/* ExpertTag 는 여기 안 붙인다 — LevelTag 가 좋문가면 👑 를 그려서 왕관이 두 번 나온다 */}
      <span className="disc-writer">
        <LevelTag authorId={post.authorId} expertOnly />
        <span
          className={`disc-author ${isAccount ? '' : 'guest'} ${canProfile ? 'linkable' : ''}`}
          onClick={goProfile}>
          {author}
        </span>
      </span>
      <span className="disc-row-views" title="조회">{post.views || 0}</span>
      <span className="disc-time">{timeAgo(post.createdAt)}</span>
    </div>
  )
}

/** 목록 맨 위 헤더 행 — 어느 열이 뭔지 한 번만 알려 준다(디시·클리앙에 있는 것). */
export function DiscussionRowHead({ showContent }: { showContent?: boolean }) {
  return (
    <div className={`disc-row disc-row-head ${showContent ? 'has-tag' : ''}`}>
      {showContent && <span>작품</span>}
      <span>제목</span>
      <span>글쓴이</span>
      <span className="disc-row-views">조회</span>
      <span className="disc-time">날짜</span>
    </div>
  )
}

