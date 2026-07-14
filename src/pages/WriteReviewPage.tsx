import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { REVIEW_TAGS, TYPE_LABELS } from '@/utils/constants'
import { BackIcon } from '@/components/ui/Icons'
import { GuestCred } from '@/components/ui/GuestCred'
import { scoreColor, scoreLabel, sha256hex } from '@/utils/helpers'

export function WriteReviewPage() {
  const { contentId, id } = useParams<{ contentId?: string; id?: string }>()
  const navigate = useNavigate()
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [guestName, setGuestName] = useState('')
  const [guestPw, setGuestPw] = useState('')

  const isEdit = !!id
  const existing = isEdit ? DS.getReviewById(id!) : null

  // 편집이면 기존 리뷰의 작품, 아니면 URL의 contentId
  const [selectedContentId, setSelectedContentId] = useState(existing?.contentId || contentId || '')
  const [rating, setRating] = useState(existing?.rating || 0)
  const [title, setTitle] = useState(existing?.title || '')
  const [body, setBody] = useState(existing?.body || '')
  const [spoiler, setSpoiler] = useState(existing?.spoiler || false)
  const [tags, setTags] = useState<string[]>(existing?.tags || [])

  const contents = DS.getContents()

  useEffect(() => {
    if (isEdit && !existing) navigate('/')
  }, [isEdit, existing, navigate])

  // 새 리뷰인데 이미 이 작품에 리뷰가 있으면 수정으로 유도
  useEffect(() => {
    if (!isEdit && user && selectedContentId) {
      const mine = DS.getUserReviewForContent(user.id, selectedContentId)
      if (mine) {
        toast('이미 작성한 리뷰가 있어요. 수정 화면으로 이동합니다.')
        navigate(`/review/edit/${mine.id}`, { replace: true })
      }
    }
  }, [isEdit, user, selectedContentId, navigate, toast])

  const toggleTag = (t: string) => {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : prev.length >= 4 ? prev : [...prev, t])
  }

  const handleSubmit = async () => {
    if (!selectedContentId) { toast('작품을 선택하세요.'); return }
    if (!rating) { toast('점수를 선택하세요.'); return }
    if (!title.trim()) { toast('한줄평(제목)을 입력하세요.'); return }
    if (!body.trim()) { toast('리뷰 내용을 입력하세요.'); return }

    if (isEdit && !isAccount) { toast('유동닉 리뷰는 수정할 수 없어요. 삭제 후 다시 작성해주세요.'); return }

    const base = { contentId: selectedContentId, rating, title: title.trim(), body: body.trim(), spoiler, tags }

    let data
    if (isAccount && user) {
      data = { ...base, authorId: user.id }
    } else {
      if (!guestName.trim()) { toast('닉네임을 입력하세요.'); return }
      if (guestPw.length < 4) { toast('비밀번호를 4자 이상 입력하세요. (삭제 시 필요)'); return }
      data = { ...base, authorId: null, guestName: guestName.trim(), guestPwHash: await sha256hex(guestPw) }
    }

    if (isEdit) {
      DS.updateReview(id!, data)
      toast('리뷰가 수정되었습니다.')
      navigate(`/review/${id}`)
    } else {
      const review = DS.createReview(data)
      toast('리뷰가 등록되었습니다!')
      navigate(`/review/${review.id}`)
    }
  }

  const backTarget = isEdit ? `/review/${id}` : (selectedContentId ? `/content/${selectedContentId}` : '/browse')

  return (
    <>
      <div className="back-btn" onClick={() => navigate(backTarget)}><BackIcon /> 돌아가기</div>
      <div className="write-page fade-in">
        <h2>{isEdit ? '리뷰 수정' : '리뷰 쓰기'}</h2>

        {!isEdit && !isAccount && (
          <div className="form-group">
            <label>유동닉 (닉네임 + 삭제용 비밀번호)</label>
            <GuestCred name={guestName} pw={guestPw} onName={setGuestName} onPw={setGuestPw} />
          </div>
        )}

        <div className="form-group">
          <label>작품</label>
          <select value={selectedContentId} onChange={e => setSelectedContentId(e.target.value)} disabled={isEdit}>
            <option value="">작품을 선택하세요</option>
            {contents.map(c => (
              <option key={c.id} value={c.id}>[{TYPE_LABELS[c.type]}] {c.title}</option>
            ))}
          </select>
          {!contents.length && <p style={{ fontSize: 12, color: 'var(--subtext)', marginTop: 6 }}>등록된 작품이 없습니다. 관리자에게 작품 등록을 요청하세요.</p>}
        </div>

        <div className="form-group">
          <label>점수 (1~10)</label>
          <div className="rating-input">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button key={n} type="button" className={rating === n ? 'active' : ''} onClick={() => setRating(n)}>{n}</button>
            ))}
          </div>
          {rating > 0 && (
            <div className="rating-current" style={{ color: scoreColor(rating) }}>
              {rating}.0 <span style={{ fontSize: 14, color: 'var(--subtext)', fontWeight: 600 }}>· {scoreLabel(rating)}</span>
            </div>
          )}
        </div>

        <div className="form-group">
          <label>한줄평</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="직설적으로! 예: 기대했는데 용두사미" maxLength={60} />
        </div>

        <div className="form-group">
          <label>리뷰 내용</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="솔직하고 적나라하게 평가해주세요. 근거 있는 혹평은 환영입니다." />
        </div>

        <div className="form-group">
          <label>감정 태그 (최대 4개)</label>
          <div className="tag-chips">
            {REVIEW_TAGS.map(t => (
              <span key={t} className={`tag-chip ${tags.includes(t) ? 'active' : ''}`} onClick={() => toggleTag(t)}>{t}</span>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input type="checkbox" checked={spoiler} onChange={e => setSpoiler(e.target.checked)} />
            스포일러 포함 (리뷰 내용을 가림 처리합니다)
          </label>
        </div>

        <div className="write-actions">
          <button className="btn btn-secondary" onClick={() => navigate(backTarget)}>취소</button>
          <button className="btn btn-primary" onClick={handleSubmit}>{isEdit ? '수정하기' : '등록하기'}</button>
        </div>
      </div>
    </>
  )
}
