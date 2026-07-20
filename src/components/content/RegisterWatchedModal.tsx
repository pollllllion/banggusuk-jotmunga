import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { searchTmdb, tmdbEnabled, type TmdbResult } from '@/utils/tmdb'
import { CONTENT_TYPES } from '@/utils/constants'
import { uuid } from '@/utils/helpers'
import type { Content, ContentType } from '@/types'

/** TMDB로 검색하는 카테고리(영화/드라마/예능) vs 수기 입력(웹툰/웹소설) */
const SEARCHABLE: ContentType[] = ['movie', 'drama', 'variety']
const tmdbKind = (type: ContentType): 'movie' | 'tv' => (type === 'movie' ? 'movie' : 'tv')
const idPrefix = (type: ContentType): string =>
  type === 'movie' ? 'tmdb-mv-' : type === 'drama' ? 'tmdb-dr-' : 'tmdb-tv-'

export function RegisterWatchedModal({ onClose, onRegistered }: {
  onClose: () => void
  onRegistered: (c: Content) => void
}) {
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)

  const [type, setType] = useState<ContentType | null>(null)
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
      setResults(await searchTmdb(tmdbKind(type), query))
    } catch (e: any) {
      toast(e?.message || '검색에 실패했어요.')
    } finally {
      setLoading(false)
    }
  }

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
      contentId: idPrefix(type) + r.tmdbId,
      type,
      title: r.title,
      posterUrl: r.posterUrl,
      releaseYear: r.year,
      synopsis: r.overview,
      platform: type === 'movie' ? '극장' : 'TV/OTT',
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
    })
  }

  const isSearchable = type && SEARCHABLE.includes(type)

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="form-input" autoFocus placeholder="제목 *" value={title} onChange={e => setTitle(e.target.value)} />
              <input className="form-input" placeholder="플랫폼 (예: 네이버웹툰, 카카오페이지) — 선택" value={platform} onChange={e => setPlatform(e.target.value)} />
              <input className="form-input" placeholder="포스터 이미지 URL — 선택" value={posterUrl} onChange={e => setPosterUrl(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={submitManual} disabled={saving || !title.trim()}>
                {saving ? '등록중…' : '등록'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
