import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { AvatarEditor } from '@/components/profile/AvatarEditor'
import { LevelCard } from '@/components/profile/LevelCard'
import { DiscussionRow } from '@/components/content/DiscussionRow'
import { Seo } from '@/components/seo/Seo'
import { fullDateTime } from '@/utils/helpers'
import { SettingsIcon } from '@/components/ui/Icons'
import { TALK_LABEL } from '@/utils/constants'
import { clickable } from '@/utils/a11y'

/** 내 정보 안의 칸들. 주소에 남기지 않는다 — 남에게 보낼 화면이 아니다(내 것만 보인다) */
type Tab = 'posts' | 'comments' | 'mylikes' | 'likes'

/** 목록 한 줄로 펴 놓은 글·댓글 — '내 추천'과 '받은 추천'이 같은 모양을 쓴다 */
type Row = {
  kind: 'post' | 'comment'
  key: string
  /** 눌렀을 때 갈 글 id (댓글이면 그 댓글이 달린 글) */
  postId: string
  title: string
  /** 어디에 있는 것인지 — 글이면 작품명, 댓글이면 글 제목 */
  sub: string
  count: number
  at: string
}

/**
 * 내 정보 — 나만 보는 내 활동 기록.
 *
 * '내 피드'(/feed)와 다른 개념이다:
 *   · 내 피드  = 내가 **본 작품** 서랍 (작품 중심)
 *   · 내 정보  = 내가 **쓴 것과 받은 것** (활동 중심) + 프로필·레벨
 * 공개 프로필(/u/:id)과도 다르다 — 저쪽은 남이 나를 판단하는 화면이라 취향·본 작품을 보여주고,
 * 여기는 내가 내 활동을 되짚는 화면이라 댓글·받은 추천처럼 남에게 굳이 안 보일 것까지 모은다.
 */
export function MyPage() {
  const navigate = useNavigate()
  const { user, isAccount, updateProfile } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [tab, setTab] = useState<Tab>('posts')
  const [editingNick, setEditingNick] = useState(false)
  const [nick, setNick] = useState(user?.nickname || '')
  const [busy, setBusy] = useState(false)
  // LevelCard 는 계산 결과를 기억한다 — 프로필을 고친 뒤 다시 세게 하려고 바꿔 준다
  const [tick, setTick] = useState(0)

  if (!user) return null

  const posts = DS.getDiscussionsByAuthor(user.id)
    .map(p => ({ post: p, content: DS.getContentById(p.contentId) }))
    .sort((a, b) => new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())

  /** 내가 쓴 댓글 — 어느 글에 달았는지까지 같이 보여야 되짚을 수 있다 */
  const myComments = DS.getDiscussionComments()
    .filter(c => c.authorId === user.id && !c.deleted)
    .map(c => ({ c, post: DS.getDiscussions().find(d => d.id === c.discussionId) }))
    .filter((x): x is { c: typeof x.c; post: NonNullable<typeof x.post> } => !!x.post)
    .sort((a, b) => new Date(b.c.createdAt).getTime() - new Date(a.c.createdAt).getTime())

  const postRow = (p: ReturnType<typeof DS.getDiscussions>[number]): Row => ({
    kind: 'post', key: `post-${p.id}`, postId: p.id,
    title: p.title || p.body.slice(0, 40),
    sub: DS.getContentById(p.contentId)?.title || '자유방',
    count: p.likes.length, at: p.createdAt,
  })
  const commentRow = (c: ReturnType<typeof DS.getDiscussionComments>[number], postTitle: string): Row => ({
    kind: 'comment', key: `cmt-${c.id}`, postId: c.discussionId,
    title: c.body.slice(0, 60), sub: postTitle,
    count: c.likes.length, at: c.createdAt,
  })

  /** 추천받은 내 글·댓글 — 많이 받은 순. '내가 뭘로 인정받았나'를 보는 칸이다 */
  const received: Row[] = [
    ...posts.filter(({ post }) => post.likes.length > 0).map(({ post }) => postRow(post)),
    ...myComments.filter(({ c }) => c.likes.length > 0).map(({ c, post }) => commentRow(c, post.title || '(제목 없음)')),
  ].sort((a, b) => b.count - a.count)
  const totalReceived = received.reduce((s, x) => s + x.count, 0)

  /**
   * 내가 하트를 누른 글·댓글.
   * 최신순으로 세운다 — likes 는 누른 사람 id 만 담는 배열이라 '언제 눌렀는지'가 없다.
   * 그래서 글·댓글이 쓰인 시각으로 줄을 세운다(내가 누른 차례와는 다를 수 있다).
   */
  const myLiked: Row[] = [
    ...DS.getDiscussions().filter(p => p.likes.includes(user.id)).map(postRow),
    ...DS.getDiscussionComments()
      .filter(c => !c.deleted && c.likes.includes(user.id))
      .map(c => {
        const p = DS.getDiscussions().find(d => d.id === c.discussionId)
        return p ? commentRow(c, p.title || '(제목 없음)') : null
      })
      .filter((r): r is Row => !!r),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const saveNick = async () => {
    const v = nick.trim()
    if (!v) { toast('닉네임을 입력하세요.'); return }
    if (v === user.nickname) { setEditingNick(false); return }
    setBusy(true)
    try { await updateProfile({ nickname: v }); toast('닉네임을 바꿨어요.'); setEditingNick(false) }
    catch (e: any) { toast(e?.message || '닉네임을 바꾸지 못했어요.') }
    finally { setBusy(false); setTick(t => t + 1) }
  }

  /** '내 추천'·'받은 추천'이 함께 쓰는 한 줄 */
  const rowView = (x: Row) => (
    <div key={x.key} className="me-row" {...clickable(() => navigate(`/talk/${x.postId}`))}>
      <p className="me-row-body">
        <span className={`me-kind ${x.kind}`}>{x.kind === 'post' ? '글' : '댓글'}</span>
        {x.title}
      </p>
      <div className="me-row-meta">
        <span className="me-row-where">{x.sub}</span>
        <span className="disc-time">{fullDateTime(x.at)}</span>
        {x.count > 0 && <span className="me-row-likes">♥ {x.count}</span>}
      </div>
    </div>
  )

  return (
    <>
      <Seo title="내 정보" noindex />

      {/* ── 프로필 ─────────────────────────────────────────── */}
      <div className="me-card fade-in">
        {/* 사진·카메라 배지·시트·자르기 창은 한 벌뿐이다 — 내 피드(/feed)도 같은 것을 쓴다 */}
        <AvatarEditor className="me-avatar" size={72} onChanged={() => setTick(t => t + 1)} />

        <div className="me-ident">
          {editingNick ? (
            <div className="me-nick-edit">
              <input className="form-input" value={nick} maxLength={20} autoFocus
                onChange={e => setNick(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void saveNick() }} />
              <button className="btn btn-primary btn-small" onClick={saveNick} disabled={busy}>저장</button>
              <button className="btn btn-secondary btn-small" onClick={() => { setNick(user.nickname); setEditingNick(false) }}>취소</button>
            </div>
          ) : (
            <div className="me-nick-row">
              <h2 className="me-nick">{user.nickname}</h2>
              {isAccount && <button className="btn-text btn-small" onClick={() => setEditingNick(true)}>닉네임 변경</button>}
            </div>
          )}
          <div className="me-email">{isAccount ? user.email : '유동닉 (비로그인) — 로그인하면 기록이 계정에 쌓여요'}</div>
          <div className="me-since">가입 {fullDateTime(user.createdAt).slice(0, 10)}</div>
        </div>

        <div className="me-card-actions">
          <button className="btn-text btn-small" onClick={() => navigate('/settings')}>
            <SettingsIcon /> 계정 설정
          </button>
        </div>
      </div>

      {/* ── 레벨 상세 (카드를 누르면 레벨 시스템 안내가 열린다) ── */}
      <LevelCard user={user} tick={tick} />

      {/* ── 내가 쓴 것 · 받은 것 ───────────────────────────── */}
      <div className="content-tabs me-tabs" role="tablist" style={{ marginTop: 18 }}>
        <button role="tab" aria-selected={tab === 'posts'} className={tab === 'posts' ? 'active' : ''} onClick={() => setTab('posts')}>
          내 글 {posts.length}
        </button>
        <button role="tab" aria-selected={tab === 'comments'} className={tab === 'comments' ? 'active' : ''} onClick={() => setTab('comments')}>
          내 댓글 {myComments.length}
        </button>
        <button role="tab" aria-selected={tab === 'mylikes'} className={tab === 'mylikes' ? 'active' : ''} onClick={() => setTab('mylikes')}>
          내 추천 {myLiked.length}
        </button>
        <button role="tab" aria-selected={tab === 'likes'} className={tab === 'likes' ? 'active' : ''} onClick={() => setTab('likes')}>
          받은 추천 {totalReceived}
        </button>
      </div>

      {tab === 'posts' && (
        !posts.length ? (
          <div className="empty-state fade-in">
            <p>아직 쓴 글이 없어요.</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/talk')}>{TALK_LABEL} 가기</button>
          </div>
        ) : (
          <div className="disc-board fade-in">
            {posts.map(({ post, content }) => (
              <DiscussionRow key={post.id} post={post} content={content} showContent onOpen={() => navigate(`/talk/${post.id}`)} />
            ))}
          </div>
        )
      )}

      {tab === 'comments' && (
        !myComments.length ? (
          <div className="empty-state fade-in"><p>아직 쓴 댓글이 없어요.</p></div>
        ) : (
          <div className="disc-board fade-in">
            {myComments.map(({ c, post }) => (
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
        )
      )}

      {tab === 'mylikes' && (
        !myLiked.length ? (
          <div className="empty-state fade-in">
            <p>아직 추천한 글이 없어요.</p>
            <p style={{ fontSize: 12, marginTop: 6 }}>글·댓글의 ♥ 를 누르면 여기에 모입니다.</p>
          </div>
        ) : (
          <div className="disc-board fade-in">{myLiked.map(x => rowView(x))}</div>
        )
      )}

      {tab === 'likes' && (
        !received.length ? (
          <div className="empty-state fade-in">
            <p>아직 받은 추천이 없어요.</p>
            <p style={{ fontSize: 12, marginTop: 6 }}>추천은 레벨의 품질 점수로 들어가요.</p>
          </div>
        ) : (
          <div className="disc-board fade-in">{received.map(x => rowView(x))}</div>
        )
      )}
    </>
  )
}
