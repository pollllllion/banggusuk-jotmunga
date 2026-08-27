import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { GuestCred } from '@/components/ui/GuestCred'
import { ExpertTag } from '@/components/profile/ExpertTag'
import { LevelTag } from '@/components/profile/LevelTag'
import { BackIcon, HeartIcon } from '@/components/ui/Icons'
import { TYPE_EMOJIS } from '@/utils/constants'
import { timeAgo, sha256hex, scoreColor, scoreLabel } from '@/utils/helpers'
import { sanitizeRichText } from '@/utils/richText'
import { Seo } from '@/components/seo/Seo'
import '@/styles/discussion.css'

/** 방구석토론방 게시글 상세 — 전체 페이지 (디시 스타일 창 전환). 제목·본문 + 댓글. */
export function DiscussionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const openReportModal = useUIStore(s => s.openReportModal)
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  const [cbody, setCbody] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPw, setGuestPw] = useState('')
  const [revealSpoiler, setRevealSpoiler] = useState(false)
  // 댓글 인라인 수정 — 고치는 중인 댓글 id / 입력값 / (유동닉이면) 확인된 비번
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [editingPw, setEditingPw] = useState('')

  // 조회수 +1 (인기글 점수 재료). ref 가드 — StrictMode 이중 실행/리렌더로 두 번 세지 않게.
  const counted = useRef<string | null>(null)
  useEffect(() => {
    if (!id || counted.current === id) return
    counted.current = id
    void DS.incrementDiscussionViews(id)
  }, [id])

  const post = DS.getDiscussions().find(d => d.id === id)
  const content = post ? DS.getContentById(post.contentId) : undefined
  if (!post || !content) { navigate('/talk'); return null }

  const isGuest = !!post.guestName
  const author = isGuest ? post.guestName : (DS.getUserById(post.authorId || '')?.nickname || '탈퇴한 사용자')
  // 고정닉(계정)만 강조·프로필 링크 — 유동닉/레거시 방문객과 구분
  const isAccountAuthor = DS.isAccountId(post.authorId)
  const liked = user ? post.likes.includes(user.id) : false
  const canDeleteAccount = !!user && isAccount && !isGuest && (user.id === post.authorId || user.role === 'admin')
  // 수정은 글쓴이만 (관리자라도 남의 글 내용은 고치지 않는다 — 삭제만)
  const canEdit = (!!user && isAccount && !isGuest && user.id === post.authorId) || isGuest
  const comments = DS.getDiscussionCommentsByPost(post.id)

  const likePost = () => {
    if (!user) { toast('로그인 후 이용해주세요.'); return }
    if (!isAccount) { toast('공감은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    DS.toggleDiscussionLike(post.id, user.id); rerender()
  }

  /** 신고 — 접수 주체를 남겨야 하므로 로그인(고정닉) 필요. 같은 대상은 한 번만. */
  const reportTarget = (targetType: 'discussion' | 'discussion_comment', targetId: string) => {
    if (!user || !isAccount) { toast('신고는 로그인(고정닉) 후 이용할 수 있어요.'); return }
    if (DS.hasReported(user.id, targetType, targetId)) { toast('이미 신고한 글이에요.'); return }
    openReportModal(targetType, targetId)
  }

  /** 수정 — 계정 글은 바로, 유동닉 글은 비번을 먼저 확인하고 그 비번을 들고 넘어간다 */
  const editPost = async () => {
    if (isGuest) {
      const pw = prompt('글 작성 시 입력한 비밀번호를 입력하세요.')
      if (!pw) return
      const ok = await DS.verifyGuestPost('discussions', post.id, pw)
      if (!ok) { toast('비밀번호가 일치하지 않습니다.'); return }
      navigate(`/talk/write?edit=${post.id}`, { state: { guestPw: pw } })
      return
    }
    navigate(`/talk/write?edit=${post.id}`)
  }

  const removePost = async () => {
    if (canDeleteAccount) {
      if (!confirm('이 글을 삭제할까요? 댓글도 함께 삭제됩니다.')) return
      DS.deleteDiscussion(post.id); toast('삭제했습니다.'); navigate('/talk')
    } else if (isGuest) {
      const pw = prompt('글 작성 시 입력한 비밀번호를 입력하세요.')
      if (pw === null) return
      const ok = await DS.deleteGuestPost('discussions', post.id, pw)
      toast(ok ? '삭제했습니다.' : '비밀번호가 일치하지 않습니다.')
      if (ok) { DS.deleteDiscussion(post.id); navigate('/talk') }
    }
  }

  const submitComment = async () => {
    const text = cbody.trim()
    if (!text) { toast('댓글을 입력하세요.'); return }
    if (text.length > 1000) { toast('댓글은 1000자 이내로 입력해주세요.'); return }
    if (isAccount && user) {
      DS.createDiscussionComment({ discussionId: post.id, authorId: user.id, body: text })
    } else {
      if (!guestName.trim()) { toast('닉네임을 입력하세요.'); return }
      if (guestPw.length < 4) { toast('비밀번호를 4자 이상 입력하세요. (삭제 시 필요)'); return }
      const hash = await sha256hex(guestPw)
      DS.createDiscussionComment({ discussionId: post.id, authorId: null, guestName: guestName.trim(), guestPwHash: hash, body: text })
      setGuestPw('')
    }
    setCbody(''); rerender()
  }

  const likeComment = (cid: string) => {
    if (!user) { toast('로그인 후 이용해주세요.'); return }
    if (!isAccount) { toast('공감은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    DS.toggleDiscussionCommentLike(cid, user.id); rerender()
  }

  /** 댓글 수정 — 계정 댓글은 바로, 유동닉 댓글은 비번을 먼저 확인하고 그 비번으로 저장 */
  const startEditComment = async (c: { id: string; body: string; guestName?: string | null }) => {
    if (c.guestName) {
      const pw = prompt('댓글 작성 시 입력한 비밀번호를 입력하세요.')
      if (!pw) return
      const ok = await DS.verifyGuestPost('discussion_comments', c.id, pw)
      if (!ok) { toast('비밀번호가 일치하지 않습니다.'); return }
      setEditingPw(pw)
    }
    setEditingId(c.id); setEditingBody(c.body)
  }

  const saveComment = async (c: { id: string; guestName?: string | null }) => {
    const text = editingBody.trim()
    if (!text) { toast('댓글을 입력하세요.'); return }
    if (text.length > 1000) { toast('댓글은 1000자 이내로 입력해주세요.'); return }
    if (c.guestName) {
      const ok = await DS.updateGuestDiscussionComment(c.id, editingPw, text)
      if (!ok) { toast('비밀번호가 일치하지 않습니다.'); return }
    } else {
      DS.updateDiscussionComment(c.id, text)
    }
    setEditingId(null); setEditingPw(''); toast('댓글을 고쳤어요!'); rerender()
  }

  const removeComment = async (c: { id: string; guestName?: string | null; authorId: string | null }) => {
    const cGuest = !!c.guestName
    if (user && isAccount && !cGuest && (user.id === c.authorId || user.role === 'admin')) {
      if (!confirm('이 댓글을 삭제할까요?')) return
      DS.deleteDiscussionComment(c.id); toast('삭제했습니다.'); rerender()
    } else if (cGuest) {
      const pw = prompt('댓글 작성 시 입력한 비밀번호를 입력하세요.')
      if (pw === null) return
      const ok = await DS.deleteGuestPost('discussion_comments', c.id, pw)
      toast(ok ? '삭제했습니다.' : '비밀번호가 일치하지 않습니다.')
      if (ok) { DS.deleteDiscussionComment(c.id); rerender() }
    }
  }

  return (
    <div className="disc-page fade-in">
      <Seo
        path={`/talk/${post.id}`}
        title={`${post.title || '(제목 없음)'} - ${content.title}`}
        description={post.body}
        image={(!post.spoiler && post.images?.[0]) || content.posterUrl}
        type="article"
      />
      <div className="back-btn" onClick={() => navigate('/talk')}><BackIcon /> 목록으로</div>

      <div className="disc-detail-titlerow">
        {post.rating != null && (
          <span className="disc-rating-pill" style={{ background: scoreColor(post.rating) }} title={scoreLabel(post.rating)}>★ {post.rating}</span>
        )}
        <h1 className="disc-detail-title">{post.title || '(제목 없음)'}</h1>
        {post.spoiler && <span className="disc-spoiler-tag">스포일러</span>}
      </div>
      <div className="disc-detail-meta">
        <LevelTag authorId={post.authorId} />
        <span
          className={`disc-author ${isAccountAuthor ? 'linkable' : 'guest'}`}
          onClick={() => { if (isAccountAuthor) navigate(`/u/${post.authorId}`) }}
        >{author}</span>
        <ExpertTag authorId={post.authorId} />
        <span className="disc-time">
          {timeAgo(post.createdAt)}{post.updatedAt ? ' · 수정됨' : ''}
        </span>
        {canEdit && <button className="disc-del" onClick={editPost}>수정</button>}
        {(canDeleteAccount || isGuest) && <button className="disc-del" onClick={removePost}>삭제</button>}
        {/* 내 글은 신고할 일이 없다 */}
        {post.authorId !== user?.id && (
          <button className="disc-del" onClick={() => reportTarget('discussion', post.id)}>신고</button>
        )}
      </div>

      {post.spoiler && !revealSpoiler && !canDeleteAccount ? (
        <div className="spoiler-cover" onClick={() => setRevealSpoiler(true)}>
          ⚠️ 스포일러가 포함된 글입니다<small>클릭하면 내용을 표시합니다</small>
        </div>
      ) : (
        <div className="disc-detail-body">
          {/* 서식 있는 글은 HTML 로, 옛 글은 평문 그대로. 그릴 때 한 번 더 정화한다 */}
          {post.bodyHtml
            ? <div className="disc-detail-text rich" dangerouslySetInnerHTML={{ __html: sanitizeRichText(post.bodyHtml) }} />
            : <p className="disc-detail-text">{post.body}</p>}
          {/* 짤은 본문 안에 낀다. 본문 밖에 따로 붙이던 시절의 글만 아래에 이어서 보여준다 */}
          {!post.bodyHtml?.includes('<img') && post.images?.length ? (
            <div className="disc-detail-media">
              {post.images.map(url => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt="첨부 이미지" loading="lazy" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <div className="disc-detail-foot">
        <button className={`disc-like ${liked ? 'on' : ''}`} onClick={likePost}>
          <HeartIcon filled={liked} size={14} /> 공감 {post.likes.length || 0}
        </button>
        <span
          className="disc-detail-work"
          onClick={() => navigate(`/content/${content.id}?tab=talk`)}
          title="이 작품방으로 이동">
          {TYPE_EMOJIS[content.type]} {content.title} <span className="disc-detail-work-go">작품방 ›</span>
        </span>
      </div>

      <div className="disc-comments">
        <div className="disc-comments-title">댓글 {comments.length}</div>

        {comments.map(c => {
          const cg = !!c.guestName
          const cName = cg ? c.guestName : (DS.getUserById(c.authorId || '')?.nickname || '탈퇴한 사용자')
          const cLiked = user ? c.likes.includes(user.id) : false
          const cCanDel = (!!user && isAccount && !cg && (user.id === c.authorId || user.role === 'admin')) || cg
          const cCanEdit = (!!user && isAccount && !cg && user.id === c.authorId) || cg
          const cEditing = editingId === c.id
          return (
            <div key={c.id} className="disc-comment">
              <div className="disc-comment-head">
                <span className="disc-author">{cName}</span>
                <span className="disc-time">{timeAgo(c.createdAt)}{c.updatedAt ? ' · 수정됨' : ''}</span>
                {cCanEdit && !cEditing && <button className="disc-del" onClick={() => startEditComment(c)}>수정</button>}
                {cCanDel && !cEditing && <button className="disc-del" onClick={() => removeComment(c)}>삭제</button>}
                {c.authorId !== user?.id && (
                  <button className="disc-del" onClick={() => reportTarget('discussion_comment', c.id)}>신고</button>
                )}
              </div>
              {cEditing ? (
                <div className="disc-comment-edit">
                  <textarea className="disc-input" style={{ minHeight: 54 }} maxLength={1000}
                    value={editingBody} onChange={e => setEditingBody(e.target.value)} autoFocus />
                  <div className="disc-composer-foot">
                    <span className="disc-count">{editingBody.length}/1000</span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-small" onClick={() => { setEditingId(null); setEditingPw('') }}>취소</button>
                      <button className="btn btn-primary btn-small" onClick={() => saveComment(c)} disabled={!editingBody.trim()}>저장</button>
                    </span>
                  </div>
                </div>
              ) : (
                <p className="disc-comment-body">{c.body}</p>
              )}
              <button className={`disc-clike ${cLiked ? 'on' : ''}`} onClick={() => likeComment(c.id)}>
                <HeartIcon filled={cLiked} size={12} /> {c.likes.length || 0}
              </button>
            </div>
          )
        })}

        <div className="disc-comment-composer">
          {!isAccount && <GuestCred name={guestName} pw={guestPw} onName={setGuestName} onPw={setGuestPw} />}
          <textarea
            className="disc-input" style={{ minHeight: 54, marginTop: !isAccount ? 8 : 0 }}
            placeholder="댓글을 남겨보세요" maxLength={1000}
            value={cbody} onChange={e => setCbody(e.target.value)}
          />
          <div className="disc-composer-foot">
            <span className="disc-count">{cbody.length}/1000 {!isAccount && <span style={{ color: 'var(--subtext)' }}>· 유동닉</span>}</span>
            <button className="btn btn-primary btn-small" onClick={submitComment} disabled={!cbody.trim()}>댓글 등록</button>
          </div>
        </div>
      </div>
    </div>
  )
}
