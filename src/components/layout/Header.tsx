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
import { TYPE_LABELS, TALK_LABEL } from '@/utils/constants'
import { useToastStore } from '@/components/ui/Toast'
import type { Content, Discussion, DiscussionComment } from '@/types'
import { useTmdbFallback, ensureFromTmdb, type TmdbHit } from '@/hooks/useTmdbFallback'
import { snippet } from '@/utils/postSearch'
import { boardDate } from '@/utils/helpers'
import { clickable } from '@/utils/a11y'
import { trackEvent } from '@/utils/analytics'

/** 네 갈래 결과를 한 줄로 세운 것 — 키보드 이동·선택이 목록을 넘나들 수 있게.
 *  차례는 화면에 그리는 차례와 같아야 한다(작품 → 글 → 댓글 → 아직 등록 안 된 작품). */
type Item =
  | { kind: 'local'; content: Content }
  | { kind: 'post'; post: Discussion }
  | { kind: 'comment'; comment: DiscussionComment }
  | { kind: 'tmdb'; hit: TmdbHit }

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
  const [registering, setRegistering] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  // 넓은 화면에서만 쓰는 두 드롭다운 (좁은 화면에서는 이 묶음 자체가 CSS 로 숨겨진다)
  const [notifOpen, setNotifOpen] = useState(false)
  const [acctOpen, setAcctOpen] = useState(false)
  const acctRef = useRef<HTMLDivElement>(null)

  // 로컬 캐시(DS.getContents) 기준이라 디바운스 없이 키 입력마다 즉시 계산해도 충분히 가볍다.
  // 글·댓글도 같은 캐시에 통째로 들어와 있어 서버를 다시 부르지 않는다.
  const blockedIds = useMemo(() => (user ? DS.getBlockedIds(user.id) : []), [user])
  const suggestions = useMemo(() => DS.searchContents(searchQuery, 5), [searchQuery])
  const posts = useMemo(() => DS.searchDiscussions(searchQuery, 5, { blockedIds }), [searchQuery, blockedIds])
  const comments = useMemo(() => DS.searchDiscussionComments(searchQuery, 3, { blockedIds }), [searchQuery, blockedIds])

  // DB 에 없는 옛 작품까지 찾는 TMDB 폴백 — 작품 둘러보기와 같은 것을 쓴다(hooks/useTmdbFallback)
  const { hits: tmdbHits, loading: tmdbLoading } = useTmdbFallback(searchQuery)

  const items: Item[] = [
    ...suggestions.map(content => ({ kind: 'local' as const, content })),
    ...posts.map(post => ({ kind: 'post' as const, post })),
    ...comments.map(comment => ({ kind: 'comment' as const, comment })),
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
    trackEvent('search_pick', { target: c.id, meta: { q: searchQuery.trim().slice(0, 100) } })
    closeSearch()
    setSearchQuery('')
    navigate(`/content/${c.id}`)
  }

  /** 글·댓글로 이동 — 자유방 글도 상세는 /talk/:id 다 */
  const goPost = (discussionId: string) => {
    trackEvent('search_pick', { target: discussionId, meta: { q: searchQuery.trim().slice(0, 100), kind: 'post' } })
    closeSearch()
    setSearchQuery('')
    navigate(`/talk/${discussionId}`)
  }

  /** 엔터·맨 아래 줄 — 작품만 있는 /browse 가 아니라 통합검색 화면으로 간다 */
  const goSearchAll = () => {
    if (!searchQuery.trim()) return
    closeSearch()
    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
  }

  /** TMDB 결과 클릭 — 그 작품만 DB에 만들고(이미 있으면 그대로) 상세로 이동 */
  const goTmdb = async (hit: TmdbHit) => {
    if (registering) return
    setRegistering(true)
    try {
      const content = await ensureFromTmdb(hit)
      trackEvent('search_pick', { target: content.id, meta: { q: searchQuery.trim().slice(0, 100), kind: 'tmdb', title: content.title } })
      closeSearch()
      setSearchQuery('')
      navigate(`/content/${content.id}`)
    } catch (e: any) {
      toast(e?.message || '작품을 불러오지 못했어요.')
    } finally {
      setRegistering(false)
    }
  }

  const pick = (item: Item) => {
    if (item.kind === 'local') return goContent(item.content)
    if (item.kind === 'post') return goPost(item.post.id)
    if (item.kind === 'comment') return goPost(item.comment.discussionId)
    return goTmdb(item.hit)
  }

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
      else goSearchAll()
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
            {/* type=search + autoComplete=off — 브라우저 비밀번호 관리자가 이 칸을
                '아이디 칸'으로 착각해 이메일을 채워 넣던 것을 막는다. 비밀번호 칸이 있는
                화면(설정·로그인)에서 그 짝을 DOM 에서 찾는데, 힌트가 없으면 가장 가까운
                글자 입력칸을 집는다 — 헤더 검색창이 늘 위에 떠 있어 그게 걸렸다. */}
            <input
              type="search"
              name="q"
              autoComplete="off"
              placeholder="통합검색"
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
              {/* 갈래마다 제목을 붙인다 — 한 창에서 작품·글·댓글이 섞여 나오므로,
                  제목이 없으면 지금 보는 줄이 어느 갈래인지 알 수 없다 */}
              {suggestions.length > 0 && <div className="search-suggest-head first">작품</div>}
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

              {/* ── 게시글 (제목 + 본문) ────────────────────────────
                  작품만 찾던 창을 통합검색으로 넓힌 자리다. 사람이 찾는 말은 작품 이름만이
                  아니다 — "결말", "떡밥" 처럼 글에서만 오가는 말이 더 많다. */}
              {posts.length > 0 && <div className="search-suggest-head">게시글</div>}
              {posts.map((p, i) => {
                const idx = suggestions.length + i
                return (
                  <div
                    key={p.id}
                    className={`search-suggest-item is-text ${idx === activeIdx ? 'active' : ''}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => goPost(p.id)}
                  >
                    <div className="s-info">
                      <div className="s-title">{p.title || snippet(p.body, searchQuery, 20)}</div>
                      <div className="s-meta">
                        <span className="s-board">{(p.board || 'talk') === 'relay' ? '자유방' : TALK_LABEL}</span>
                        {/* 왜 이 글이 걸렸는지 — 검색어가 나온 자리를 잘라 보여 준다 */}
                        <span className="s-snip">{snippet(p.body, searchQuery, 24)}</span>
                        <span className="s-date">{boardDate(p.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* ── 댓글 ───────────────────────────────────────────
                  글 제목에는 없는 말이 댓글에서 오갈 때가 있다. 누르면 그 글로 간다. */}
              {comments.length > 0 && <div className="search-suggest-head">댓글</div>}
              {comments.map((c, i) => {
                const idx = suggestions.length + posts.length + i
                const parent = DS.getDiscussions().find(d => d.id === c.discussionId)
                return (
                  <div
                    key={c.id}
                    className={`search-suggest-item is-text ${idx === activeIdx ? 'active' : ''}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => goPost(c.discussionId)}
                  >
                    <div className="s-info">
                      <div className="s-title">{snippet(c.body, searchQuery, 24)}</div>
                      <div className="s-meta">
                        {/* 위 칸 제목이 이미 '댓글'이라 여기 또 쓰지 않는다 — 어느 게시판 글에 달린 건지를 말한다 */}
                        <span className="s-board">{(parent?.board || 'talk') === 'relay' ? '자유방' : TALK_LABEL}</span>
                        <span className="s-snip">{parent?.title || snippet(parent?.body || '', searchQuery, 16)}</span>
                        <span className="s-date">{boardDate(c.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* 우리 DB에 아직 없는 옛 작품 — 누르면 그 작품만 등록하고 상세로 간다 */}
              {(tmdbHits.length > 0 || tmdbLoading) && (
                <div className="search-suggest-head">
                  {tmdbLoading && !tmdbHits.length ? '더 찾는 중…' : '아직 등록 안 된 작품'}
                </div>
              )}
              {tmdbHits.map((hit, i) => {
                const idx = suggestions.length + posts.length + comments.length + i
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
                <div className="search-suggest-empty">검색 결과가 없어요. 작품 이름이나 글에 나올 법한 말을 쳐보세요.</div>
              )}

              <div className="search-suggest-all" onMouseDown={e => e.preventDefault()} onClick={goSearchAll}>
                '{searchQuery.trim()}' 통합 검색 결과 보기 →
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
