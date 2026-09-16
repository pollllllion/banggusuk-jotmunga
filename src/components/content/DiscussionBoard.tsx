import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { DiscussionRow, DiscussionRowHead } from '@/components/content/DiscussionRow'
import { Pager, usePageParam } from '@/components/ui/Pager'
import { promoteTrending } from '@/utils/trending'
import { BOARD_PER_PAGE, TRENDING_LIMIT, TRENDING_MIN_POSTS } from '@/utils/constants'
import '@/styles/discussion.css'

/**
 * 작품방 게시판 — 이 작품의 토론글 목록 + '토론하기'(통합 작성기로 이동).
 *
 * 2026-09-16 — 쪽 나누기와 인기글 끌어올리기를 붙였다. 그전에는 **글을 전부 한 번에**
 * 그렸다. 작품당 글이 최대 4개라 여태 티가 안 났을 뿐, 100개가 쌓이면 화면이 한참
 * 길어지고 아래 '이런 작품도'(작품 간 이동 링크)가 화면 밖으로 밀려난다.
 * 토론방·자유방이 쓰던 부품(Pager · promoteTrending)을 그대로 연결했고,
 * 쪽 수·인기글 기준은 세 게시판이 같은 상수를 본다(utils/constants).
 */
export function DiscussionBoard({ contentId }: { contentId: string }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const content = DS.getContentById(contentId)

  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  const posts = DS.getDiscussionsByContent(contentId)
    .filter(p => !blockedIds.includes(p.authorId || ''))
    .map(post => ({ post }))

  /**
   * 인기글을 목록 맨 위로 끌어올린다 — 토론방·자유방과 같은 규칙(utils/trending).
   * 글이 몇 개 없을 때는 안 올린다: 최신순과 똑같아 보여 ▲ 표시만 늘어난다.
   */
  const rows = posts.length >= TRENDING_MIN_POSTS
    ? promoteTrending(posts, p => DS.countDiscussionComments(p.id), TRENDING_LIMIT)
    : posts.map(x => ({ ...x, hot: false }))

  // 쪽 번호는 URL(?p=)에 둔다 — 글을 읽고 뒤로 와도 보던 쪽이 유지된다.
  // 작품 상세의 ?tab=info 와 같은 주소를 쓰지만 키가 달라 서로 건드리지 않는다.
  const totalPages = Math.max(1, Math.ceil(rows.length / BOARD_PER_PAGE))
  const { page, goPage } = usePageParam(searchParams, setSearchParams, totalPages)
  const pageRows = rows.slice((page - 1) * BOARD_PER_PAGE, page * BOARD_PER_PAGE)

  const goWrite = () => navigate(`/talk/write?contentId=${contentId}`)

  return (
    <div className="disc-wrap">
      <div className="feed-header" style={{ marginTop: 20 }}>
        <h2 className="feed-title">토론글 {posts.length > 0 && <span style={{ color: 'var(--subtext)', fontWeight: 500 }}>{posts.length}</span>}</h2>
        <button className="btn btn-primary btn-small" onClick={goWrite}>토론하기</button>
      </div>

      {!posts.length ? (
        <div className="empty-state fade-in">
          <p>아직 글이 없어요. 첫 글을 남겨보세요!</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={goWrite}>토론하기</button>
        </div>
      ) : (
        <>
          <div className="disc-board">
            {/* 작품방은 전부 같은 작품이라 말머리(작품) 열이 없다 */}
            <DiscussionRowHead />
            {content && pageRows.map(({ post, hot }) => (
              <DiscussionRow key={post.id} post={post} content={content} hot={hot} onOpen={() => navigate(`/talk/${post.id}`)} />
            ))}
          </div>
          <Pager page={page} total={totalPages} onGo={goPage} />
        </>
      )}
    </div>
  )
}
