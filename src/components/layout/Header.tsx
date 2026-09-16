import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { SearchIcon, PlusIcon, MenuIcon, BellIcon, SettingsIcon, LogoutIcon, UserIcon } from '@/components/ui/Icons'
import { useNotifStore } from '@/stores/notifStore'
import { NotificationList } from '@/components/notification/NotificationList'
import { Avatar } from '@/components/profile/Avatar'
import { LevelTag } from '@/components/profile/LevelTag'
import * as DS from '@/api/dataService'
import { TYPE_LABELS } from '@/utils/constants'
import { useToastStore } from '@/components/ui/Toast'
import { smartSearchTmdb, isSearchableQuery, tmdbEnabled, tmdbContentId, tmdbTvType, type TmdbResult } from '@/utils/tmdb'
import type { Content, ContentType } from '@/types'
import { clickable } from '@/utils/a11y'

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
  const toggleNavDrawer = useUIStore(s => s.toggleNavDrawer)
  // 서랍을 닫아 둔 채로도 알림이 왔는지 알아야 한다 — 햄버거에 붙는 숫자
  const unread = useNotifStore(s => s.unread)
  const toast = useToastStore(s => s.show)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [tmdbHits, setTmdbHits] = useState<TmdbHit[]>([])
  const [tmdbLoading, setTmdbLoading] = useState(false)
  const [registering, setRegistering] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  // 넓은 화면에서만 쓰는 두 드롭다운 (좁은 화면에서는 이 묶음 자체가 CSS 로 숨겨진다)
  const [notifOpen, setNotifOpen] = useState(false)
  const [acctOpen, setAcctOpen] = useState(false)
  const acctRef = useRef<HTMLDivElement>(null)

  // 로컬 캐시(DS.getContents) 기준이라 디바운스 없이 키 입력마다 즉시 계산해도 충분히 가볍다.
  const suggestions = useMemo(() => DS.searchContents(searchQuery, 6), [searchQuery])

  /**
   * DB에 없는 옛 작품까지 찾도록 TMDB로 한 번 더 검색한다.
   * 우리 DB는 개봉·공개 캘린더용이라 2026년 작품 위주 — '피의 게임 1~3' 같은 옛 시즌은 여기서 잡힌다.
   * alive 플래그로 늦게 도착한 이전 입력의 응답이 최신 결과를 덮지 않게 막는다.
   */
  useEffect(() => {
    const q = searchQuery.trim()
    if (!tmdbEnabled || !isSearchableQuery(q)) { setTmdbHits([]); setTmdbLoading(false); return }
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
        setTmdbHits(merged.filter(h => !DS.hasTmdbContent(h.type === 'movie' ? 'movie' : 'tv', h.r.tmdbId, h.r.seasonNumber)).slice(0, 6))
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

  // 검색 제안·알림·계정 드롭다운은 바깥을 누르면 닫는다
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (searchRef.current && !searchRef.current.contains(t)) setSuggestOpen(false)
      if (acctRef.current && !acctRef.current.contains(t)) { setNotifOpen(false); setAcctOpen(false) }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

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
        contentId: tmdbContentId(hit.type, hit.r.tmdbId, hit.r.seasonNumber),
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
        {/* 모바일 전용 — 서랍을 연다. 2026-09-16 부터 그 안에 메뉴가 전부 있다(알림·계정 포함).
            그래서 안 읽은 알림 수를 여기 붙인다 — 닫아 둔 채로도 왔는지는 알아야 한다. */}
        <button className="nav-toggle" onClick={toggleNavDrawer} aria-label={unread > 0 ? `메뉴 열기 (안 읽은 알림 ${unread}개)` : '메뉴 열기'}>
          <MenuIcon size={20} />
          {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
        </button>
        <a className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img className="logo-img" src="/logo-ottcal.png" alt="오티티칼" />
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
        {/* ── 알림·계정 (넓은 화면 전용) ────────────────────────────
            2026-09-16 에 전부 왼쪽 서랍으로 옮겼었는데, 2차 개편에서 넓은 화면의 메뉴가
            상단 띠(TopNav)로 눕으면서 그 서랍이 좁은 화면 전용이 됐다.
            띠에는 '나에 관한 것'을 넣지 않는다(갈 곳만 남겨야 훑힌다) — 그래서 여기로 돌아온다.
            **좁은 화면에서는 이 묶음이 통째로 숨겨진다.** 거기서는 여전히 햄버거 하나가 전부다. */}
        {user && (
          <div className="header-acct" ref={acctRef}>
            <button
              className={`hd-btn ${notifOpen ? 'on' : ''}`}
              onClick={() => { setAcctOpen(false); setNotifOpen(v => !v) }}
              aria-label={unread > 0 ? `알림 (안 읽음 ${unread}개)` : '알림'}
            >
              <BellIcon size={19} />
              {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
            </button>
            <button
              className={`hd-me ${acctOpen ? 'on' : ''}`}
              onClick={() => { setNotifOpen(false); setAcctOpen(v => !v) }}
              aria-label="내 계정 메뉴"
            >
              <Avatar src={user.avatarUrl} name={user.nickname} size={26} />
              <span className="hd-me-nick">{user.nickname}<LevelTag authorId={user.id} /></span>
            </button>

            {notifOpen && (
              <div className="hd-drop hd-drop-notif">
                <NotificationList onNavigate={() => setNotifOpen(false)} />
              </div>
            )}

            {acctOpen && (
              <div className="hd-drop hd-drop-acct">
                <button className="hd-item" onClick={() => { setAcctOpen(false); navigate('/me') }}>
                  <UserIcon size={15} /> 내 정보
                </button>
                <button className="hd-item" onClick={() => { setAcctOpen(false); navigate('/settings') }}>
                  <SettingsIcon size={15} /> 설정
                </button>
                {/* 유동닉에게는 로그아웃할 것이 없다 — 대신 고정닉으로 가는 길을 둔다 */}
                {isAccount ? (
                  <button className="hd-item is-danger" onClick={() => { setAcctOpen(false); void logout().then(() => navigate('/')) }}>
                    <LogoutIcon size={15} /> 로그아웃
                  </button>
                ) : (
                  <button className="hd-item is-link" onClick={() => { setAcctOpen(false); navigate('/auth') }}>
                    <UserIcon size={15} /> 로그인
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {/* 모바일에선 글쓰기를 하단 탭 가운데 + 버튼이 맡는다 */}
        <button className="btn btn-primary btn-small header-write" onClick={() => navigate('/talk/write')}>
          <PlusIcon /> 토론하기
        </button>
      </div>
    </header>
  )
}
