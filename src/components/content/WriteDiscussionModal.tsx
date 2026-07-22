import { useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { GuestCred } from '@/components/ui/GuestCred'
import { TYPE_LABELS } from '@/utils/constants'
import { sha256hex } from '@/utils/helpers'
import type { Content } from '@/types'

/** 방구석토론방 글쓰기 — 작품을 고르고 글을 쓴다 (수다방 discussions로 저장) */
export function WriteDiscussionModal({ onClose, onPosted }: {
  onClose: () => void
  onPosted: () => void
}) {
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)

  const [picked, setPicked] = useState<Content | null>(null)
  const [q, setQ] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPw, setGuestPw] = useState('')
  const [saving, setSaving] = useState(false)

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return []
    return DS.getContents()
      .filter(c => c.title.toLowerCase().includes(query))
      .slice(0, 20)
  }, [q])

  const overlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() }

  const submit = async () => {
    if (!picked) { toast('작품을 먼저 선택하세요.'); return }
    const head = title.trim()
    const text = body.trim()
    if (!head) { toast('제목을 입력하세요.'); return }
    if (head.length > 80) { toast('제목은 80자 이내로 입력해주세요.'); return }
    if (!text) { toast('내용을 입력하세요.'); return }
    if (text.length > 5000) { toast('내용은 5000자 이내로 입력해주세요.'); return }
    setSaving(true)
    try {
      if (isAccount && user) {
        DS.createDiscussion({ contentId: picked.id, authorId: user.id, title: head, body: text })
      } else {
        if (!guestName.trim()) { toast('닉네임을 입력하세요.'); setSaving(false); return }
        if (guestPw.length < 4) { toast('비밀번호를 4자 이상 입력하세요. (삭제 시 필요)'); setSaving(false); return }
        const hash = await sha256hex(guestPw)
        DS.createDiscussion({ contentId: picked.id, authorId: null, guestName: guestName.trim(), guestPwHash: hash, title: head, body: text })
      }
      toast('글을 올렸어요!')
      onPosted()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay show" onClick={overlayClick}>
      <div className="modal" style={{ maxWidth: 460, width: '92vw' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>✍️ 방구석토론방 글쓰기</h3>

        {/* 작품 선택 */}
        {!picked ? (
          <>
            <p style={{ color: 'var(--subtext)', fontSize: 13, marginBottom: 8 }}>어떤 작품에 대한 글인가요?</p>
            <input className="form-input" autoFocus placeholder="작품 제목 검색" value={q} onChange={e => setQ(e.target.value)} />
            <div className="tmdb-results">
              {matches.map(c => (
                <div key={c.id} className="tmdb-result" onClick={() => setPicked(c)}>
                  {c.posterUrl ? <img src={c.posterUrl} alt={c.title} /> : <div className="noimg">No Image</div>}
                  <div>
                    <div className="t">{c.title}</div>
                    <div className="m">{TYPE_LABELS[c.type]}{c.releaseYear ? ` · ${c.releaseYear}` : ''}</div>
                  </div>
                </div>
              ))}
              {q.trim() && !matches.length && (
                <p style={{ color: 'var(--subtext)', fontSize: 13, marginTop: 8 }}>일치하는 작품이 없어요. (없는 작품은 내 피드 등록으로 추가할 수 있어요)</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="tmdb-result" style={{ cursor: 'default', background: 'var(--bg)' }}>
              {picked.posterUrl ? <img src={picked.posterUrl} alt={picked.title} /> : <div className="noimg">No Image</div>}
              <div>
                <div className="t">{picked.title}</div>
                <div className="m">{TYPE_LABELS[picked.type]}{picked.releaseYear ? ` · ${picked.releaseYear}` : ''}</div>
              </div>
              <button className="btn-text btn-small" style={{ marginLeft: 'auto' }} onClick={() => setPicked(null)}>변경</button>
            </div>

            {!isAccount && <div style={{ marginTop: 12 }}><GuestCred name={guestName} pw={guestPw} onName={setGuestName} onPw={setGuestPw} /></div>}

            <input
              className="form-input" style={{ marginTop: 10, fontWeight: 700 }}
              placeholder="제목" maxLength={80} value={title} onChange={e => setTitle(e.target.value)}
            />
            <textarea
              className="form-input" style={{ marginTop: 8, minHeight: 140, resize: 'vertical' }}
              placeholder="이 작품에 대한 감상·떡밥·추천 뭐든 자유롭게!"
              maxLength={5000} value={body} onChange={e => setBody(e.target.value)}
            />
            <div className="modal-actions" style={{ alignItems: 'center' }}>
              <span className="disc-count" style={{ marginRight: 'auto', fontSize: 12, color: 'var(--subtext)' }}>{body.length}/5000</span>
              <button className="btn btn-primary" onClick={submit} disabled={saving || !title.trim() || !body.trim()}>
                {saving ? '올리는 중…' : '글 올리기'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
