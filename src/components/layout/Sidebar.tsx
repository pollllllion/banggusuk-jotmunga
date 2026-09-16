import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useNotifStore } from '@/stores/notifStore'
import { NotificationList } from '@/components/notification/NotificationList'
import { Avatar } from '@/components/profile/Avatar'
import { LevelTag } from '@/components/profile/LevelTag'
import { TALK_LABEL } from '@/utils/constants'
import {
  BellIcon, BookmarkIcon, CalendarIcon, CommentIcon, DocumentIcon, GridIcon,
  LogoutIcon, PeopleIcon, SettingsIcon, ShieldIcon, StarIcon, UserIcon,
} from '@/components/ui/Icons'
import { clickable } from '@/utils/a11y'

/**
 * 사이드바 — **이 앱의 유일한 메뉴**.
 *
 * 2026-09-16 개편. 그전에는 이동 수단이 네 군데로 흩어져 있었다:
 *   왼쪽 햄버거(게시판) · 오른쪽 종(알림) · 오른쪽 아바타(계정) · 하단 탭.
 * 같은 화면이 두세 곳에 중복으로 들어 있었고(내 피드는 세 곳), 어떤 것은 한 곳에만
 * 있어서(찜한 작품은 아바타에만, 관심 피드는 서랍에만) "그게 어디 있더라"가 생겼다.
 * 헤더의 종과 아바타를 걷어내고 전부 여기로 모았다 — 누를 곳은 햄버거 하나다.
 *
 * ── 생김새의 규칙 (2026-09-16 2차) ────────────────────────
 * 줄은 **한 종류뿐**이다. 전부 같은 높이, 전부 아이콘 하나, 전부 아래 실선 하나.
 * 처음엔 게시판만 글자 줄이고 아래쪽만 아이콘 줄이었는데, 그러면 같은 목록 안에서
 * 두 가지 모양이 번갈아 나와 조잡해 보인다. 구분선도 마찬가지 — 칸 사이에만
 * 띄엄띄엄 넣으면 규칙이 없어 보인다. 모든 줄에 같은 실선을 깔고, 칸은 **제목**으로
 * 나눈다(게시판 · 내 활동 · 설정). 선이 아니라 이름이 칸을 가른다.
 *
 * 넓은 화면에서는 이 사이드바가 늘 펼쳐져 있고, 좁은 화면에서는 서랍으로 열린다.
 * 하단 탭(MobileNav)은 그대로 둔다 — 저기는 '자주 가는 네 곳'이라 성격이 다르다.
 */

/** 메뉴 한 줄 */
interface Row {
  path: string
  icon: ReactNode
  label: string
  /** 관리자 전용 줄 — 파란 글씨 */
  admin?: boolean
}

export function Sidebar() {
  const routerNavigate = useNavigate()
  const location = useLocation()
  const { user, isAccount, logout } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const { navDrawerOpen, closeNavDrawer } = useUIStore()
  const { unread, sync, reload } = useNotifStore()
  /** 알림 목록을 펼쳤나 — 서랍 안에서 접었다 폈다 한다(화면을 갈아치우지 않는다) */
  const [notifOpen, setNotifOpen] = useState(false)

  /**
   * 알림 재조회는 **여기서** 건다. 목록(NotificationList)은 펼쳤을 때만 그려지는데,
   * 그러면 접어 둔 동안 햄버거의 숫자가 늘지 않는다.
   * 폰에서 앱을 다시 열었을 때가 이 경로다(visibilitychange).
   */
  const uid = user?.id
  useEffect(() => {
    void reload(uid, isAccount, true)
    const onFocus = () => { if (document.visibilityState === 'visible') void reload(uid, isAccount) }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [uid, isAccount, reload])

  // 캐시가 바뀌는 경로(다른 화면에서 읽음 처리 등)에도 숫자가 따라오게
  useEffect(() => { sync(uid) }, [uid, sync])

  // 모바일에선 이 사이드바가 서랍으로 열린다 — 이동하면 바로 닫는다
  const navigate = (path: string) => { closeNavDrawer(); setNotifOpen(false); routerNavigate(path) }

  const boards: Row[] = [
    { path: '/', icon: <CalendarIcon size={17} />, label: '개봉·공개 캘린더' },
    { path: '/curation', icon: <StarIcon size={17} filled={false} />, label: '공개작 정리' },
    { path: '/talk', icon: <CommentIcon size={17} />, label: TALK_LABEL },
    { path: '/board/relay', icon: <CommentIcon size={17} />, label: '자유방' },
    { path: '/browse', icon: <GridIcon size={17} />, label: '작품 둘러보기' },
  ]
  const mine: Row[] = [
    { path: '/feed', icon: <UserIcon size={17} />, label: '내 피드' },
    { path: '/follows', icon: <PeopleIcon size={17} />, label: '관심 피드' },
    { path: '/bookmarks', icon: <BookmarkIcon size={17} />, label: '찜한 작품' },
  ]
  const settings: Row[] = [
    { path: '/me', icon: <DocumentIcon size={17} />, label: '내 정보' },
    { path: '/settings', icon: <SettingsIcon size={17} />, label: '설정' },
    ...(isAdmin ? [
      { path: '/ranking', icon: <ShieldIcon size={17} />, label: '레벨', admin: true },
      { path: '/admin', icon: <ShieldIcon size={17} />, label: '관리자', admin: true },
    ] : []),
  ]

  /** 지금 보고 있는 화면인가 — 게시판 글 상세에 있어도 그 게시판이 켜져 있어야 한다 */
  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    if (path === '/talk') return location.pathname.startsWith('/talk')
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const row = (r: Row) => (
    <div
      key={r.path}
      className={`sb-row ${isActive(r.path) ? 'active' : ''} ${r.admin ? 'is-admin' : ''}`}
      {...clickable(() => navigate(r.path), r.label)}
    >
      <span className="sb-ic">{r.icon}</span>
      <span className="sb-label">{r.label}</span>
    </div>
  )

  return (
    <nav className={`sidebar ${navDrawerOpen ? 'open' : ''}`}>
      <a className="sidebar-brand" onClick={() => navigate('/')}>
        <img src="/logo-ottcal.png" alt="오티티칼" />
      </a>

      {/* ── 나 ─────────────────────────────────────────────
          누구로 들어와 있는지가 메뉴 맨 위에 있어야 한다 — 유동닉인지 고정닉인지가
          이 앱에서는 할 수 있는 일을 가른다(별점·관심·알림). 누르면 내 피드로. */}
      {user && (
        <div className="sb-me" {...clickable(() => navigate('/feed'), '내 피드로 가기')}>
          <Avatar src={user.avatarUrl} name={user.nickname} size={40} />
          <div className="sb-me-who">
            <div className="sb-me-nick">{user.nickname}<LevelTag authorId={user.id} /></div>
            <div className="sb-me-sub">{isAccount ? '내 피드 보기 ›' : '유동닉 (비로그인)'}</div>
          </div>
          {/* 로그인 — 맨 아래 목록 줄이 아니라 여기 둔다. 지금 누구인지를 말하는 자리가
              곧 '바꾸는' 자리다. 메뉴를 끝까지 내려야 보이던 것을 첫 줄로 올렸다.
              (프로필 줄 전체가 내 피드로 가는 버튼이라 눌림이 위로 새지 않게 막는다) */}
          {!isAccount && (
            <button
              className="sb-login"
              onClick={e => { e.stopPropagation(); navigate('/auth') }}
            >로그인</button>
          )}
        </div>
      )}

      {/* 알림 — 화면을 갈아치우지 않고 여기서 펼친다. 확인하고 나면 보던 곳에 그대로 있다 */}
      <div
        className={`sb-row ${notifOpen ? 'open' : ''}`}
        {...clickable(() => setNotifOpen(v => !v), '알림')}
      >
        <span className="sb-ic"><BellIcon size={17} /></span>
        <span className="sb-label">알림</span>
        {unread > 0 && <span className="sb-count">{unread > 99 ? '99+' : unread}</span>}
        <span className="sb-caret" aria-hidden>{notifOpen ? '⌃' : '⌄'}</span>
      </div>
      {notifOpen && <NotificationList onNavigate={() => { closeNavDrawer(); setNotifOpen(false) }} />}

      <div className="sb-group">게시판</div>
      {boards.map(row)}

      <div className="sb-group">내 활동</div>
      {mine.map(row)}

      <div className="sb-group">설정</div>
      {settings.map(row)}
      {/* 로그인은 위 프로필 줄로 올라갔다 — 여기 남는 것은 로그아웃뿐이다 */}
      {isAccount && (
        <div
          className="sb-row is-danger"
          {...clickable(() => { closeNavDrawer(); void logout().then(() => routerNavigate('/')) }, '로그아웃')}
        >
          <span className="sb-ic"><LogoutIcon size={17} /></span>
          <span className="sb-label">로그아웃</span>
        </div>
      )}
    </nav>
  )
}
