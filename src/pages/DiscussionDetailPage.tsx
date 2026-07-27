import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { GuestCred } from '@/components/ui/GuestCred'
import { BackIcon, HeartIcon } from '@/components/ui/Icons'
import { TYPE_EMOJIS } from '@/utils/constants'
import { timeAgo, sha256hex } from '@/utils/helpers'
import { Seo } from '@/components/seo/Seo'
import '@/styles/discussion.css'

/** 방구석토론방 게시글 상세 — 전체 페이지 (디시 스타일 창 전환). 제목·본문 + 댓글. */
export function DiscussionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  const [cbody, setCbody] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPw, setGuestPw] = useState('')

  const post = DS.getDiscussions().find(d => d.id === id)
  const content = post ? DS.getContentById(post.contentId) : undefined
  if (!post || !content) { navigate('/talk'); return null }

  const isGuest = !!post.guestName
  const author = isGuest ? post.guestName : (DS.getUserById(post.authorId || '')?.nickname || '탈퇴한 사용자')
  const liked = user ? post.likes.includes(user.id) : false
  const canDeleteAccount = !!user && isAccount && !isGuest && (user.id === post.authorId || user.role === 'admin')
  const comments = DS.getDiscussionCommentsByPost(post.id)

  const likePost = () => {
    if (!user) { toast('로그인 후 이용해주세요.'); return }
    if (!isAccount) { toast('공감은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    DS.toggleDiscussionLike(post.id, user.id); rerender()
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
        image={content.posterUrl}
        type="article"
      />
      <div className="back-btn" onClick={() => navigate('/talk')}><BackIcon /> 목록으로</div>

      <h1 className="disc-detail-title">{post.title || '(제목 없음)'}</h1>
      <div className="disc-detail-meta">
        <span className="disc-author">{author}</span>
        <span className="disc-time">{timeAgo(post.createdAt)}</span>
        {(canDeleteAccount || isGuest) && <button className="disc-del" onClick={removePost}>삭제</button>}
      </div>

      <p className="disc-detail-body">{post.body}</p>

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
          return (
            <div key={c.id} className="disc-comment">
              <div className="disc-comment-head">
                <span className="disc-author">{cName}</span>
                <span className="disc-time">{timeAgo(c.createdAt)}</span>
                {cCanDel && <button className="disc-del" onClick={() => removeComment(c)}>삭제</button>}
              </div>
              <p className="disc-comment-body">{c.body}</p>
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
