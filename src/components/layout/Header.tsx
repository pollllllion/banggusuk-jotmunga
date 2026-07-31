import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { SearchIcon, PlusIcon, DocumentIcon, BookmarkIcon, SettingsIcon, ShieldIcon, LogoutIcon } from '@/components/ui/Icons'
import { NotificationPanel } from '@/components/notification/NotificationPanel'
import * as DS from '@/api/dataService'
import { TYPE_LABELS } from '@/utils/constants'
import { useToastStore } from '@/components/ui/Toast'
import { smartSearchTmdb, tmdbEnabled, tmdbContentId, tmdbTvType, type TmdbResult } from '@/utils/tmdb'
import type { Content, ContentType } from '@/types'

type TmdbHit = { r: TmdbResult; type: ContentType }
/** 로컬 결과 + TMDB 결과를 한 줄로 세운 것 — 키보드 이동·선택이 두 목록을 넘나들 수 있게 */
type Item = { kind: 'local'; content: Content } | { kind: 'tmdb'; hit: TmdbHit }

/** 영화·TV 결과를 번갈아 섞는다 (한쪽이 목록을 다 잡아먹지 않게) */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i])
    if (b[i]) out.push(b[i])
  }
  return out
}

export function Header() {
  const navigate = useNavigate()
  const { user, isAccount, logout } = useAuthStore()
  const { userMenuOpen, toggleUserMenu, closeUserMenu } = useUIStore()
  const toast = useToastStore(s => s.show)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [tmdbHits, setTmdbHits] = useState<TmdbHit[]>([])
  const [tmdbLoading, setTmdbLoading] = useState(false)
  const [registering, setRegistering] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // 로컬 캐시(DS.getContents) 기준이라 디바운스 없이 키 입력마다 즉시 계산해도 충분히 가볍다.
  const suggestions = useMemo(() => DS.searchContents(searchQuery, 6), [searchQuery])

  /**
   * DB에 없는 옛 작품까지 찾도록 TMDB로 한 번 더 검색한다.
   * 우리 DB는 개봉·공개 캘린더용이라 2026년 작품 위주 — '피의 게임 1~3' 같은 옛 시즌은 여기서 잡힌다.
   * alive 플래그로 늦게 도착한 이전 입력의 응답이 최신 결과를 덮지 않게 막는다.
   */
  useEffect(() => {
    const q = searchQuery.trim()
    if (!tmdbEnabled || q.length < 2) { setTmdbHits([]); setTmdbLoading(false); return }
    let alive = true
    setTmdbLoading(true)
    const timer = setTimeout(async () => {
      try {
        const [movies, tvs] = await Promise.all([smartSearchTmdb('movie', q), smartSearchTmdb('tv', q)])
        if (!alive) return
        const merged = interleave<TmdbHit>(
          movies.map(r => ({ r, type: 'movie' as ContentType })),
          tvs.map(r => ({ r, type: tmdbTvType(r.genreIds) })),
        )
        // 이미 DB에 있는 작품은 위쪽 로컬 결과에 나오므로 뺀다 (시즌별 행이 있는 경우 포함)
        setTmdbHits(merged.filter(h => !DS.hasTmdbContent(h.type === 'movie' ? 'movie' : 'tv', h.r.tmdbId)).slice(0, 6))
      } catch {
        if (alive) setTmdbHits([])   // 실시간이라 키마다 토스트는 안 띄움
      } finally {
        if (alive) setTmdbLoading(false)
      }
    }, 350)
    return () => { alive = false; clearTimeout(timer) }
  }, [searchQuery])

  const items: Item[] = [
    ...suggestions.map(content => ({ kind: 'local' as const, content })),
    ...tmdbHits.map(hit => ({ kind: 'tmdb' as const, hit })),
  ]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeUserMenu()
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSuggestOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [closeUserMenu])

  // 쿼리가 바뀌면 키보드 선택 위치를 초기화 (엉뚱한 항목이 선택된 채 남지 않게)
  useEffect(() => { setActiveIdx(-1) }, [searchQuery])

  const closeSearch = () => { setSuggestOpen(false); setActiveIdx(-1) }

  const goContent = (c: Content) => {
    closeSearch()
    setSearchQuery('')
    navigate(`/content/${c.id}`)
  }

  const goBrowse = () => {
    if (!searchQuery.trim()) return
    closeSearch()
    navigate(`/browse?search=${encodeURIComponent(searchQuery.trim())}`)
  }

  /** TMDB 결과 클릭 — 그 작품만 DB에 만들고(이미 있으면 그대로) 상세로 이동 */
  const goTmdb = async (hit: TmdbHit) => {
    if (registering) return
    setRegistering(true)
    try {
      const content = await DS.ensureContent({
        contentId: tmdbContentId(hit.type, hit.r.tmdbId),
        type: hit.type,
        title: hit.r.title,
        posterUrl: hit.r.posterUrl,
        releaseYear: hit.r.year,
        synopsis: hit.r.overview,
      })
      closeSearch()
      setSearchQuery('')
      navigate(`/content/${content.id}`)
    } catch (e: any) {
      toast(e?.message || '작품을 불러오지 못했어요.')
    } finally {
      setRegistering(false)
    }
  }

  const pick = (item: Item) => item.kind === 'local' ? goContent(item.content) : goTmdb(item.hit)

  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault(); setSuggestOpen(true)
      setActiveIdx(i => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault(); setSuggestOpen(true)
      setActiveIdx(i => (i <= 0 ? items.length : i) - 1)
    } else if (e.key === 'Enter') {
      // 화살표로 고른 작품이 있으면 바로 그 작품으로, 없으면 전체 검색 결과로
      if (activeIdx >= 0 && items[activeIdx]) pick(items[activeIdx])
      else goBrowse()
    } else if (e.key === 'Escape') {
      closeSearch()
    }
  }

  if (!user) return null

  return (
    <header className="header">
      <div className="header-left">
        <a className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img className="logo-img" src="/logo-trim.png" alt="방구석좋문가" />
        </a>
        <div className="search-wrap" ref={searchRef}>
          <div className="search-bar">
            <SearchIcon />
            <input
              type="text"
              placeholder="작품 검색"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSuggestOpen(true) }}
              onFocus={() => setSuggestOpen(true)}
              onKeyDown={handleSearchKey}
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => { setSearchQuery(''); closeSearch() }} aria-label="검색어 지우기">✕</button>
            )}
          </div>

          {suggestOpen && searchQuery.trim() && (
            <div className="search-suggest">
              {suggestions.map((c, i) => (
                <div
                  key={c.id}
                  className={`search-suggest-item ${i === activeIdx ? 'active' : ''}`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseDown={e => e.preventDefault()}  /* 클릭 전 blur 로 목록이 닫히는 것 방지 */
                  onClick={() => goContent(c)}
                >
                  {c.posterUrl
                    ? <img src={c.posterUrl} alt="" loading="lazy" />
                    : <div className="noimg">No Image</div>}
                  <div className="s-info">
                    <div className="s-title">{c.title}</div>
                    <div className="s-meta">
                      {TYPE_LABELS[c.type] || c.type}
                      {c.releaseYear ? ` · ${c.releaseYear}` : ''}
                      {c.platform ? ` · ${c.platform}` : ''}
                    </div>
                  </div>
                </div>
              ))}

              {/* 우리 DB에 아직 없는 옛 작품 — 누르면 그 작품만 등록하고 상세로 간다 */}
              {(tmdbHits.length > 0 || tmdbLoading) && (
                <div className="search-suggest-head">
                  {tmdbLoading && !tmdbHits.length ? '더 찾는 중…' : '아직 등록 안 된 작품'}
                </div>
              )}
              {tmdbHits.map((hit, i) => {
                const idx = suggestions.length + i
                return (
                  <div
                    key={`tmdb-${hit.r.tmdbId}-${hit.type}`}
                    className={`search-suggest-item ${idx === activeIdx ? 'active' : ''} ${registering ? 'busy' : ''}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => goTmdb(hit)}
                  >
                    {hit.r.posterUrl
                      ? <img src={hit.r.posterUrl} alt="" loading="lazy" />
                      : <div className="noimg">No Image</div>}
                    <div className="s-info">
                      <div className="s-title">{hit.r.title}</div>
                      <div className="s-meta">
                        {TYPE_LABELS[hit.type] || hit.type}
                        {hit.r.year ? ` · ${hit.r.year}` : ''}
                        <span className="s-new"> 새로 등록</span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {!items.length && !tmdbLoading && (
                <div className="search-suggest-empty">검색 결과가 없어요. 제목 일부만 쳐보세요.</div>
              )}

              <div className="search-suggest-all" onMouseDown={e => e.preventDefault()} onClick={goBrowse}>
                '{searchQuery.trim()}' 전체 검색 결과 보기 →
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="header-right">
        <NotificationPanel />
        <button className="btn btn-primary btn-small" onClick={() => navigate('/review/write')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <PlusIcon /> 리뷰쓰기
        </button>
        <div className="user-menu" ref={menuRef}>
          <div className="user-avatar" onClick={toggleUserMenu}>{user.nickname[0]}</div>
          <div className={`user-dropdown ${userMenuOpen ? 'show' : ''}`}>
            <div className="user-dropdown-header">
              {user.nickname}
              <small>{isAccount ? user.email : '유동닉 (비로그인)'}</small>
            </div>
            <div className="user-dropdown-item" onClick={() => { closeUserMenu(); navigate('/my-reviews') }}>
              <DocumentIcon /> 내 리뷰
            </div>
            <div className="user-dropdown-item" onClick={() => { closeUserMenu(); navigate('/bookmarks') }}>
              <BookmarkIcon /> 찜한 작품
            </div>
            <div className="user-dropdown-item" onClick={() => { closeUserMenu(); navigate('/settings') }}>
              <SettingsIcon /> 계정 설정
            </div>
            {user.role === 'admin' && (
              <div className="user-dropdown-item" onClick={() => { closeUserMenu(); navigate('/admin') }} style={{ color: 'var(--primary)' }}>
                <ShieldIcon /> 관리자
              </div>
            )}
            {isAccount ? (
              <div className="user-dropdown-item" onClick={async () => { closeUserMenu(); await logout(); navigate('/') }}>
                <LogoutIcon /> 로그아웃
              </div>
            ) : (
              <div className="user-dropdown-item" onClick={() => { closeUserMenu(); navigate('/auth') }} style={{ color: 'var(--primary)' }}>
                <LogoutIcon /> 로그인 / 고정닉
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
