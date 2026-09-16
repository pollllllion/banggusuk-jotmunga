import { useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { ContentCard } from '@/components/content/ContentCard'
import { DiscussionRow, DiscussionRowHead } from '@/components/content/DiscussionRow'
import { Seo } from '@/components/seo/Seo'
import { Avatar } from '@/components/profile/Avatar'
import { LevelTag } from '@/components/profile/LevelTag'
import { snippet } from '@/utils/postSearch'
import { boardDate } from '@/utils/helpers'
import { TALK_LABEL } from '@/utils/constants'
import { clickable } from '@/utils/a11y'
import '@/styles/discussion.css'

/** 각 칸에서 한 번에 보여줄 개수. 넘치면 그 칸의 원래 화면으로 보낸다 */
const WORK_LIMIT = 12
const POST_LIMIT = 20
const COMMENT_LIMIT = 15

/**
 * 통합검색 결과 — 헤더 검색창에서 엔터를 치면 오는 곳.
 *
 * 2026-09-16. 그전에는 엔터가 /browse?search= 로 갔다. 거기는 **작품 목록**이라
 * 글에 있는 말("결말", "떡밥")로 찾으면 늘 0건이었다. 사람이 검색창에 치는 말은
 * 작품 이름만이 아니라서, 세 갈래를 한 화면에 나란히 둔다.
 *
 * 칸 차례는 검색창 드롭다운과 같다(작품 → 게시글 → 댓글). 같은 검색어로 두 화면이
 * 다른 차례를 보이면, 창에서 본 것을 화면에서 다시 찾아야 한다.
 *
 * 색인은 하지 않는다(noindex) — 검색 결과 화면은 검색어마다 주소가 달라
 * 무한히 생기고, 그 내용은 전부 다른 곳에 이미 있다.
 */
export function SearchPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const q = (searchParams.get('q') || '').trim()

  const blockedIds = useMemo(() => (user ? DS.getBlockedIds(user.id) : []), [user])
  const works = useMemo(() => DS.searchContents(q, WORK_LIMIT + 1), [q])
  const posts = useMemo(() => DS.searchDiscussions(q, POST_LIMIT + 1, { blockedIds }), [q, blockedIds])
  const comments = useMemo(() => DS.searchDiscussionComments(q, COMMENT_LIMIT + 1, { blockedIds }), [q, blockedIds])

  const total = works.length + posts.length + comments.length

  if (!q) {
    return (
      <>
        <Seo path="/search" title="통합 검색" noindex />
        <div className="empty-state fade-in"><p>찾을 말을 위 검색창에 쳐보세요.</p></div>
      </>
    )
  }

  return (
    <>
      <Seo path="/search" title={`'${q}' 검색 결과`} noindex />

      <div className="feed-header">
        <h2 className="feed-title">'{q}' 검색 결과</h2>
      </div>

      {!total ? (
        <div className="empty-state fade-in">
          <p>'{q}' 로 찾은 것이 없어요.</p>
          <p className="sub">작품 이름 일부만 치거나, 글에 나올 법한 말로 바꿔보세요.</p>
        </div>
      ) : (
        <div className="fade-in">
          {/* ── 작품 ─────────────────────────────────────────── */}
          {works.length > 0 && (
            <section className="sr-sec">
              <div className="sr-head">
                <h3>작품 <span className="sr-count">{Math.min(works.length, WORK_LIMIT)}{works.length > WORK_LIMIT ? '+' : ''}</span></h3>
                {works.length > WORK_LIMIT && (
                  <button className="sr-more" onClick={() => navigate(`/browse?search=${encodeURIComponent(q)}`)}>
                    작품 더 보기 ›
                  </button>
                )}
              </div>
              <div className="content-grid">
                {works.slice(0, WORK_LIMIT).map(c => <ContentCard key={c.id} content={c} />)}
              </div>
            </section>
          )}

          {/* ── 게시글 (제목 + 내용) ─────────────────────────── */}
          {posts.length > 0 && (
            <section className="sr-sec">
              <div className="sr-head">
                <h3>게시글 <span className="sr-count">{Math.min(posts.length, POST_LIMIT)}{posts.length > POST_LIMIT ? '+' : ''}</span></h3>
              </div>
              <div className="disc-board">
                <DiscussionRowHead showContent />
                {posts.slice(0, POST_LIMIT).map(p => (
                  <DiscussionRow
                    key={p.id}
                    post={p}
                    content={DS.getContentById(p.contentId) || undefined}
                    showContent
                    onOpen={() => navigate(`/talk/${p.id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── 댓글 ─────────────────────────────────────────
              글 목록과 같은 표로 그리지 않는다 — 댓글은 제목이 없어서 열을 채울 것이 없다.
              대신 '무슨 말을 했나'를 한 줄로 보여주고, 어느 글에 달린 것인지 아래 붙인다. */}
          {comments.length > 0 && (
            <section className="sr-sec">
              <div className="sr-head">
                <h3>댓글 <span className="sr-count">{Math.min(comments.length, COMMENT_LIMIT)}{comments.length > COMMENT_LIMIT ? '+' : ''}</span></h3>
              </div>
              <div className="sr-comments">
                {comments.slice(0, COMMENT_LIMIT).map(c => {
                  const parent = DS.getDiscussions().find(d => d.id === c.discussionId)
                  const author = c.guestName || DS.getUserById(c.authorId || '')?.nickname || '탈퇴한 사용자'
                  const profile = c.authorId ? DS.getUserById(c.authorId) : null
                  return (
                    <div
                      key={c.id}
                      className="sr-comment"
                      {...clickable(() => navigate(`/talk/${c.discussionId}`), '이 댓글이 달린 글로 가기')}
                    >
                      <Avatar src={profile?.avatarUrl} name={author} size={28} />
                      <div className="sr-comment-body">
                        <div className="sr-comment-who">
                          <span className="sr-comment-name">{author}</span>
                          <LevelTag authorId={c.authorId} />
                          <span className="sr-comment-date">{boardDate(c.createdAt)}</span>
                        </div>
                        <div className="sr-comment-text">{snippet(c.body, q, 60)}</div>
                        <div className="sr-comment-on">
                          {(parent?.board || 'talk') === 'relay' ? '자유방' : TALK_LABEL}
                          {' · '}
                          {parent?.title || snippet(parent?.body || '', q, 20) || '글'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  )
}
