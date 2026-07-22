import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { GuestCred } from '@/components/ui/GuestCred'
import { DiscussionRow } from '@/components/content/DiscussionRow'
import { sha256hex } from '@/utils/helpers'
import '@/styles/discussion.css'

/** 작품방 게시판 — 이 작품의 글 목록(제목+본문) + 글쓰기. 유동닉/고정닉 모두 작성. */
export function DiscussionBoard({ contentId }: { contentId: string }) {
  const navigate = useNavigate()
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const content = DS.getContentById(contentId)
  const [writing, setWriting] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPw, setGuestPw] = useState('')
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  const posts = DS.getDiscussionsByContent(contentId).filter(p => !blockedIds.includes(p.authorId || ''))

  const submit = async () => {
    const head = title.trim()
    const text = body.trim()
    if (!head) { toast('제목을 입력하세요.'); return }
    if (!text) { toast('내용을 입력하세요.'); return }
    if (text.length > 5000) { toast('내용은 5000자 이내로 입력해주세요.'); return }

    if (isAccount && user) {
      DS.createDiscussion({ contentId, authorId: user.id, title: head, body: text })
    } else {
      if (!guestName.trim()) { toast('닉네임을 입력하세요.'); return }
      if (guestPw.length < 4) { toast('비밀번호를 4자 이상 입력하세요. (삭제 시 필요)'); return }
      const hash = await sha256hex(guestPw)
      DS.createDiscussion({ contentId, authorId: null, guestName: guestName.trim(), guestPwHash: hash, title: head, body: text })
      setGuestPw('')
    }
    setTitle(''); setBody(''); setWriting(false); rerender()
  }

  return (
    <div className="disc-wrap">
      <div className="feed-header" style={{ marginTop: 20 }}>
        <h2 className="feed-title">💬 작품방 {posts.length > 0 && <span style={{ color: 'var(--subtext)', fontWeight: 500 }}>{posts.length}</span>}</h2>
        {!writing && <button className="btn btn-primary btn-small" onClick={() => setWriting(true)}>✍️ 글쓰기</button>}
      </div>

      {writing && (
        <div className="disc-composer">
          {!isAccount && <div style={{ marginBottom: 8 }}><GuestCred name={guestName} pw={guestPw} onName={setGuestName} onPw={setGuestPw} /></div>}
          <input className="form-input" style={{ fontWeight: 700, marginBottom: 8 }} placeholder="제목" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} />
          <textarea
            className="disc-input"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="감상·떡밥·추측 뭐든 자유롭게 (출시 전 작품은 기대평도 환영!)"
            maxLength={5000}
            rows={5}
          />
          <div className="disc-composer-foot">
            <span className="disc-count">{body.length}/5000 {!isAccount && <span style={{ color: 'var(--subtext)' }}>· 유동닉</span>}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-small" onClick={() => { setWriting(false); setTitle(''); setBody('') }}>취소</button>
              <button className="btn btn-primary btn-small" onClick={submit} disabled={!title.trim() || !body.trim()}>등록</button>
            </div>
          </div>
        </div>
      )}

      {!posts.length ? (
        <div className="empty-state fade-in"><p>아직 글이 없어요. 첫 글을 남겨보세요!</p></div>
      ) : (
        <div className="disc-board">
          {content && posts.map(p => (
            <DiscussionRow key={p.id} post={p} content={content} onOpen={() => navigate(`/talk/${p.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}
