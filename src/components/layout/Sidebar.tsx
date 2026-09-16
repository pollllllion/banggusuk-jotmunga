import { useEffect, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useNotifStore } from '@/stores/notifStore'
import { NotificationList } from '@/components/notification/NotificationList'
import { Avatar } from '@/components/profile/Avatar'
import { LevelTag } from '@/components/profile/LevelTag'
import { BOARDS } from '@/utils/constants'
import { BellIcon, BookmarkIcon, DocumentIcon, GridIcon, LogoutIcon, SettingsIcon, ShieldIcon, UserIcon } from '@/components/ui/Icons'
import { clickable } from '@/utils/a11y'

// 이 게시판 항목 뒤에 구분선을 넣는다
const DIVIDER_AFTER = new Set(['calendar', 'talk'])

/**
 * 사이드바 — **이 앱의 유일한 메뉴**.
 *
 * 2026-09-16 개편. 그전에는 이동 수단이 네 군데로 흩어져 있었다:
 *   왼쪽 햄버거(게시판) · 오른쪽 종(알림) · 오른쪽 아바타(계정) · 하단 탭.
 * 같은 화면이 두세 곳에 중복으로 들어 있었고(내 피드는 세 곳), 어떤 것은 한 곳에만
 * 있어서(찜한 작품은 아바타에만, 관심 피드는 서랍에만) "그게 어디 있더라"가 생겼다.
 * 헤더의 종과 아바타를 걷어내고 전부 여기로 모았다 — 누를 곳은 햄버거 하나다.
 *
 * 넓은 화면에서는 이 사이드바가 늘 펼쳐져 있고, 좁은 화면에서는 서랍으로 열린다.
 * 그래서 프로필·알림·설정이 여기 있어도 데스크톱에서 한 번 더 누를 일이 생기지 않는다.
 *
 * 하단 탭(MobileNav)은 그대로 둔다 — 저기는 '자주 가는 네 곳'이라 성격이 다르다.
 */
export function Sidebar() {
  const routerNavigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
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

  const isActive = (path: string) => {
    if (path.startsWith('/browse')) {
      const type = new URLSearchParams(path.split('?')[1] || '').get('type')
      return location.pathname === '/browse' && searchParams.get('type') === type
    }
    return location.pathname === path
  }

  /** 아이콘이 붙는 한 줄 — '내 활동'·'설정' 칸이 같은 모양을 쓴다 */
  const item = (path: string, icon: React.ReactNode, label: string, extra?: string) => (
    <div
      className={`sidebar-item sidebar-item-ic ${isActive(path) ? 'active' : ''} ${extra || ''}`}
      {...clickable(() => navigate(path), label)}
    >
      <span className="sidebar-ic">{icon}</span>{label}
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
        <div className="sidebar-me" {...clickable(() => navigate('/feed'), '내 피드로 가기')}>
          <Avatar src={user.avatarUrl} name={user.nickname} size={38} />
          <div className="sidebar-me-who">
            <div className="sidebar-me-nick">{user.nickname}<LevelTag authorId={user.id} /></div>
            <div className="sidebar-me-sub">{isAccount ? '내 피드 보기 ›' : '유동닉 (비로그인)'}</div>
          </div>
        </div>
      )}

      {/* 알림 — 화면을 갈아치우지 않고 여기서 펼친다. 확인하고 나면 보던 곳에 그대로 있다 */}
      <div
        className={`sidebar-item sidebar-item-ic ${notifOpen ? 'active' : ''}`}
        {...clickable(() => setNotifOpen(v => !v), '알림')}
      >
        <span className="sidebar-ic"><BellIcon /></span>알림
        {unread > 0 && <span className="sidebar-count">{unread > 99 ? '99+' : unread}</span>}
      </div>
      {notifOpen && <NotificationList onNavigate={() => { closeNavDrawer(); setNotifOpen(false) }} />}

      <div className="sidebar-divider" />

      {/* ── 게시판 ─────────────────────────────────────────── */}
      {BOARDS.map(b => (
        <div key={b.slug}>
          <div
            className={`sidebar-item ${isActive(b.path) ? 'active' : ''}`}
            onClick={() => navigate(b.path)}>
            {b.label}
          </div>
          {/* 큐레이션은 게시판이 아니라 운영자 기획 글이라 BOARDS 에 안 넣고 여기 끼운다 */}
          {b.slug === 'calendar' && (
            <div
              className={`sidebar-item ${isActive('/curation') ? 'active' : ''}`}
              onClick={() => navigate('/curation')}>
              공개작 정리
            </div>
          )}
          {DIVIDER_AFTER.has(b.slug) && <div className="sidebar-divider" />}
        </div>
      ))}
      {/* 작품 둘러보기는 그동안 하단 탭에만 있었다 — 넓은 화면에서는 갈 길이 아예 없었다 */}
      <div
        className={`sidebar-item ${location.pathname === '/browse' ? 'active' : ''}`}
        onClick={() => navigate('/browse')}>
        작품 둘러보기
      </div>

      <div className="sidebar-divider" />
      <div className="sidebar-title">내 활동</div>
      {item('/feed', <UserIcon />, '내 피드')}
      {/* 관심 등록한 사람들의 활동 모아보기 — 내 피드 바로 아래(둘 다 '피드'다) */}
      {item('/follows', <GridIcon />, '관심 피드')}
      {item('/bookmarks', <BookmarkIcon />, '찜한 작품')}

      <div className="sidebar-divider" />
      <div className="sidebar-title">설정</div>
      {item('/me', <DocumentIcon />, '내 정보')}
      {item('/settings', <SettingsIcon />, '계정 설정')}
      {/* 레벨(랭킹)은 유저가 충분히 모이면 연다. 그 전엔 관리자만 */}
      {isAdmin && item('/ranking', <ShieldIcon />, '레벨', 'is-admin')}
      {isAdmin && item('/admin', <ShieldIcon />, '관리자', 'is-admin')}

      {isAccount ? (
        <div
          className="sidebar-item sidebar-item-ic is-danger"
          {...clickable(() => { closeNavDrawer(); void logout().then(() => routerNavigate('/')) }, '로그아웃')}
        >
          <span className="sidebar-ic"><LogoutIcon /></span>로그아웃
        </div>
      ) : (
        item('/auth', <LogoutIcon />, '로그인 / 고정닉', 'is-admin')
      )}
    </nav>
  )
}
