import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { HeartIcon } from '@/components/ui/Icons'
import { timeAgo, sha256hex } from '@/utils/helpers'
import '@/styles/discussion.css'

/** 출시 전 작품의 기대평·떡밥 수다방 (content 단위, 평점 없음). 유동닉/고정닉 모두 작성 */
export function DiscussionBoard({ contentId }: { contentId: string }) {
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [body, setBody] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPw, setGuestPw] = useState('')
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  const posts = DS.getDiscussionsByContent(contentId).filter(p => !blockedIds.includes(p.authorId || ''))

  const submit = async () => {
    const text = body.trim()
    if (!text) { toast('내용을 입력하세요.'); return }
    if (text.length > 500) { toast('500자 이내로 입력해주세요.'); return }

    if (isAccount && user) {
      DS.createDiscussion({ contentId, authorId: user.id, body: text })
    } else {
      // 유동닉: 닉네임 + 비밀번호
      if (!guestName.trim()) { toast('닉네임을 입력하세요.'); return }
      if (guestPw.length < 4) { toast('비밀번호를 4자 이상 입력하세요. (삭제 시 필요)'); return }
      const hash = await sha256hex(guestPw)
      DS.createDiscussion({ contentId, authorId: null, guestName: guestName.trim(), guestPwHash: hash, body: text })
      setGuestPw('')
    }
    setBody(''); rerender()
  }

  const like = (id: string) => {
    if (!user) return
    if (!isAccount) { toast('공감은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    DS.toggleDiscussionLike(id, user.id); rerender()
  }

  const removeAccountPost = (id: string) => {
    if (!confirm('이 글을 삭제할까요?')) return
    DS.deleteDiscussion(id); toast('삭제했습니다.'); rerender()
  }

  const removeGuestPost = async (id: string) => {
    const pw = prompt('글 작성 시 입력한 비밀번호를 입력하세요.')
    if (pw === null) return
    const ok = await DS.deleteGuestPost('discussions', id, pw)
    toast(ok ? '삭제했습니다.' : '비밀번호가 일치하지 않습니다.')
    if (ok) rerender()
  }

  return (
    <div className="disc-wrap">
      <div className="feed-header" style={{ marginTop: 20 }}>
        <h2 className="feed-title">💬 기대평 · 수다방 {posts.length > 0 && <span style={{ color: 'var(--subtext)', fontWeight: 500 }}>{posts.length}</span>}</h2>
      </div>

      <div className="disc-composer">
        {!isAccount && (
          <div className="disc-guest-row">
            <input className="disc-guest-input" placeholder="닉네임" maxLength={12} value={guestName} onChange={e => setGuestName(e.target.value)} />
            <input className="disc-guest-input" type="password" placeholder="비밀번호(삭제용)" maxLength={20} value={guestPw} onChange={e => setGuestPw(e.target.value)} />
          </div>
        )}
        <textarea
          className="disc-input"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="아직 안 나온 작품, 기대되는 점·떡밥·추측 뭐든 나눠보세요! (평점은 공개 후에)"
          maxLength={520}
          rows={3}
        />
        <div className="disc-composer-foot">
          <span className="disc-count">{body.length}/500 {!isAccount && <span style={{ color: 'var(--subtext)' }}>· 유동닉</span>}</span>
          <button className="btn btn-primary btn-small" onClick={submit} disabled={!body.trim()}>기대평 남기기</button>
        </div>
      </div>

      {!posts.length ? (
        <div className="empty-state fade-in"><p>첫 기대평을 남겨보세요! 이 작품을 기다리는 사람들이 모입니다.</p></div>
      ) : (
        <div className="disc-list">
          {posts.map(p => {
            const isGuest = !!p.guestName
            const displayName = isGuest ? p.guestName : (DS.getUserById(p.authorId || '')?.nickname || '탈퇴한 사용자')
            const liked = user ? p.likes.includes(user.id) : false
            const canDeleteAccount = user && isAccount && !isGuest && (user.id === p.authorId || user.role === 'admin')
            return (
              <div key={p.id} className="disc-item fade-in">
                <div className="disc-item-head">
                  <span className="disc-author">{displayName}</span>
                  {isGuest && <span className="disc-guest-badge">유동</span>}
                  <span className="disc-time">{timeAgo(p.createdAt)}</span>
                  {canDeleteAccount && <button className="disc-del" onClick={() => removeAccountPost(p.id)}>삭제</button>}
                  {isGuest && <button className="disc-del" onClick={() => removeGuestPost(p.id)}>삭제</button>}
                </div>
                <p className="disc-body">{p.body}</p>
                <div className="disc-item-foot">
                  <button className={`disc-like ${liked ? 'on' : ''}`} onClick={() => like(p.id)}>
                    <HeartIcon filled={liked} size={14} /> {p.likes.length > 0 ? p.likes.length : '공감'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
