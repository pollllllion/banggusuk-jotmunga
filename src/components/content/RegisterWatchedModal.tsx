import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { smartSearchTmdb, tmdbEnabled, tmdbContentId, type TmdbResult } from '@/utils/tmdb'
import { PosterUploader } from '@/components/content/PosterUploader'
import { CONTENT_TYPES } from '@/utils/constants'
import { uuid } from '@/utils/helpers'
import type { Content, ContentType } from '@/types'

/** TMDB로 검색하는 카테고리(영화/드라마/예능) vs 수기 입력(웹툰/웹소설) */
const SEARCHABLE: ContentType[] = ['movie', 'drama', 'variety']
const tmdbKind = (type: ContentType): 'movie' | 'tv' => (type === 'movie' ? 'movie' : 'tv')

/** 공백·문장부호 무시한 느슨한 정규화 (한글/영문/숫자만) — 수기작품 중복 매칭용 */
const normLoose = (s: string) => (s || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()

export function RegisterWatchedModal({ onClose, onRegistered }: {
  onClose: () => void
  onRegistered: (c: Content) => void
}) {
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)

  const [type, setType] = useState<ContentType | null>(null)
  // 실제로 본 연도 (기본값 = 올해, "기억 안 남"이면 null)
  const [watchedYear, setWatchedYear] = useState<number | null>(new Date().getFullYear())
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TmdbResult[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 수기 입력(웹툰/웹소설)
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('')
  const [posterUrl, setPosterUrl] = useState('')

  const overlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() }

  const doSearch = async () => {
    if (!type || !query.trim()) return
    setLoading(true); setSearched(true)
    try {
      setResults(await smartSearchTmdb(tmdbKind(type), query))
    } catch (e: any) {
      toast(e?.message || '검색에 실패했어요.')
    } finally {
      setLoading(false)
    }
  }

  // 실시간 검색: 타이핑이 멈추면(디바운스 350ms) 자동으로 TMDB 검색해 아래에 표시.
  // alive 플래그 + clearTimeout 으로 이전 키 입력의 응답이 최신 결과를 덮지 않게 한다(경쟁 조건 방지).
  useEffect(() => {
    if (!type || !SEARCHABLE.includes(type)) return
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearched(false); setLoading(false); return }
    let alive = true
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const r = await smartSearchTmdb(tmdbKind(type), q)
        if (alive) { setResults(r); setSearched(true) }
      } catch {
        if (alive) { setResults([]); setSearched(true) } // 실시간이라 키마다 토스트는 안 띄움
      } finally {
        if (alive) setLoading(false)
      }
    }, 350)
    return () => { alive = false; clearTimeout(timer) }
  }, [query, type])

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
    if (!type) return
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
    if (!type) return
    if (!title.trim()) { toast('제목을 입력해주세요.'); return }
    register({
      contentId: uuid(),
      type,
      title: title.trim(),
      posterUrl: posterUrl.trim() || null,
      platform: platform.trim() || null,
      watchedYear,
    })
  }

  // 수기(웹툰/웹소설) 등록 시, DB에 이미 있는 같은 작품 후보를 찾아 보여준다.
  // 고르면 새 행을 만들지 않고 기존 작품에 연결(dedup) → 수다방·토론이 한 곳에 모인다.
  const manualSuggestions = useMemo<Content[]>(() => {
    if (!type || SEARCHABLE.includes(type)) return []
    const q = normLoose(title)
    if (q.length < 1) return []
    return DS.getContents()
      .filter(c => c.type === type && !c.id.startsWith('tmdb-') && normLoose(c.title).includes(q))
      .slice(0, 6)
  }, [title, type])

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

  const isSearchable = type && SEARCHABLE.includes(type)

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
        {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
        <option value="">기억 안 남</option>
      </select>
    </label>
  )

  return (
    <div className="modal-overlay show" onClick={overlayClick}>
      <div className="modal" style={{ maxWidth: 460, width: '92vw' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>👀 본 작품 등록</h3>

        {/* 1단계: 카테고리 선택 */}
        {!type && (
          <>
            <p style={{ color: 'var(--subtext)', fontSize: 13, marginBottom: 10 }}>어떤 작품을 등록할까요?</p>
            <div className="cat-chips">
              {CONTENT_TYPES.map(t => (
                <button key={t.code} onClick={() => setType(t.code)}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* 2-A단계: 영화/드라마/예능 → TMDB 검색 */}
        {isSearchable && (
          <>
            <button className="btn-text btn-small" onClick={() => { setType(null); setResults([]); setSearched(false); setQuery('') }} style={{ marginBottom: 8 }}>‹ 카테고리 다시 선택</button>
            {!tmdbEnabled ? (
              <p style={{ color: 'var(--subtext)', fontSize: 13 }}>검색 기능이 아직 설정되지 않았어요. (관리자에게 TMDB 키 설정을 요청하세요)</p>
            ) : (
              <>
                {watchedYearRow}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input" autoFocus placeholder="제목으로 검색"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={doSearch} disabled={loading || !query.trim()}>
                    {loading ? '검색중' : '검색'}
                  </button>
                </div>
                {searched && !loading && results.length === 0 && (
                  <p style={{ color: 'var(--subtext)', fontSize: 13, marginTop: 12 }}>
                    검색 결과가 없어요. 제목을 바꿔보거나, 웹툰/웹소설이면 카테고리를 다시 골라 수기 입력하세요.
                  </p>
                )}
                <div className="tmdb-results">
                  {results.map(r => (
                    <div key={r.tmdbId} className="tmdb-result" onClick={() => !saving && pickTmdb(r)}>
                      {r.posterUrl
                        ? <img src={r.posterUrl} alt={r.title} />
                        : <div className="noimg">No Image</div>}
                      <div>
                        <div className="t">{r.title}</div>
                        <div className="m">{r.year || '연도미상'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* 2-B단계: 웹툰/웹소설 → 수기 입력 */}
        {type && !isSearchable && (
          <>
            <button className="btn-text btn-small" onClick={() => setType(null)} style={{ marginBottom: 8 }}>‹ 카테고리 다시 선택</button>
            {watchedYearRow}
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
