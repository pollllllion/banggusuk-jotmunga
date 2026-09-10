import { useNavigate } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { LevelTag } from '@/components/profile/LevelTag'
import { boardDate } from '@/utils/helpers'
import { isPostRead, markPostRead } from '@/utils/readPosts'
import type { Content, Discussion } from '@/types'
import { clickable } from '@/utils/a11y'

/** 게시판 한 줄 (디시 목록 스타일). showContent=true면 작품 태그도 표시(전체 게시판).
 *  자유방 글은 작품이 없어 content 가 없다 — 그때는 작품 열을 통째로 뺀다. */
export function DiscussionRow({ post, content, showContent, onOpen }: {
  post: Discussion
  content?: Content
  showContent?: boolean
  onOpen: () => void
}) {
  const navigate = useNavigate()
  const isGuest = !!post.guestName
  const author = isGuest ? post.guestName : (DS.getUserById(post.authorId || '')?.nickname || '탈퇴한 사용자')
  const commentCount = DS.countDiscussionComments(post.id)

  const goWork = (e: React.MouseEvent) => { e.stopPropagation(); if (content) navigate(`/content/${content.id}?tab=talk`) }
  // 고정닉(계정)만 강조·프로필 링크. 유동닉과 레거시 방문객 글은 회색 일반 표기.
  const isAccount = DS.isAccountId(post.authorId)
  const canProfile = isAccount
  const goProfile = (e: React.MouseEvent) => { e.stopPropagation(); if (canProfile) navigate(`/u/${post.authorId}`) }

  const title = post.title || post.body.slice(0, 40)
  // 짤 붙은 글은 목록에서 바로 티가 나게 (댓글 수처럼 작은 표시)
  const hasMedia = !!post.images?.length
  // 읽은 글은 흐리게 — 목록을 다시 훑을 때 어디까지 봤는지 눈으로 알 수 있다.
  // 그리는 시점에 한 번 읽는다(행마다 구독하지 않는다 — 목록은 다시 들어올 때 새로 그려진다).
  const read = isPostRead(post.id)
  const open = () => { markPostRead(post.id); onOpen() }

  // 말머리형 고정 컬럼 (2026-08-27 · 디시·클리앙 목록 구조 참고)
  //   [작품(말머리)] [제목 + 댓글수] [글쓴이] [조회] [날짜]
  // 열 폭을 고정해야 닉네임·날짜가 줄마다 같은 x 좌표에 온다 → 세로로 훑을 수 있다.
  // 예전엔 flex 라 작품명 길이에 따라 오른쪽이 줄마다 밀렸고, 그게 "지저분함"의 원인이었다.
  // 작품방(showContent=false)에서는 전부 같은 작품이라 말머리 열을 뺀다.
  //
  // 좁은 화면(≤768px)에서는 같은 DOM 이 2줄 행으로 바뀐다 — 제목 한 줄, 메타 한 줄(디시 모바일).
  // .disc-row-meta 가 그 전환점이다: 넓은 화면에선 display:contents 라 아래 세 칸이
  // 그대로 표의 열이 되고(=지금까지와 똑같다), 좁은 화면에선 flex 상자가 되어 둘째 줄이 된다.
  return (
    <div className={`disc-row ${showContent ? 'has-tag' : ''} ${read ? 'is-read' : ''}`} {...clickable(open)}>
      {showContent && content && (
        <span className="disc-row-work" title={`${content.title} 작품방으로 이동`} onClick={goWork}>
          {content.title}
        </span>
      )}
      {/* 줄여서 … 로 자르는 건 제목 글자뿐이다. 스포·짤 표시와 댓글 수는 늘 보인다 —
          제목이 길다는 이유로 '댓글 12개'가 통째로 사라지면 목록에서 제일 중요한 신호를 잃는다. */}
      <span className="disc-row-title">
        {post.spoiler && <span className="disc-spoiler-tag">스포</span>}
        <span className="disc-row-titletext">{title}</span>
        {hasMedia && <span className="disc-media-tag" title="짤 첨부">🖼</span>}
        {commentCount > 0 && <span className="disc-row-cc">[{commentCount}]</span>}
      </span>
      <span className="disc-row-meta">
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
        {/* 추천 수는 좁은 화면에만 나온다 — 넓은 화면 표에는 추천 열이 없었고, 열을 늘리면
            제목 폭이 그만큼 줄기 때문이다. 디시 모바일은 조회 옆에 추천을 같이 보여준다. */}
        <span className={`disc-row-likes ${post.likes.length ? 'has' : ''}`} title="추천">
          추천 {post.likes.length || 0}
        </span>
        <span className="disc-time" title={new Date(post.createdAt).toLocaleString('ko-KR')}>
          {boardDate(post.createdAt)}
        </span>
      </span>
    </div>
  )
}

/** 목록 맨 위 헤더 행 — 어느 열이 뭔지 한 번만 알려 준다(디시·클리앙에 있는 것).
 *  좁은 화면에서는 행이 표가 아니라 2줄 카드라 열 이름이 뜻이 없다 → CSS 로 숨긴다. */
export function DiscussionRowHead({ showContent }: { showContent?: boolean }) {
  return (
    <div className={`disc-row disc-row-head ${showContent ? 'has-tag' : ''}`}>
      {showContent && <span>작품</span>}
      <span>제목</span>
      <span className="disc-row-meta">
        <span>글쓴이</span>
        <span className="disc-row-views">조회</span>
        <span className="disc-time">날짜</span>
      </span>
    </div>
  )
}
