import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { searchTmdbAll, tmdbEnabled, tmdbContentId, tmdbResultType, type TmdbResult } from '@/utils/tmdb'
import { PosterUploader } from '@/components/content/PosterUploader'
import { CONTENT_TYPES, TYPE_LABELS } from '@/utils/constants'
import { uuid } from '@/utils/helpers'
import type { Content, ContentType } from '@/types'

/**
 * 본 작품 등록 모달.
 *
 * ★ 2026-08-19 — 카테고리 선택 단계를 없앴다 ★
 * 예전엔 영화/드라마/예능/웹툰/웹소설을 먼저 고르게 했다. 그 단계가 하던 일은 셋이었는데
 * 전부 뒤로 미룰 수 있었다:
 *   (1) TMDB 엔드포인트(movie/tv) 분기  → `searchTmdbAll` 이 둘 다 쳐서 합친다
 *   (2) drama/variety 저장값 구분       → `tmdbResultType` 이 장르 id 로 정한다(배지로 수정 가능)
 *   (3) 웹툰/웹소설 수기 입력 폼 분기    → "직접 등록" 으로 미룬다
 * 등록하려는 사람은 이미 제목을 알고 있다. 카테고리는 시스템 사정이지 그 사람 관심사가 아니다.
 * (옛 구조의 마찰이 문구에도 남아 있었다 — "웹툰/웹소설이면 카테고리를 다시 골라 수기 입력하세요")
 *
 * 부수 효과: DB 매칭을 타입으로 거르지 않게 되면서 이미 등록된 웹툰도 검색에 잡힌다.
 * 예전엔 안 잡혀서 같은 작품이 새 행으로 또 생겼다(= `npm run dedupe` 로 병합하던 그 중복).
 */

/** 수기 등록이 가능한 타입 — TMDB 에 없는 것들. 영화·드라마·예능은 검색으로만 등록한다
 *  (uuid 로 새 행을 만들면 tmdb-* 행과 중복되기 때문). */
const MANUAL_TYPES: ContentType[] = ['webtoon', 'webnovel']

/** 공백·문장부호 무시한 느슨한 정규화 (한글/영문/숫자만) — 수기작품 중복 매칭용 */
const normLoose = (s: string) => (s || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()

export function RegisterWatchedModal({ onClose, onRegistered }: {
  onClose: () => void
  onRegistered: (c: Content) => void
}) {
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)

  // 실제로 본 연도 (기본값 = 올해, "기억 안 남"이면 null)
  const [watchedYear, setWatchedYear] = useState<number | null>(new Date().getFullYear())
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TmdbResult[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 드라마/예능 자동 분류를 사람이 고친 것 (tmdbId → 타입). 장르 id 만으로는 애매한 작품이 있다.
  const [typeOverride, setTypeOverride] = useState<Record<number, ContentType>>({})

  // 직접 등록(웹툰/웹소설)
  const [manual, setManual] = useState(false)
  const [manualType, setManualType] = useState<ContentType>('webtoon')
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('')
  const [posterUrl, setPosterUrl] = useState('')

  const overlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() }

  const resultType = (r: TmdbResult): ContentType => typeOverride[r.tmdbId] || tmdbResultType(r)

  // 실시간 검색: 타이핑이 멈추면(디바운스 350ms) 자동으로 TMDB 검색해 아래에 표시.
  // alive 플래그 + clearTimeout 으로 이전 키 입력의 응답이 최신 결과를 덮지 않게 한다(경쟁 조건 방지).
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearched(false); setLoading(false); return }
    let alive = true
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const r = await searchTmdbAll(q)
        if (alive) { setResults(r); setSearched(true) }
      } catch {
        if (alive) { setResults([]); setSearched(true) } // 실시간이라 키마다 토스트는 안 띄움
      } finally {
        if (alive) setLoading(false)
      }
    }, 350)
    return () => { alive = false; clearTimeout(timer) }
  }, [query])

  const register = async (input: DS.RegisterWatchedInput) => {
    if (!user || !isAccount) { toast('본 작품 등록은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    if (DS.isWatched(user.id, input.contentId)) { toast('이미 등록한 작품이에요.'); return }
    setSaving(true)
    try {
      const content = await DS.registerWatched(input)
      toast(`'${content.title}' 등록 완료!`)
      onRegistered(content)
      onClose()
    } catch (e: any) {
      toast(e?.message || '등록에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  const pickTmdb = (r: TmdbResult) => {
    const type = resultType(r)
    register({
      contentId: tmdbContentId(type, r.tmdbId),
      type,
      title: r.title,
      posterUrl: r.posterUrl,
      releaseYear: r.year,
      synopsis: r.overview,
      platform: type === 'movie' ? '극장' : 'TV/OTT',
      watchedYear,
    })
  }

  const submitManual = () => {
    if (!title.trim()) { toast('제목을 입력해주세요.'); return }
    register({
      contentId: uuid(),
      type: manualType,
      title: title.trim(),
      posterUrl: posterUrl.trim() || null,
      platform: platform.trim() || null,
      watchedYear,
    })
  }

  // 우리 DB 를 먼저 뒤진다 — 타입을 가리지 않는다.
  // TMDB엔 시즌별 항목이 없어서(예: '킬러들의 쇼핑몰 시즌2') 캘린더 동기화로 들어온 시즌 행은
  // TMDB 검색만으로는 절대 안 잡힌다 → 통합검색(Header)과 같은 소스를 여기서도 쓴다.
  const dbMatches = useMemo<Content[]>(() => {
    const q = query.trim()
    if (q.length < 2) return []
    return DS.searchContents(q, 8).slice(0, 6)
  }, [query])

  // DB에 이미 있는 작품은 위쪽 목록에 나오므로 TMDB 결과에선 뺀다 (시즌 행이 있는 경우 포함)
  const tmdbResults = useMemo(() => {
    const shown = new Set(dbMatches.map(c => c.id))
    return results.filter(r => !shown.has(tmdbContentId(resultType(r), r.tmdbId)))
  }, [results, dbMatches, typeOverride])

  // 직접 등록 시, DB에 이미 있는 같은 작품 후보를 찾아 보여준다.
  // 고르면 새 행을 만들지 않고 기존 작품에 연결(dedup) → 수다방·토론이 한 곳에 모인다.
  const manualSuggestions = useMemo<Content[]>(() => {
    const q = normLoose(title)
    if (q.length < 1) return []
    return DS.getContents()
      .filter(c => c.type === manualType && !c.id.startsWith('tmdb-') && normLoose(c.title).includes(q))
      .slice(0, 6)
  }, [title, manualType])

  // 기존 작품에 연결 (dedup) — 새 content 를 만들지 않고 watched 링크만 추가
  const linkExisting = (c: Content) => {
    register({
      contentId: c.id,
      type: c.type,
      title: c.title,
      posterUrl: c.posterUrl,
      platform: c.platform,
      releaseYear: c.releaseYear,
      watchedYear,
    })
  }

  // 본 연도 선택 UI (올해 ~ 1970, + "기억 안 남")
  const YEARS = Array.from({ length: new Date().getFullYear() - 1969 }, (_, i) => new Date().getFullYear() - i)
  const watchedYearRow = (
    <label className="watched-year-field">
      <span>언제 봤어요?</span>
      <select
        className="form-input"
        value={watchedYear ?? ''}
        onChange={e => setWatchedYear(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">선택 안 함 (기억 안 남)</option>
        {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
      </select>
    </label>
  )

  /** 영화/드라마/예능 배지. tv 결과는 눌러서 드라마↔예능을 바로 고칠 수 있다. */
  const typeBadge = (r: TmdbResult) => {
    const t = resultType(r)
    const fixable = r.kind === 'tv'
    return (
      <span
        className={`type-badge type-${t}${fixable ? ' fixable' : ''}`}
        title={fixable ? '드라마 ↔ 예능 바꾸기' : undefined}
        onClick={fixable ? (e => {
          e.stopPropagation()
          setTypeOverride(o => ({ ...o, [r.tmdbId]: t === 'drama' ? 'variety' : 'drama' }))
        }) : undefined}
      >
        {TYPE_LABELS[t]}{fixable ? ' ⇄' : ''}
      </span>
    )
  }

  return (
    <div className="modal-overlay show" onClick={overlayClick}>
      <div className="modal" style={{ maxWidth: 460, width: '92vw' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>👀 본 작품 등록</h3>

        {/* 검색으로 등록 (기본) */}
        {!manual && (
          <>
            {watchedYearRow}
            <input
              className="form-input" autoFocus placeholder="제목으로 검색 (영화·드라마·예능·웹툰·웹소설)"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {!tmdbEnabled && (
              <p style={{ color: 'var(--subtext)', fontSize: 13, marginTop: 8 }}>
                TMDB 검색이 설정되지 않아 이미 등록된 작품만 찾을 수 있어요.
              </p>
            )}

            {dbMatches.length > 0 && (
              <div className="manual-suggest" style={{ marginTop: 10 }}>
                <div className="manual-suggest-head">이미 등록된 작품 — 고르면 그 작품에 연결돼요</div>
                <div className="tmdb-results" style={{ marginTop: 0, maxHeight: '30vh' }}>
                  {dbMatches.map(c => (
                    <div key={c.id} className="tmdb-result" onClick={() => !saving && linkExisting(c)}>
                      {c.posterUrl
                        ? <img src={c.posterUrl} alt={c.title} />
                        : <div className="noimg">No Image</div>}
                      <div>
                        <div className="t">{c.title} <span className={`type-badge type-${c.type}`}>{TYPE_LABELS[c.type]}</span></div>
                        <div className="m">{c.releaseYear || '연도미상'}{c.platform ? ` · ${c.platform}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="tmdb-results">
              {tmdbResults.map(r => (
                <div key={r.kind + '-' + r.tmdbId} className="tmdb-result" onClick={() => !saving && pickTmdb(r)}>
                  {r.posterUrl
                    ? <img src={r.posterUrl} alt={r.title} />
                    : <div className="noimg">No Image</div>}
                  <div>
                    <div className="t">{r.title} {typeBadge(r)}</div>
                    <div className="m">{r.year || '연도미상'}</div>
                  </div>
                </div>
              ))}
            </div>

            {loading && <p style={{ color: 'var(--subtext)', fontSize: 13, marginTop: 10 }}>검색중…</p>}
            {searched && !loading && tmdbResults.length === 0 && dbMatches.length === 0 && (
              <p style={{ color: 'var(--subtext)', fontSize: 13, marginTop: 12 }}>검색 결과가 없어요.</p>
            )}

            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn-text btn-small" onClick={() => { setManual(true); setTitle(query.trim()) }}>
                찾는 작품이 없나요? 웹툰·웹소설 직접 등록 ›
              </button>
            </div>
          </>
        )}

        {/* 직접 등록 (웹툰/웹소설) */}
        {manual && (
          <>
            <button className="btn-text btn-small" onClick={() => setManual(false)} style={{ marginBottom: 8 }}>‹ 검색으로 돌아가기</button>
            {watchedYearRow}
            <div className="cat-chips">
              {CONTENT_TYPES.filter(t => MANUAL_TYPES.includes(t.code)).map(t => (
                <button
                  key={t.code}
                  className={manualType === t.code ? 'on' : ''}
                  onClick={() => setManualType(t.code)}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="form-input" autoFocus placeholder="제목 *" value={title} onChange={e => setTitle(e.target.value)} />

              {manualSuggestions.length > 0 && (
                <div className="manual-suggest">
                  <div className="manual-suggest-head">이미 등록된 같은 작품이 있어요 — 고르면 그 작품에 연결돼요</div>
                  <div className="tmdb-results" style={{ marginTop: 0, maxHeight: '30vh' }}>
                    {manualSuggestions.map(c => (
                      <div key={c.id} className="tmdb-result" onClick={() => !saving && linkExisting(c)}>
                        {c.posterUrl
                          ? <img src={c.posterUrl} alt={c.title} />
                          : <div className="noimg">No Image</div>}
                        <div>
                          <div className="t">{c.title}</div>
                          <div className="m">{c.platform || '기존 등록작'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="manual-suggest-or">↓ 다른 작품이면 아래에서 새로 등록</div>
                </div>
              )}

              <input className="form-input" placeholder="플랫폼 (예: 네이버웹툰, 카카오페이지) — 선택" value={platform} onChange={e => setPlatform(e.target.value)} />
              <PosterUploader value={posterUrl} onChange={setPosterUrl} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={submitManual} disabled={saving || !title.trim()}>
                {saving ? '등록중…' : (manualSuggestions.length > 0 ? '새 작품으로 등록' : '등록')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
