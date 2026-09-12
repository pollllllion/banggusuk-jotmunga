import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { DiscussionRow, DiscussionRowHead } from '@/components/content/DiscussionRow'
import { BOARDS } from '@/utils/constants'
import { Seo } from '@/components/seo/Seo'
import { Pager, usePageParam } from '@/components/ui/Pager'
import { BoardTopbar } from '@/components/content/BoardTopbar'
import '@/styles/discussion.css'

/** 한 페이지에 보여줄 글 수 — 토론방과 같게 */
const PER_PAGE = 30


/**
 * 자유방 — 작품에 묶이지 않는 게시판.
 *
 * 토론방과 같은 discussions 표를 쓰되 board='relay' 로만 거른다(migration_free_board).
 * 그래서 댓글·추천·조회수·신고·유동닉 비번은 토론방 것을 그대로 쓴다.
 * 다른 점은 두 가지뿐이다 — 작품 열이 없고(글에 작품이 없으니), 작품 타입 탭이 없다.
 */
export function FreeBoardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [q, setQ] = useState('')
  const board = BOARDS.find(b => b.slug === 'relay')

  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  const query = q.trim().toLowerCase()

  const rows = DS.getDiscussionsByBoard('relay')
    .filter(p => !blockedIds.includes(p.authorId || ''))
    .filter(p => !query || (p.title || '').toLowerCase().includes(query) || p.body.toLowerCase().includes(query))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // 쪽 번호는 URL(?p=)에 둔다 — 글을 읽고 뒤로 와도 보던 쪽이 유지된다.
  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const { page, goPage } = usePageParam(searchParams, setSearchParams, totalPages)
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // 로그인 강제는 하지 않는다 — 글쓰기 화면이 유동닉을 받는다(비회원 상자).
  const openWrite = () => navigate('/talk/write?board=relay')

  return (
    <>
      <Seo
        path="/board/relay"
        title="자유방"
        description="작품 얘기가 아니어도 괜찮은 오티티칼 자유 게시판. 뭘 볼지 묻고, 방금 본 걸 떠들고, 아무 말이나 남기는 곳."
      />
      {/* 자유방은 칸이 하나뿐이라 뛰어갈 곳이 없다 — 제목만 붙여 둔다 */}
      <BoardTopbar
        title={board ? board.label : '자유방'}
        action={<button className="btn btn-primary btn-small" onClick={openWrite}>글쓰기</button>}
      />
      <div className="feed-header">
        <h2 className="feed-title">{board ? board.label : '자유방'}</h2>
        {/* 좁은 화면에서는 고정 바에 같은 버튼이 있어 접는다(CSS) */}
        <button className="btn btn-primary btn-small feed-header-write" onClick={openWrite}>글쓰기</button>
      </div>

      <div className="disc-searchbar">
        <input className="form-input" value={q} onChange={e => setQ(e.target.value)} placeholder="제목·내용 검색" />
        <span className="disc-searchbar-count">{rows.length}건</span>
      </div>

      {!rows.length ? (
        <div className="empty-state fade-in">
          <p>{query ? '검색 결과가 없어요.' : '아직 글이 없어요. 첫 글을 남겨보세요!'}</p>
          {!query && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openWrite}>글쓰기</button>}
        </div>
      ) : (
        <>
          <div className="disc-board fade-in">
            <DiscussionRowHead />
            {pageRows.map(post => (
              <DiscussionRow key={post.id} post={post} onOpen={() => navigate(`/talk/${post.id}`)} />
            ))}
          </div>
          <Pager page={page} total={totalPages} onGo={goPage} />
        </>
      )}
    </>
  )
}
