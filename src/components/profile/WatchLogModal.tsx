import { useState } from 'react'
import * as DS from '@/api/dataService'
import { useToastStore } from '@/components/ui/Toast'
import { RegisterWatchedModal } from '@/components/content/RegisterWatchedModal'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { uuid } from '@/utils/helpers'
import type { Content, ContentType, WatchLog } from '@/types'

/* 자주 쓰는 값은 눌러서 넣고, 나머지는 직접 쓴다 — 칩을 누르면 입력칸이 그 글자로 바뀐다 */
const PLACES = ['집', '극장', '이동 중', '친구 집']
const COMPANIONS = ['혼자', '친구', '가족', '연인']

/* '어디까지'는 회차가 있는 작품에만 묻는다 — 영화는 한 편이라 뜻이 없다.
   종류마다 세는 말이 달라 예시도 바꾼다 */
const PROGRESS_HINT: Partial<Record<ContentType, string>> = {
  drama: '예: 3~5화, 끝까지',
  variety: '예: 120회, 최신화',
  webtoon: '예: 45~60화, 시즌1 완결',
  webnovel: '예: 120화까지, 외전',
  shortform: '예: 1~10화',
  youtube: '예: 3편',
  etc: '예: 3~5화',
}
const hasProgress = (c?: Content) => !!c && c.type !== 'movie'

/**
 * 작품일지 — 기록 쓰기·고치기.
 *
 * 작품 고르기는 '최근 본 작품·찜한 작품' 칩이 먼저다: 기록하는 건 대개 방금 본 것이고
 * 그건 이미 내 목록에 있다. 없으면 '작품 찾기'로 본 작품 등록과 같은 검색 창을 연다.
 * 저장할 때 본 작품에 없던 작품이면 본 작품에도 걸어 준다(본 연도는 기록한 날로).
 */
export function WatchLogModal({ userId, day, initial, onClose, onSaved }: {
  userId: string
  /** 새 기록의 기본 날짜 'YYYY-MM-DD' */
  day: string
  initial?: WatchLog
  onClose: () => void
  onSaved: (log: WatchLog) => void
}) {
  const toast = useToastStore(s => s.show)
  const [content, setContent] = useState<Content | undefined>(initial ? DS.getContentById(initial.contentId) : undefined)
  const [watchedOn, setWatchedOn] = useState(initial?.watchedOn ?? day)
  const [place, setPlace] = useState(initial?.place ?? '')
  const [companions, setCompanions] = useState(initial?.companions ?? '')
  const [progress, setProgress] = useState(initial?.progress ?? '')
  const [memo, setMemo] = useState(initial?.memo ?? '')
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)

  useEscapeKey(!picking, onClose)

  // 고르기 쉬운 후보 — 최근에 본 작품, 그다음 최근에 찜한 작품 (겹치면 한 번만)
  const suggestions = (() => {
    const byRecent = <T extends { createdAt: string; contentId: string }>(rows: T[]) =>
      [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(r => r.contentId)
    const ids = [...new Set([...byRecent(DS.getUserWatched(userId)), ...byRecent(DS.getUserBookmarks(userId))])]
    return ids.map(id => DS.getContentById(id)).filter((c): c is Content => Boolean(c)).slice(0, 8)
  })()

  const save = async () => {
    if (!content) { toast('어떤 작품을 봤는지 골라 주세요.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(watchedOn)) { toast('본 날짜를 골라 주세요.'); return }
    setSaving(true)
    const now = new Date().toISOString()
    try {
      const log = await DS.saveWatchLog({
        id: initial?.id ?? uuid(),
        userId, contentId: content.id, watchedOn,
        place: place.trim(), companions: companions.trim(),
        // 영화로 바꿔 골랐으면 앞서 적어 둔 회차는 버린다
        progress: hasProgress(content) ? progress.trim() : '', memo: memo.trim(),
        isPublic,
        createdAt: initial?.createdAt ?? now, updatedAt: now,
      })
      // 본 작품에 걸기 — 실패해도 기록은 이미 저장됐으니 알리기만 한다
      if (!DS.isWatched(userId, content.id)) {
        try {
          await DS.registerWatched({
            contentId: content.id, type: content.type, title: content.title,
            posterUrl: content.posterUrl, platform: content.platform, releaseYear: content.releaseYear,
            synopsis: content.synopsis, genres: content.genres, creators: content.creators,
            watchedYear: Number(watchedOn.slice(0, 4)),
          })
        } catch { toast('기록은 저장했지만 본 작품에 넣지는 못했어요.') }
      }
      toast(initial ? '기록을 고쳤어요.' : '기록했어요.')
      onSaved(log)
      onClose()
    } catch (e: any) {
      toast(e?.message || '저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  const chips = (options: string[], value: string, set: (v: string) => void) => (
    <div className="diary-chips">
      {options.map(o => (
        <button key={o} type="button" className={`diary-chip ${value === o ? 'on' : ''}`}
          onClick={() => set(value === o ? '' : o)}>{o}</button>
      ))}
    </div>
  )

  return (
    <>
      <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="modal diary-modal" style={{ maxWidth: 480, width: '92vw' }}>
          <button className="modal-close" onClick={onClose} aria-label="닫기">✕</button>
          <h3>{initial ? '기록 고치기' : '기록 남기기'}</h3>

          <div className="form-group">
            <label>무엇을</label>
            {content ? (
              <div className="diary-picked">
                {content.posterUrl
                  ? <img src={content.posterUrl} alt="" />
                  : <div className="diary-picked-noimg" />}
                <strong>{content.title}</strong>
                <button type="button" className="btn-text btn-small" onClick={() => setPicking(true)}>바꾸기</button>
              </div>
            ) : (
              <>
                {suggestions.length > 0 && (
                  <div className="diary-suggest">
                    {suggestions.map(c => (
                      <button key={c.id} type="button" className="diary-suggest-item" onClick={() => setContent(c)} title={c.title}>
                        {c.posterUrl ? <img src={c.posterUrl} alt="" loading="lazy" /> : <span className="diary-picked-noimg" />}
                        <span>{c.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" className="btn btn-secondary btn-small" style={{ marginTop: 8 }} onClick={() => setPicking(true)}>
                  작품 찾기
                </button>
              </>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="diary-date">언제</label>
            <input id="diary-date" type="date" className="form-input" value={watchedOn} onChange={e => setWatchedOn(e.target.value)} />
          </div>

          <div className="form-group">
            <label htmlFor="diary-place">어디서</label>
            {chips(PLACES, place, setPlace)}
            <input id="diary-place" className="form-input" maxLength={60} value={place}
              onChange={e => setPlace(e.target.value)} placeholder="직접 쓰기 (예: CGV 용산 아이맥스)" />
          </div>

          <div className="form-group">
            <label htmlFor="diary-with">누구랑</label>
            {chips(COMPANIONS, companions, setCompanions)}
            <input id="diary-with" className="form-input" maxLength={60} value={companions}
              onChange={e => setCompanions(e.target.value)} placeholder="직접 쓰기" />
          </div>

          {hasProgress(content) && (
            <div className="form-group">
              <label htmlFor="diary-progress">어디까지</label>
              <input id="diary-progress" className="form-input" maxLength={40} value={progress}
                onChange={e => setProgress(e.target.value)}
                placeholder={`${PROGRESS_HINT[content!.type] ?? '예: 3~5화'} (선택)`} />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="diary-memo">메모</label>
            <textarea id="diary-memo" className="form-input" maxLength={3000} value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="그날 어땠는지, 기억하고 싶은 장면, 같이 본 사람 반응…"
              style={{ minHeight: 120, resize: 'vertical' }} />
          </div>

          <div className="diary-public-row">
            <button type="button" className={`feed-public ${isPublic ? 'on' : ''}`} onClick={() => setIsPublic(v => !v)}>
              {isPublic ? '공개' : '비공개'}
            </button>
            <span>{isPublic ? '내 프로필에서 다른 사람도 볼 수 있어요' : '나만 봐요'}</span>
          </div>

          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !content}>
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>

      {/* 검색 창은 기록 창 위에 겹쳐 연다 — 기록 창을 닫으면 적던 메모가 날아간다 */}
      {picking && (
        <RegisterWatchedModal mode="pick" onClose={() => setPicking(false)} onRegistered={c => setContent(c)} />
      )}
    </>
  )
}
