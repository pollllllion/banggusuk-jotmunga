import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { GuestCred } from '@/components/ui/GuestCred'
import { TalkBodyEditor, cleanBodyHtml } from '@/components/content/TalkBodyEditor'
import { BackIcon } from '@/components/ui/Icons'
import { Seo } from '@/components/seo/Seo'
import { LoginGateModal } from '@/components/auth/LoginGateModal'
import { PosterUploader } from '@/components/content/PosterUploader'
import { CONTENT_TYPES, TYPE_LABELS } from '@/utils/constants'
import { normalizeTitle, scoreColor, scoreLabel, sha256hex } from '@/utils/helpers'
import { richTextToPlain, plainToRichText, extractImageUrls } from '@/utils/richText'
import { searchTmdbAll, tmdbEnabled, tmdbContentId, tmdbResultType, type TmdbResult } from '@/utils/tmdb'
import type { Content, DiscussionBoard } from '@/types'
import '@/styles/discussion.css'

/** 방구석토론방 글쓰기(통합) — 한 화면에서 작품 선택 + 본문 + 별점 + 스포일러.
 *  작품·본문은 필수, 나머지는 선택. 한 작품엔 별점을 한 번만 매길 수 있다.
 *  ?contentId=... 로 진입하면 해당 작품이 미리 선택된다.
 *  ?edit=<글id> 로 진입하면 그 글을 고쳐 쓴다(작품은 못 바꾼다). */
export function WriteDiscussionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user, isAccount, initialized } = useAuthStore()
  const toast = useToastStore(s => s.show)

  const editing = searchParams.get('edit')
    ? DS.getDiscussions().find(d => d.id === searchParams.get('edit')) ?? null
    : null
  // 유동닉 글 수정은 서버가 비번을 다시 확인한다. 상세 페이지에서 확인한 비번을 들고 온다.
  const [guestPwForEdit, setGuestPwForEdit] = useState<string>((location.state as any)?.guestPw || '')

  const preselected = searchParams.get('contentId')

  // 자유방(?board=relay) 글은 작품에 묶이지 않는다 — 작품 선택과 별점을 통째로 뺀다.
  // 고쳐 쓸 때는 URL 이 아니라 글 자신의 게시판을 따른다(다른 게시판으로 옮겨지면 안 된다).
  const board: DiscussionBoard = editing ? (editing.board || 'talk')
    : searchParams.get('board') === 'relay' ? 'relay' : 'talk'
  const isFree = board === 'relay'
  /** 목록으로 돌아갈 곳 */
  const boardPath = isFree ? '/board/relay' : '/talk'
  const boardLabel = isFree ? '자유방' : '방구석토론방'
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

  // 글쓰기에 들어오면 로그인 창을 한 번 띄운다. '비회원으로 글쓰기'를 고르면 유동닉으로 계속 쓴다.
  // 이미 쓴 글을 고치러 온 경우(?edit=)는 막지 않는다 — 유동닉 글 수정은 비번으로 따로 확인한다.
  // editing 이 아니라 쿼리스트링을 보는 이유: 목록이 아직 안 실려 있으면 editing 이 잠깐 null 이다.
  const [guestChosen, setGuestChosen] = useState(false)
  const showLoginGate = initialized && !isAccount && !searchParams.get('edit') && !guestChosen

  const [tmdbHits, setTmdbHits] = useState<TmdbResult[]>([])
  const [tmdbLoading, setTmdbLoading] = useState(false)
  const [resolving, setResolving] = useState(false)

  // 우리 DB 먼저 — 통합검색(Header)·본 작품 등록과 같은 소스.
  const matches = useMemo(() => {
    const query = q.trim()
    if (!query) return []
    return DS.searchContents(query, 12)
  }, [q])

  /**
   * DB에 없는 작품까지 찾도록 TMDB로 한 번 더 검색한다 — 통합검색·본 작품 등록과 같은 방식.
   * 우리 contents 는 개봉·공개 캘린더로 채워져서 2026년 위주다. '유 퀴즈 온 더 블럭', '스킨스'
   * 처럼 예전 작품은 DB에 아예 없어서, 로컬 검색만으로는 무슨 수를 써도 안 나온다.
   * alive 플래그로 늦게 도착한 이전 입력의 응답이 최신 결과를 덮지 않게 막는다.
   */
  useEffect(() => {
    const query = q.trim()
    if (!tmdbEnabled || query.length < 2) { setTmdbHits([]); setTmdbLoading(false); return }
    let alive = true
    setTmdbLoading(true)
    const timer = setTimeout(async () => {
      try {
        const r = await searchTmdbAll(query)
        // 이미 DB에 있는 작품은 위쪽 목록에 나오므로 뺀다 (시즌별 행이 있는 경우 포함)
        if (alive) setTmdbHits(r.filter(x => !DS.hasTmdbContent(x.kind, x.tmdbId)).slice(0, 8))
      } catch {
        if (alive) setTmdbHits([])   // 실시간이라 키마다 토스트는 안 띄움
      } finally {
        if (alive) setTmdbLoading(false)
      }
    }, 350)
    return () => { alive = false; clearTimeout(timer) }
  }, [q])

  // 직접 등록(웹툰·웹소설) — TMDB 에 없는 타입이라 검색으로는 못 만든다.
  // 글 제목(title)과 이름이 겹치지 않게 접두사를 붙였다.
  const [manual, setManual] = useState(false)
  const [mType, setMType] = useState<'webtoon' | 'webnovel'>('webtoon')
  const [mTitle, setMTitle] = useState('')
  const [mPlatform, setMPlatform] = useState('')
  const [mPoster, setMPoster] = useState('')

  // 직접 등록 시 DB에 이미 있는 같은 작품 후보 — 고르면 새 행을 만들지 않는다.
  const manualSuggestions = useMemo<Content[]>(() => {
    const key = normalizeTitle(mTitle)
    if (!key) return []
    return DS.getContents()
      .filter(c => c.type === mType && !c.id.startsWith('tmdb-') && normalizeTitle(c.title).includes(key))
      .slice(0, 6)
  }, [mTitle, mType])

  const submitManual = async () => {
    if (!mTitle.trim()) { toast('제목을 입력해주세요.'); return }
    if (resolving) return
    setResolving(true)
    try {
      setPicked(await DS.createManualContent({
        type: mType,
        title: mTitle.trim(),
        platform: mPlatform.trim() || null,
        posterUrl: mPoster.trim() || null,
      }))
      setManual(false)
    } catch (e: any) {
      toast(e?.message || '작품 등록에 실패했어요.')
    } finally {
      setResolving(false)
    }
  }

  /** TMDB 결과 선택 — 그 작품을 DB에 만들고(이미 있으면 기존 행) 그걸 고른 것으로 친다. */
  const pickTmdb = async (r: TmdbResult) => {
    if (resolving) return
    setResolving(true)
    try {
      const type = tmdbResultType(r)
      setPicked(await DS.ensureContent({
        contentId: tmdbContentId(type, r.tmdbId),
        type,
        title: r.title,
        posterUrl: r.posterUrl,
        releaseYear: r.year,
        synopsis: r.overview,
      }))
    } catch (e: any) {
      toast(e?.message || '작품을 불러오지 못했어요.')
    } finally {
      setResolving(false)
    }
  }

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
    if (!isFree && !picked) { toast('작품을 먼저 선택하세요.'); return }
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
      const base = {
        contentId: isFree ? null : picked!.id,
        board,
        title: head, body: text, bodyHtml: safeHtml,
        rating: isFree ? null : useRating,
        spoiler, images: safeImages,
      }
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
      <Seo title={`${boardLabel} 글 ${editing ? '수정' : '쓰기'}`} noindex />
      <div className="back-btn" onClick={() => navigate(editing ? `/talk/${editing.id}` : boardPath)}>
        <BackIcon /> {editing ? '글로 돌아가기' : boardLabel}
      </div>

      <div className="feed-header">
        <h2 className="feed-title">{editing ? '✏️' : '✍️'} {boardLabel} 글 {editing ? '수정' : '쓰기'}</h2>
      </div>

      <div className="disc-write-page fade-in">
        {/* 작품 선택 (필수) — 자유방은 작품이 없으므로 통째로 뺀다 */}
        {!isFree && (
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
          ) : manual ? (
            /* 직접 등록 (웹툰·웹소설) — TMDB 에 없어서 검색으로는 만들 수 없는 타입 */
            <>
              <button className="btn-text btn-small" onClick={() => setManual(false)} style={{ marginBottom: 8 }}>‹ 검색으로 돌아가기</button>
              {!isAccount ? (
                <p style={{ color: 'var(--subtext)', fontSize: 13 }}>
                  작품 직접 등록은 로그인(고정닉) 후 이용할 수 있어요. 유동닉으로는 이미 등록된 작품에만 글을 쓸 수 있어요.
                </p>
              ) : (
                <>
                  <div className="cat-chips">
                    {CONTENT_TYPES.filter(t => t.code === 'webtoon' || t.code === 'webnovel').map(t => (
                      <button key={t.code} className={mType === t.code ? 'on' : ''} onClick={() => setMType(t.code as 'webtoon' | 'webnovel')}>
                        {t.emoji} {t.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input className="form-input" autoFocus placeholder="제목 *" maxLength={200} value={mTitle} onChange={e => setMTitle(e.target.value)} />

                    {manualSuggestions.length > 0 && (
                      <div className="manual-suggest">
                        <div className="manual-suggest-head">이미 등록된 같은 작품이 있어요 — 고르면 그 작품에 글을 써요</div>
                        <div className="tmdb-results" style={{ marginTop: 0, maxHeight: '30vh' }}>
                          {manualSuggestions.map(c => (
                            <div key={c.id} className="tmdb-result" onClick={() => { setPicked(c); setManual(false) }}>
                              {c.posterUrl ? <img src={c.posterUrl} alt={c.title} /> : <div className="noimg">No Image</div>}
                              <div>
                                <div className="t">{c.title}</div>
                                <div className="m">{TYPE_LABELS[c.type]}{c.platform ? ` · ${c.platform}` : ''}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="manual-suggest-or">↓ 다른 작품이면 아래에서 새로 등록</div>
                      </div>
                    )}

                    <input className="form-input" placeholder="플랫폼 (예: 네이버웹툰, 카카오페이지) — 선택" value={mPlatform} onChange={e => setMPlatform(e.target.value)} />
                    <PosterUploader value={mPoster} onChange={setMPoster} />
                    <button className="btn btn-primary" disabled={resolving || !mTitle.trim()} onClick={submitManual}>
                      {resolving ? '등록 중…' : '이 작품으로 글쓰기'}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <input className="form-input" placeholder="작품 제목 검색" value={q} onChange={e => setQ(e.target.value)} />
              {(matches.length > 0 || tmdbHits.length > 0) && (
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
                  {/* DB에 없는 작품 — 고르면 그 자리에서 등록된다(ensureContent) */}
                  {tmdbHits.map(r => (
                    <div key={`${r.kind}-${r.tmdbId}`} className="tmdb-result" onClick={() => pickTmdb(r)}>
                      {r.posterUrl ? <img src={r.posterUrl} alt={r.title} /> : <div className="noimg">No Image</div>}
                      <div>
                        <div className="t">{r.title}</div>
                        <div className="m">{TYPE_LABELS[tmdbResultType(r)]}{r.year ? ` · ${r.year}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {q.trim() && (tmdbLoading || resolving) && (
                <p style={{ color: 'var(--subtext)', fontSize: 13, marginTop: 8 }}>{resolving ? '작품을 불러오는 중…' : '검색 중…'}</p>
              )}
              {q.trim() && !tmdbLoading && !resolving && !matches.length && !tmdbHits.length && (
                <p style={{ color: 'var(--subtext)', fontSize: 13, marginTop: 8 }}>일치하는 작품이 없어요. (없는 작품은 내 피드 작품등록으로 추가할 수 있어요.)</p>
              )}
              <button className="btn-text btn-small" style={{ marginTop: 8 }} onClick={() => setManual(true)}>
                + 웹툰·웹소설 직접 등록
              </button>
            </>
          )}
        </div>
        )}

        {!isAccount && !editing && (
          <div className="form-group">
            <GuestCred name={guestName} pw={guestPw} onName={setGuestName} onPw={setGuestPw} what="글" />
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

        {/* 별점 (선택 · 1작품 1회) — 매길 작품이 없는 자유방에는 안 그린다 */}
        {!isFree && (
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
        )}

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
          <button className="btn btn-secondary" onClick={() => navigate(editing ? `/talk/${editing.id}` : boardPath)}>취소</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || (!isFree && !picked) || !title.trim() || (!body.trim() && !images.length)}>
            {saving ? (editing ? '고치는 중…' : '올리는 중…') : (editing ? '수정 완료' : '글 올리기')}
          </button>
        </div>
      </div>

      {showLoginGate && (
        <LoginGateModal
          next={location.pathname + location.search}
          onGuest={() => setGuestChosen(true)}
          onCancel={() => navigate(boardPath)}
        />
      )}
    </>
  )
}
