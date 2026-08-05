import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { GuestCred } from '@/components/ui/GuestCred'
import { BackIcon } from '@/components/ui/Icons'
import { Seo } from '@/components/seo/Seo'
import { TYPE_LABELS } from '@/utils/constants'
import { scoreColor, scoreLabel, sha256hex } from '@/utils/helpers'
import type { Content } from '@/types'
import '@/styles/discussion.css'

/** 방구석토론방 글쓰기(통합) — 한 화면에서 작품 선택 + 본문 + 별점 + 스포일러.
 *  작품·본문은 필수, 나머지는 선택. 한 작품엔 별점을 한 번만 매길 수 있다.
 *  ?contentId=... 로 진입하면 해당 작품이 미리 선택된다. */
export function WriteDiscussionPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)

  const preselected = searchParams.get('contentId')
  const [picked, setPicked] = useState<Content | null>(preselected ? DS.getContentById(preselected) ?? null : null)
  const [q, setQ] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [rating, setRating] = useState(0)         // 0 = 별점 없음(선택)
  const [spoiler, setSpoiler] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestPw, setGuestPw] = useState('')
  const [saving, setSaving] = useState(false)

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return []
    return DS.getContents().filter(c => c.title.toLowerCase().includes(query)).slice(0, 12)
  }, [q])

  // 이 작품에 이미 별점을 매겼나? (1작품 1별점)
  const alreadyRated = !!(picked && user && isAccount && DS.getUserRatingForContent(user.id, picked.id))

  const submit = async () => {
    if (!picked) { toast('작품을 먼저 선택하세요.'); return }
    const text = body.trim()
    if (!text) { toast('내용을 입력하세요.'); return }
    if (text.length > 5000) { toast('내용은 5000자 이내로 입력해주세요.'); return }
    const head = title.trim()
    if (head.length > 80) { toast('제목은 80자 이내로 입력해주세요.'); return }
    const useRating = !alreadyRated && rating > 0 ? rating : null

    setSaving(true)
    try {
      const base = { contentId: picked.id, title: head || null, body: text, rating: useRating, spoiler }
      let created
      if (isAccount && user) {
        created = DS.createDiscussion({ ...base, authorId: user.id })
      } else {
        if (!guestName.trim()) { toast('닉네임을 입력하세요.'); setSaving(false); return }
        if (guestPw.length < 4) { toast('비밀번호를 4자 이상 입력하세요. (삭제 시 필요)'); setSaving(false); return }
        const hash = await sha256hex(guestPw)
        created = DS.createDiscussion({ ...base, authorId: null, guestName: guestName.trim(), guestPwHash: hash })
      }
      toast('글을 올렸어요!')
      navigate(`/talk/${created.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Seo title="방구석토론방 글쓰기" noindex />
      <div className="back-btn" onClick={() => navigate('/talk')}><BackIcon /> 방구석토론방</div>

      <div className="feed-header">
        <h2 className="feed-title">✍️ 방구석토론방 글쓰기</h2>
      </div>

      <div className="disc-write-page fade-in">
        {/* 작품 선택 (필수) */}
        <div className="form-group">
          <label>작품 <span className="req">*</span></label>
          {picked ? (
            <div className="tmdb-result picked">
              {picked.posterUrl ? <img src={picked.posterUrl} alt={picked.title} /> : <div className="noimg">No Image</div>}
              <div>
                <div className="t">{picked.title}</div>
                <div className="m">{TYPE_LABELS[picked.type]}{picked.releaseYear ? ` · ${picked.releaseYear}` : ''}</div>
              </div>
              <button className="btn-text btn-small" style={{ marginLeft: 'auto' }} onClick={() => { setPicked(null); setRating(0) }}>변경</button>
            </div>
          ) : (
            <>
              <input className="form-input" placeholder="작품 제목 검색" value={q} onChange={e => setQ(e.target.value)} />
              {matches.length > 0 && (
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
                </div>
              )}
              {q.trim() && !matches.length && (
                <p style={{ color: 'var(--subtext)', fontSize: 13, marginTop: 8 }}>일치하는 작품이 없어요. (없는 작품은 내 피드 등록으로 추가할 수 있어요)</p>
              )}
            </>
          )}
        </div>

        {!isAccount && (
          <div className="form-group">
            <label>유동닉 (닉네임 + 삭제용 비밀번호)</label>
            <GuestCred name={guestName} pw={guestPw} onName={setGuestName} onPw={setGuestPw} />
          </div>
        )}

        {/* 제목 (선택) */}
        <div className="form-group">
          <label>제목 <span className="opt">선택</span></label>
          <input className="form-input" placeholder="제목 (비워도 됨)" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        {/* 본문 (필수) */}
        <div className="form-group">
          <label>내용 <span className="req">*</span></label>
          <textarea
            className="form-input" style={{ minHeight: 200, resize: 'vertical' }}
            placeholder="이 작품에 대한 감상·떡밥·추천 뭐든 자유롭게!"
            maxLength={5000} value={body} onChange={e => setBody(e.target.value)}
          />
          <span className="disc-count" style={{ fontSize: 12, color: 'var(--subtext)' }}>{body.length}/5000</span>
        </div>

        {/* 별점 (선택 · 1작품 1회) */}
        <div className="form-group">
          <label>별점 <span className="opt">선택</span></label>
          {alreadyRated ? (
            <p style={{ fontSize: 13, color: 'var(--subtext)' }}>이미 이 작품에 별점을 매겼어요. 별점은 작품당 한 번만 매길 수 있어요. (글은 계속 쓸 수 있어요)</p>
          ) : (
            <>
              <div className="rating-input">
                <button type="button" className={rating === 0 ? 'active' : ''} onClick={() => setRating(0)}>없음</button>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <button key={n} type="button" className={rating === n ? 'active' : ''} onClick={() => setRating(n)}>{n}</button>
                ))}
              </div>
              {rating > 0 && (
                <div className="rating-current" style={{ color: scoreColor(rating) }}>
                  {rating}.0 <span style={{ fontSize: 14, color: 'var(--subtext)', fontWeight: 600 }}>· {scoreLabel(rating)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 스포일러 (선택) */}
        <div className="form-group">
          <label className="checkbox-label">
            <input type="checkbox" checked={spoiler} onChange={e => setSpoiler(e.target.checked)} />
            스포일러 포함 (본문을 가림 처리합니다)
          </label>
        </div>

        <div className="write-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/talk')}>취소</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !picked || !body.trim()}>
            {saving ? '올리는 중…' : '글 올리기'}
          </button>
        </div>
      </div>
    </>
  )
}
