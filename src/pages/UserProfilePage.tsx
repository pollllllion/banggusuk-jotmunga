import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { ProfileShowcase } from '@/components/profile/ProfileShowcase'
import { DiscussionRow } from '@/components/content/DiscussionRow'
import { Poster } from '@/components/content/Poster'
import { BackIcon } from '@/components/ui/Icons'
import { Seo } from '@/components/seo/Seo'
import { boardDate, fullDateTime } from '@/utils/helpers'
import { clickable } from '@/utils/a11y'
import type { Content } from '@/types'

/** 프로필에서 보여줄 '본 작품' 최대 개수 — 프로필이 작품 목록에 잡아먹히지 않게 */
const MAX_WATCHED = 12

/**
 * 공개 프로필 — 닉네임을 누르면 오는 화면.
 *
 * 위쪽(인생작품·프로필·취향·별점·많이 본 장르)은 그 사람이 **내 피드에서 꾸민 그대로**다
 * (ProfileShowcase 를 /feed 와 같이 쓴다). 꾸민 것이 남에게 그대로 보여야 꾸미는 뜻이 있다.
 * 그 아래에 본 작품, 그리고 맨 밑에 쓴 글과 댓글이 온다 — 글은 '기록'이지 '꾸밈'이 아니라서
 * 취향을 다 보여준 뒤에 놓는다.
 */
export function UserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const me = useAuthStore(s => s.user)

  /**
   * 본 작품(watched)은 캐시에 **내 행만** 있다(RLS + 시작 로드 용량).
   * 그래서 프로필을 열 때 그 사람 것만 따로 물어본다.
   * watched 의 select 가 "본인만"이면 남의 것은 빈 배열로 오고, 이 칸은 그냥 안 뜬다
   * (공개하려면 supabase/migration_watched_public.sql).
   */
  const [watched, setWatched] = useState<Content[] | null>(null)
  /** 본 작품을 다 펼칠지 — 기본은 가로 한 줄(MAX_WATCHED 편) */
  const [expandWatched, setExpandWatched] = useState(false)
  useEffect(() => {
    if (!id) return
    let alive = true
    DS.fetchUserWatched(id).then(rows => {
      if (!alive) return
      const items = rows
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(w => DS.getContentById(w.contentId))
        .filter((c): c is Content => !!c)
      setWatched(items)
    })
    return () => { alive = false }
  }, [id])

  const u = id ? DS.getUserById(id) : undefined
  if (!u) {
    return (
      <div className="empty-state fade-in"><p>존재하지 않는 사용자예요.</p></div>
    )
  }
  const isMe = me?.id === u.id

  const posts = DS.getDiscussionsByAuthor(u.id)
    // 자유방 글은 작품이 없다 — content 없는 줄을 걸러내면 그 글이 목록에서 사라진다.
    // DiscussionRow 가 작품 없는 줄을 그릴 수 있으므로 그대로 둔다.
    .map(p => ({ post: p, content: DS.getContentById(p.contentId) }))
    .sort((a, b) => new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())

  /** 이 사람이 단 댓글 — 어느 글에 달았는지까지 있어야 읽을 수 있다 */
  const comments = DS.getDiscussionComments()
    .filter(c => c.authorId === u.id && !c.deleted)
    .map(c => ({ c, post: DS.getDiscussions().find(d => d.id === c.discussionId) }))
    .filter((x): x is { c: typeof x.c; post: NonNullable<typeof x.post> } => !!x.post)
    .sort((a, b) => new Date(b.c.createdAt).getTime() - new Date(a.c.createdAt).getTime())

  /** 본 작품 공개 여부 — 본인은 감춘 것도 본다(대신 '비공개' 표시) */
  const watchedPublic = u.showWatched !== false

  /** 내 토론 — 공개로 둔 것만. 본인이 볼 땐 비공개까지 보인다(고치는 건 내 피드에서) */
  const pins = (u.pinnedPosts ?? [])
    .filter(p => p.public || isMe)
    .map(p => ({ pin: p, post: DS.getDiscussions().find(d => d.id === p.id) }))
    .filter((x): x is { pin: typeof x.pin; post: NonNullable<typeof x.post> } => Boolean(x.post))

  return (
    <>
      <Seo title={`${u.nickname} 님의 프로필`} noindex />
      <div className="back-btn" {...clickable(() => navigate(-1))}><BackIcon /> 뒤로</div>

      <ProfileShowcase user={u} watched={watched ?? []} editable={isMe} />

      {/* 본 작품 — 볼 수 있을 때만 그린다(빈 배열이면 통째로 숨김) */}
      {(watchedPublic || isMe) && watched && watched.length > 0 && (
        <>
          <div className="feed-header" style={{ marginTop: 24 }}>
            <h3 className="feed-title" style={{ fontSize: 16 }}>본 작품 {watched.length}</h3>
            <span className="feed-sec-right">
              {isMe && !watchedPublic && <span className="feed-private">비공개</span>}
              {/* 12편 이하라 접든 펴든 같아 보여도 버튼은 남긴다 —
                  '여기는 얼마든지 쌓이는 자리'라는 걸 칸 자체가 말해 준다 */}
              <button className="btn-text btn-small" onClick={() => setExpandWatched(v => !v)}>
                {expandWatched ? '접기' : `${watched.length}편 전체 보기 ›`}
              </button>
            </span>
          </div>
          {/* 접혀 있으면 내 피드와 같은 가로 줄, 펼치면 격자.
              남의 프로필에서까지 수백 편을 처음부터 세로로 쏟지 않는다 — 여기는 훑어보는 자리다.
              내 피드와 달리 묶기·필터·관리는 없다: 남의 목록이라 고칠 것이 없다. */}
          {expandWatched ? (
            <div className="content-grid">
              {watched.map(c => (
                <div key={c.id} className="content-card" {...clickable(() => navigate(`/content/${c.id}?tab=talk`), c.title)}>
                  <Poster content={c} showScore={false} />
                  <div className="c-title">{c.title}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="feed-strip">
              {watched.slice(0, MAX_WATCHED).map(c => (
                <div key={c.id} className="feed-strip-item" {...clickable(() => navigate(`/content/${c.id}?tab=talk`), c.title)}>
                  <Poster content={c} showScore={false} />
                  <div className="feed-strip-title">{c.title}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 내 토론 — 이 사람이 고른 자기 글. 공개로 둔 것만 보인다.
          본인이 볼 땐 비공개까지 보이고 표시가 붙는다(고치는 건 내 피드에서). */}
      {pins.length > 0 && (
        <>
          <div className="feed-header" style={{ marginTop: 24 }}>
            <h3 className="feed-title" style={{ fontSize: 16 }}>{u.nickname} 님의 토론 {pins.length}</h3>
          </div>
          <div className="disc-board fade-in">
            {pins.map(({ pin, post }) => (
              <div key={pin.id} className="feed-pin">
                <div className="feed-pin-main" {...clickable(() => navigate(`/talk/${pin.id}`))}>
                  <div className="feed-pin-title">{post.title || post.body.slice(0, 40)}</div>
                  <div className="feed-pin-meta">
                    <span className="feed-pin-work">{DS.getContentById(post.contentId)?.title || '자유방'}</span>
                    <span>{boardDate(post.createdAt)}</span>
                    {post.likes.length > 0 && <span className="feed-pin-likes">♥ {post.likes.length}</span>}
                  </div>
                </div>
                {isMe && !pin.public && <span className="feed-private">비공개</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── 맨 아래: 쓴 글과 댓글 ──────────────────────────────
          둘 다 공개 스위치가 없다 — 게시판에 이미 이름과 함께 걸려 있는 것을
          프로필에서만 감추는 건 뜻이 없다. */}
      <div className="feed-header" style={{ marginTop: 24 }}>
        <h3 className="feed-title" style={{ fontSize: 16 }}>작성한 글 {posts.length}</h3>
      </div>
      {!posts.length ? (
        <div className="empty-state fade-in"><p>아직 작성한 글이 없어요.</p></div>
      ) : (
        <div className="disc-board fade-in">
          {posts.map(({ post, content }) => (
            <DiscussionRow key={post.id} post={post} content={content} showContent onOpen={() => navigate(`/talk/${post.id}`)} />
          ))}
        </div>
      )}

      <div className="feed-header" style={{ marginTop: 24 }}>
        <h3 className="feed-title" style={{ fontSize: 16 }}>작성한 댓글 {comments.length}</h3>
      </div>
      {!comments.length ? (
        <div className="empty-state fade-in"><p>아직 작성한 댓글이 없어요.</p></div>
      ) : (
        <div className="disc-board fade-in">
          {comments.map(({ c, post }) => (
            <div key={c.id} className="me-row" {...clickable(() => navigate(`/talk/${post.id}`))}>
              <p className="me-row-body">{c.body}</p>
              <div className="me-row-meta">
                <span className="me-row-where">{post.title || '(제목 없음)'}</span>
                <span className="disc-time">{fullDateTime(c.createdAt)}</span>
                {c.likes.length > 0 && <span className="me-row-likes">♥ {c.likes.length}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
