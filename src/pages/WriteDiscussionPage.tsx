import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { GuestCred } from '@/components/ui/GuestCred'
import { TalkBodyEditor, cleanBodyHtml } from '@/components/content/TalkBodyEditor'
import { BackIcon } from '@/components/ui/Icons'
import { Seo } from '@/components/seo/Seo'
import { TYPE_LABELS } from '@/utils/constants'
import { scoreColor, scoreLabel, sha256hex } from '@/utils/helpers'
import { richTextToPlain, plainToRichText, extractImageUrls } from '@/utils/richText'
import type { Content } from '@/types'
import '@/styles/discussion.css'

/** 방구석토론방 글쓰기(통합) — 한 화면에서 작품 선택 + 본문 + 별점 + 스포일러.
 *  작품·본문은 필수, 나머지는 선택. 한 작품엔 별점을 한 번만 매길 수 있다.
 *  ?contentId=... 로 진입하면 해당 작품이 미리 선택된다.
 *  ?edit=<글id> 로 진입하면 그 글을 고쳐 쓴다(작품은 못 바꾼다). */
export function WriteDiscussionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)

  const editing = searchParams.get('edit')
    ? DS.getDiscussions().find(d => d.id === searchParams.get('edit')) ?? null
    : null
  // 유동닉 글 수정은 서버가 비번을 다시 확인한다. 상세 페이지에서 확인한 비번을 들고 온다.
  const [guestPwForEdit, setGuestPwForEdit] = useState<string>((location.state as any)?.guestPw || '')

  const preselected = searchParams.get('contentId')
  const [picked, setPicked] = useState<Content | null>(
    editing ? DS.getContentById(editing.contentId) ?? null
      : preselected ? DS.getContentById(preselected) ?? null : null
  )
  const [q, setQ] = useState('')
  const [title, setTitle] = useState(editing?.title || '')
  // 본문은 서식 있는 HTML 로 다룬다. 서식 없이 쓴 옛 글은 평문을 HTML 로 감싸서 연다.
  // 짤을 본문 밖에 따로 붙이던 시절의 글은, 열 때 본문 끝에 이어 붙여 준다.
  const [bodyHtml, setBodyHtml] = useState(() => {
    if (!editing) return ''
    const base = editing.bodyHtml || (editing.body ? plainToRichText(editing.body) : '')
    const inBody = extractImageUrls(base)
    const legacy = (editing.images || []).filter(u => !inBody.includes(u))
    return base + legacy.map(u => `<div><img src="${u}" alt=""></div>`).join('')
  })
  const body = richTextToPlain(bodyHtml)
  // 짤 목록은 본문에서 뽑아 쓴다 (목록의 🖼 표시·공유 이미지용)
  const images = extractImageUrls(bodyHtml)
  const [rating, setRating] = useState(editing?.rating || 0)  // 0 = 별점 없음(선택)
  const [spoiler, setSpoiler] = useState(!!editing?.spoiler)
  const [guestName, setGuestName] = useState('')
  const [guestPw, setGuestPw] = useState('')
  const [saving, setSaving] = useState(false)

  // 통합검색(Header)·본 작품 등록과 같은 소스를 쓴다.
  // 예전엔 여기만 원문 substring 이라 "유퀴즈"로 "유 퀴즈 온 더 블럭"이 안 잡혔고,
  // 원제·감독으로도 못 찾았고, 숨긴 작품이 그대로 떴다.
  const matches = useMemo(() => {
    const query = q.trim()
    if (!query) return []
    return DS.searchContents(query, 12)
  }, [q])

  // 이 작품에 이미 별점을 매겼나? (1작품 1별점 · 지금 고치는 글 자신은 제외)
  const rated = picked && user && isAccount ? DS.getUserRatingForContent(user.id, picked.id) : undefined
  const alreadyRated = !!rated && rated.id !== editing?.id

  /** 고쳐 쓰기 — 계정 글은 그대로 update, 유동닉 글은 비번 검증 RPC 로 */
  const saveEdit = async (patch: { title: string; body: string; bodyHtml: string | null; rating: number | null; spoiler: boolean; images: string[] }) => {
    if (!editing) return
    if (editing.guestName) {
      let pw = guestPwForEdit
      if (!pw) {
        pw = prompt('글 작성 시 입력한 비밀번호를 입력하세요.') || ''
        if (!pw) return
        setGuestPwForEdit(pw)
      }
      const ok = await DS.updateGuestDiscussion(editing.id, pw, patch)
      if (!ok) { setGuestPwForEdit(''); toast('비밀번호가 일치하지 않습니다.'); return }
    } else {
      DS.updateDiscussion(editing.id, patch)
    }
    toast('글을 고쳤어요!')
    navigate(`/talk/${editing.id}`)
  }

  const submit = async () => {
    if (!picked) { toast('작품을 먼저 선택하세요.'); return }
    const head = title.trim()
    if (!head) { toast('제목을 입력하세요.'); return }
    if (head.length > 80) { toast('제목은 80자 이내로 입력해주세요.'); return }
    const text = body.trim()
    if (!text && !images.length) { toast('내용을 입력하세요.'); return }   // 짤만 있는 글도 허용
    if (text.length > 5000) { toast('내용은 5000자 이내로 입력해주세요.'); return }
    const useRating = !alreadyRated && rating > 0 ? rating : null

    // 서식은 허용 목록만 남기고 정화해서 저장한다 (평문 body 는 목록·검색·공유용 사본)
    const safeHtml = cleanBodyHtml(bodyHtml) || null
    const safeImages = safeHtml ? extractImageUrls(safeHtml) : []

    setSaving(true)
    try {
      if (editing) {
        await saveEdit({ title: head, body: text, bodyHtml: safeHtml, rating: useRating, spoiler, images: safeImages })
        return
      }
      const base = { contentId: picked.id, title: head, body: text, bodyHtml: safeHtml, rating: useRating, spoiler, images: safeImages }
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
      <Seo title={editing ? '방구석토론방 글 수정' : '방구석토론방 글쓰기'} noindex />
      <div className="back-btn" onClick={() => navigate(editing ? `/talk/${editing.id}` : '/talk')}>
        <BackIcon /> {editing ? '글로 돌아가기' : '방구석토론방'}
      </div>

      <div className="feed-header">
        <h2 className="feed-title">{editing ? '✏️ 방구석토론방 글 수정' : '✍️ 방구석토론방 글쓰기'}</h2>
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
              {/* 수정 중엔 작품을 못 바꾼다 — 별점 집계가 딸린 작품에 묶여 있어서 */}
              {!editing && (
                <button className="btn-text btn-small" style={{ marginLeft: 'auto' }} onClick={() => { setPicked(null); setRating(0) }}>변경</button>
              )}
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

        {!isAccount && !editing && (
          <div className="form-group">
            <label>유동닉 (닉네임 + 삭제용 비밀번호)</label>
            <GuestCred name={guestName} pw={guestPw} onName={setGuestName} onPw={setGuestPw} />
            <p className="write-notice">※ 쉬운 비밀번호를 쓰면 남이 글을 지울 수 있어요.</p>
          </div>
        )}

        {/* 제목 (필수) */}
        <div className="form-group">
          <label>제목 <span className="req">*</span></label>
          <input className="form-input" placeholder="제목" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        {/* 본문 (필수) + 움짤·이미지 첨부(선택) */}
        <div className="form-group">
          <label>내용 <span className="req">*</span></label>
          <TalkBodyEditor html={bodyHtml} onHtml={setBodyHtml} />
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

        <p className="write-notice">
          ※ 저작권 침해·비하·혐오 게시물은 예고 없이 삭제되고, 법적 책임을 질 수 있습니다.
        </p>

        <div className="write-actions">
          <button className="btn btn-secondary" onClick={() => navigate(editing ? `/talk/${editing.id}` : '/talk')}>취소</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !picked || !title.trim() || (!body.trim() && !images.length)}>
            {saving ? (editing ? '고치는 중…' : '올리는 중…') : (editing ? '수정 완료' : '글 올리기')}
          </button>
        </div>
      </div>
    </>
  )
}
