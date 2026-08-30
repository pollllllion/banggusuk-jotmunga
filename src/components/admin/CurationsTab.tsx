import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { OTT_FILTERS } from '@/utils/ott'
import { CONTENT_TYPES } from '@/utils/constants'
import { buildDraft, listCandidates, candidateCounts, monthRange, weekRange } from '@/shared/curationDraft.mjs'
import { publishBlockers, MIN_BODY, MIN_NOTE, MIN_ITEMS } from '@/shared/curationSeo.mjs'
import type { Curation, CurationItem, ContentType } from '@/types'

/**
 * 관리자 큐레이션 탭 — 캘린더 데이터로 초안을 뽑고, 사람이 글을 채워 발행한다.
 *
 * 자동으로 채워지는 건 작품 목록·제목·요약뿐이다. 본문과 작품별 코멘트는 비어서 나오고,
 * publishBlockers() 가 채우기 전엔 발행을 막는다 — 자동 문장만 있는 글은
 * 구글·애드센스가 '자동 생성된 얇은 콘텐츠'로 본다. 그 가드가 이 기능의 핵심이다.
 */

interface Hint {
  contentId: string; title: string; type?: string; posterUrl?: string | null
  rel?: string; day: string; genres: string; creators: string; providers: string
  popularity?: number; voteAverage?: number | null; voteCount?: number
}

/** 'YYYY-MM' 현재 달 */
function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 오늘이 속한 주의 월요일 */
function thisMonday(): string {
  const d = new Date()
  const diff = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CurationsTab({ rerender }: { rerender: () => void }) {
  const { user } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [, setTick] = useState(0)

  const list = [...DS.getCurations()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  // body·items 는 시작 로드에서 빠져 있다(curationColumns.ts). 그대로 두면 목록 카드가
  // 늘 "작품 0편 · 발행 조건 미충족"으로 보인다 — 이미 다 채운 글까지 그렇게 나온다.
  // 관리자 화면이고 글 수가 수십 단위라 여기서 전부 채워 온다.
  useEffect(() => {
    const ids = DS.getCurations().map(c => c.id)
    if (!ids.length) return
    void Promise.all(ids.map(id => DS.loadCurationDetail(id)))
      .then(res => { if (res.some(Boolean)) setTick(t => t + 1) })
  }, [list.length])

  if (editingId) {
    return <CurationEditor id={editingId} onDone={() => { setEditingId(null); rerender() }} />
  }

  return (
    <>
      <DraftMaker
        authorId={user!.id}
        onCreated={id => { toast('초안을 만들었습니다. 본문과 코멘트를 채워야 발행할 수 있어요.'); setEditingId(id) }}
      />

      {!list.length ? (
        <p style={{ color: 'var(--subtext)', padding: '20px 0' }}>아직 만든 글이 없습니다.</p>
      ) : list.map(c => {
        const blockers = publishBlockers(c)
        return (
          <div key={c.id} className="admin-card fade-in">
            <div className="admin-card-body">
              <div className="value" style={{ fontWeight: 700 }}>
                {c.title}
                <span className={`cur-status ${c.status}`}>{c.status === 'published' ? '발행됨' : '초안'}</span>
              </div>
              <div className="label" style={{ marginTop: 4 }}>/curation/{c.id} · 작품 {(c.items || []).length}편</div>
              {c.status !== 'published' && (
                <div className="label" style={{ color: blockers.length ? 'var(--danger, #d33)' : 'var(--subtext)' }}>
                  {blockers.length ? `발행 조건 ${blockers.length}개 미충족` : '발행 준비 완료'}
                </div>
              )}
            </div>
            <div className="admin-card-actions">
              <button className="btn btn-secondary btn-small" onClick={() => setEditingId(c.id)}>편집</button>
              {c.status === 'published' && (
                <a className="btn btn-secondary btn-small" href={`/curation/${c.id}`} target="_blank" rel="noreferrer">보기</a>
              )}
              <button
                className="btn btn-danger btn-small"
                onClick={() => {
                  if (!confirm(`"${c.title}" 글을 삭제하시겠습니까?`)) return
                  DS.deleteCuration(c.id); toast('삭제되었습니다.'); rerender()
                }}
              >삭제</button>
            </div>
          </div>
        )
      })}
    </>
  )
}

// ── 초안 뽑기 ───────────────────────────────────────────────
/**
 * 후보를 인기순으로 늘어놓고 **사람이 고른다.**
 *
 * 예전엔 인기 상위 N 편을 자동으로 집어넣었는데, TMDB 인기 점수는 "기대작"과 자주
 * 어긋난다 — 시즌 25까지 온 예능이 신작 영화보다 위로 올라오는 식이다.
 * 무엇을 실을지는 사람이 정하는 게 맞다.
 */
function DraftMaker({ authorId, onCreated }: { authorId: string; onCreated: (id: string) => void }) {
  const toast = useToastStore(s => s.show)
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [month, setMonth] = useState(thisMonth())
  const [weekStart, setWeekStart] = useState(thisMonday())
  const [ott, setOtt] = useState('')
  const [type, setType] = useState<'' | ContentType>('')
  const [cands, setCands] = useState<Hint[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [ctx, setCtx] = useState<{ from: string; to: string; periodLabel: string; ottLabel: string } | null>(null)
  const [counts, setCounts] = useState<{ inRange: number; afterType: number; afterOtt: number; noProviders: number } | null>(null)

  const load = () => {
    const { from, to } = mode === 'month' ? monthRange(month) : weekRange(weekStart)
    const periodLabel = mode === 'month'
      ? `${month.split('-')[0]}년 ${Number(month.split('-')[1])}월`
      : `${from.replace(/-/g, '. ')} 주`
    const ottLabel = OTT_FILTERS.find(o => o.name === ott)?.label || ''
    const contents = DS.getContents()
    const list = listCandidates({ contents, from, to, ottName: ott, type, limit: 60 }) as Hint[]
    setCands(list)
    setCounts(candidateCounts({ contents, from, to, ottName: ott, type }))
    setPicked(new Set())
    setCtx({ from, to, periodLabel, ottLabel })
  }

  const toggle = (id: string) => {
    const next = new Set(picked)
    next.has(id) ? next.delete(id) : next.add(id)
    setPicked(next)
  }

  const create = () => {
    if (!ctx || picked.size < MIN_ITEMS) { toast(`최소 ${MIN_ITEMS}편은 골라야 합니다.`); return }
    const draft = buildDraft({
      contents: DS.getContents(), from: ctx.from, to: ctx.to, mode,
      ottName: ott, ottLabel: ctx.ottLabel, type,
      contentIds: [...picked], periodLabel: ctx.periodLabel,
    })
    let id = draft.id
    // 같은 달·같은 필터로 두 번 뽑으면 슬러그가 겹친다 — 뒤에 번호를 붙인다
    let n = 2
    while (DS.getCurationById(id)) { id = `${draft.id}-${n++}` }
    DS.createCuration({
      id, title: draft.title, summary: draft.summary, body: '',
      items: draft.items as CurationItem[], authorId,
    })
    setCands(null); setPicked(new Set())
    onCreated(id)
  }

  return (
    <div className="settings-section" style={{ marginBottom: 16 }}>
      <div className="form-group">
        <label>기간</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-input" style={{ width: 90 }} value={mode} onChange={e => setMode(e.target.value as 'month' | 'week')}>
            <option value="month">월간</option>
            <option value="week">주간</option>
          </select>
          {mode === 'month'
            ? <input type="month" className="form-input" style={{ width: 160 }} value={month} onChange={e => setMonth(e.target.value)} />
            : <input type="date" className="form-input" style={{ width: 170 }} value={weekStart} onChange={e => setWeekStart(e.target.value)} />}
        </div>
      </div>

      <div className="form-group">
        <label>필터</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="form-input" style={{ width: 150 }} value={ott} onChange={e => setOtt(e.target.value)}>
            <option value="">OTT 전체</option>
            {OTT_FILTERS.map(o => <option key={o.name} value={o.name}>{o.label}</option>)}
          </select>
          <select className="form-input" style={{ width: 130 }} value={type} onChange={e => setType(e.target.value as '' | ContentType)}>
            <option value="">유형 전체</option>
            {CONTENT_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <button className="btn btn-primary btn-small" onClick={load}>후보 불러오기</button>

      {cands && (
        <div className="cur-preview">
          <div className="cur-pick-head">
            <strong>실을 작품을 고르세요 — {picked.size}편 선택</strong>
            <span className="label">후보 {cands.length}편 · 인기순</span>
          </div>
          {counts && (
            <div className="cur-pick-counts">
              기간 내 {counts.inRange}편
              {type && ` → 유형 ${counts.afterType}편`}
              {ott && ` → ${ctx?.ottLabel} ${counts.afterOtt}편`}
              {cands.length === 60 && counts.afterOtt > 60 && ' (상위 60편만 표시)'}
              {ott && counts.noProviders > 0 && (
                <div className="cur-pick-hint">
                  이 기간에 OTT 정보가 없는 작품이 {counts.noProviders}편 있습니다 —
                  대부분 극장 개봉작이라 OTT 를 고르면 전부 빠집니다.
                  극장 개봉작을 실으려면 OTT 를 &apos;전체&apos;로 두세요.
                </div>
              )}
            </div>
          )}
          {!cands.length && <p className="label" style={{ padding: '12px 0' }}>조건에 맞는 작품이 없습니다.</p>}
          <ul className="cur-pick-list">
            {cands.map(h => (
              <li key={h.contentId} className={picked.has(h.contentId) ? 'on' : ''} onClick={() => toggle(h.contentId)}>
                <input type="checkbox" readOnly checked={picked.has(h.contentId)} />
                {h.posterUrl && <img src={h.posterUrl} alt="" loading="lazy" />}
                <div className="cur-pick-info">
                  <div className="cur-pick-title">{h.day} · {h.title}</div>
                  <div className="label">
                    {[h.genres, h.creators, h.providers].filter(Boolean).join(' · ')}
                  </div>
                  <div className="label">
                    인기 {h.popularity}
                    {h.voteCount ? ` · 평점 ${Number(h.voteAverage).toFixed(1)} (${h.voteCount}명)` : ' · 평가 없음'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-small" onClick={create} disabled={picked.size < MIN_ITEMS}>
              선택한 {picked.size}편으로 초안 만들기
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => { setCands(null); setPicked(new Set()) }}>취소</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 편집 ────────────────────────────────────────────────────
function CurationEditor({ id, onDone }: { id: string; onDone: () => void }) {
  const toast = useToastStore(s => s.show)
  const [, setTick] = useState(0)
  const cur = DS.getCurationById(id)

  const [title, setTitle] = useState(cur?.title || '')
  const [summary, setSummary] = useState(cur?.summary || '')
  const [body, setBody] = useState(cur?.body || '')
  const [coverUrl, setCoverUrl] = useState(cur?.coverUrl || '')
  const [items, setItems] = useState<CurationItem[]>(cur?.items || [])
  const [loaded, setLoaded] = useState(false)

  // 본문·작품목록은 시작 로드에 없다 — 편집 화면에 들어올 때 채운다
  useEffect(() => {
    void DS.loadCurationDetail(id).then(() => {
      const fresh = DS.getCurationById(id)
      if (fresh) { setBody(fresh.body || ''); setItems(fresh.items || []) }
      setLoaded(true); setTick(t => t + 1)
    })
  }, [id])

  if (!cur) return <p style={{ color: 'var(--subtext)' }}>글을 찾을 수 없습니다.</p>

  const draft: Curation = { ...cur, title, summary, body, items, coverUrl: coverUrl || null }
  const blockers = publishBlockers(draft)

  const save = () => {
    DS.updateCuration(id, { title, summary, body, items, coverUrl: coverUrl || null })
    toast('저장되었습니다.')
  }

  const publish = () => {
    if (blockers.length) { toast('발행 조건을 먼저 채워주세요.'); return }
    DS.updateCuration(id, { title, summary, body, items, coverUrl: coverUrl || null })
    DS.publishCuration(id)
    toast('발행되었습니다. 다음 배포 때 정적 페이지·sitemap 에 반영됩니다.')
    onDone()
  }

  const setNote = (contentId: string, note: string) =>
    setItems(items.map(i => i.contentId === contentId ? { ...i, note } : i))

  const removeItem = (contentId: string) =>
    setItems(items.filter(i => i.contentId !== contentId))

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...items]
    const to = idx + dir
    if (to < 0 || to >= next.length) return
    ;[next[idx], next[to]] = [next[to], next[idx]]
    setItems(next)
  }

  return (
    <div className="settings-section">
      <div className="form-group"><label>제목</label>
        <input type="text" className="form-input" value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div className="form-group"><label>URL</label>
        <input type="text" className="form-input" value={`/curation/${id}`} disabled />
      </div>
      <div className="form-group"><label>요약 — 목록 카드와 검색결과 설명</label>
        <textarea className="form-input" value={summary} onChange={e => setSummary(e.target.value)}
          style={{ minHeight: 60, resize: 'vertical' }} />
      </div>
      <div className="form-group"><label>대표 이미지 URL (선택)</label>
        <input type="text" className="form-input" value={coverUrl} onChange={e => setCoverUrl(e.target.value)} placeholder="비우면 안 넣습니다" />
      </div>
      <div className="form-group">
        <label>본문 — 왜 이 목록을 묶었는지 ({body.trim().length}/{MIN_BODY}자)</label>
        <textarea
          className="form-input" value={body} onChange={e => setBody(e.target.value)}
          placeholder="이번 달 라인업의 흐름, 눈여겨볼 지점, 지난달과 뭐가 다른지 등. 빈 줄로 문단을 나눕니다."
          style={{ minHeight: 180, resize: 'vertical' }}
        />
      </div>

      <label style={{ display: 'block', margin: '16px 0 8px', fontWeight: 700 }}>
        실린 작품 {items.length}편 — 각 {MIN_NOTE}자 이상 코멘트
      </label>
      <ItemAdder
        existing={items.map(i => i.contentId)}
        onAdd={id => setItems([...items, { contentId: id, note: '' }])}
      />
      {!loaded && <p className="label">불러오는 중...</p>}
      {items.map((it, idx) => {
        const c = DS.getContentById(it.contentId)
        const short = (it.note || '').trim().length < MIN_NOTE
        return (
          <div key={it.contentId} className="cur-edit-item">
            {c?.posterUrl && <img src={c.posterUrl} alt="" className="cur-edit-poster" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="value" style={{ fontWeight: 700 }}>{c ? c.title : it.contentId}</div>
              <div className="label">
                {c ? [
                  c.releaseDate, (c.genres || []).slice(0, 3).join('·'),
                  [...new Set((c.providers || []).map(p => p.providerName))].slice(0, 3).join('·'),
                ].filter(Boolean).join(' · ') : '캐시에 없는 작품'}
              </div>
              <textarea
                className="form-input" value={it.note}
                onChange={e => setNote(it.contentId, e.target.value)}
                placeholder="이 작품을 왜 골랐는지, 뭘 기대할 만한지 직접 쓰세요."
                style={{ minHeight: 64, resize: 'vertical', marginTop: 6, borderColor: short ? 'var(--danger, #d33)' : undefined }}
              />
              <div className="label" style={{ color: short ? 'var(--danger, #d33)' : 'var(--subtext)' }}>
                {(it.note || '').trim().length}/{MIN_NOTE}자
              </div>
            </div>
            <div className="cur-edit-actions">
              <button className="btn btn-secondary btn-small" onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
              <button className="btn btn-secondary btn-small" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}>↓</button>
              <button className="btn btn-danger btn-small" onClick={() => removeItem(it.contentId)}>빼기</button>
            </div>
          </div>
        )
      })}

      {blockers.length > 0 && (
        <div className="cur-blockers">
          <strong>발행하려면</strong>
          <ul>{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={onDone}>목록으로</button>
        <button className="btn btn-secondary" onClick={save}>저장</button>
        <button className="btn btn-primary" onClick={publish} disabled={blockers.length > 0}>
          {cur.status === 'published' ? '저장하고 재발행' : '발행'}
        </button>
        {cur.status === 'published' && (
          <button className="btn btn-danger" onClick={() => { DS.unpublishCuration(id); toast('비공개로 내렸습니다.'); onDone() }}>
            비공개로
          </button>
        )}
      </div>
    </div>
  )
}

// ── 작품 추가(검색) ─────────────────────────────────────────
/** 초안에 빠진 작품을 직접 찾아 넣는다 — 기간 밖 작품도 넣을 수 있다 */
function ItemAdder({ existing, onAdd }: { existing: string[]; onAdd: (id: string) => void }) {
  const [q, setQ] = useState('')
  const hits = q.trim().length >= 2
    ? DS.searchContents(q.trim(), 8).filter(c => !existing.includes(c.id))
    : []

  return (
    <div className="cur-adder">
      <input
        type="text" className="form-input" value={q} onChange={e => setQ(e.target.value)}
        placeholder="작품 제목으로 검색해 추가 (2글자 이상)"
      />
      {hits.length > 0 && (
        <ul className="cur-adder-list">
          {hits.map(c => (
            <li key={c.id} onClick={() => { onAdd(c.id); setQ('') }}>
              {c.posterUrl && <img src={c.posterUrl} alt="" loading="lazy" />}
              <span>{c.title}</span>
              <span className="label">{c.releaseDate || c.releaseYear || ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
