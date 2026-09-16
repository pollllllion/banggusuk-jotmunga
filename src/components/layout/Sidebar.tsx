import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useNotifStore } from '@/stores/notifStore'
import { NotificationList } from '@/components/notification/NotificationList'
import { Avatar } from '@/components/profile/Avatar'
import { LevelTag } from '@/components/profile/LevelTag'
import { TALK_LABEL } from '@/utils/constants'
import { BellIcon, LogoutIcon, SettingsIcon } from '@/components/ui/Icons'
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
 * ── 생김새 (2026-09-16 3차 · 디시 모바일 서랍 참고) ────────
 * 세 가지로 읽기 쉽게 만든다:
 *   ① **진한 머리 블록** — 로고·알림·설정·프로필을 한 덩어리로 묶는다.
 *      '나에 관한 것'과 '갈 곳'이 색으로 갈리므로 목록에는 갈 곳만 남는다.
 *   ② **큰 글씨** — 줄 글자를 15px/600 으로 키우고 줄 높이를 늘렸다.
 *      13.5px 에 아이콘까지 붙어 있던 목록은 훑을 때 글자가 먼저 안 들어왔다.
 *   ③ **아이콘을 뺀다** — 줄마다 그림이 붙으면 왼쪽이 시끄러워 글자를 가린다.
 *      대신 오른쪽에 › 하나로 '누르면 간다'만 알린다. 그림이 뜻을 더하지 않는
 *      자리에서는 글자가 더 빨리 읽힌다.
 *
 * 넓은 화면에서는 이 사이드바가 늘 펼쳐져 있고, 좁은 화면에서는 서랍으로 열린다.
 * 하단 탭(MobileNav)은 그대로 둔다 — 저기는 '자주 가는 네 곳'이라 성격이 다르다.
 */

interface Row {
  path: string
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
    { path: '/', label: '개봉·공개 캘린더' },
    { path: '/curation', label: '공개작 정리' },
    { path: '/talk', label: TALK_LABEL },
    { path: '/board/relay', label: '자유방' },
    { path: '/browse', label: '작품 둘러보기' },
  ]
  const mine: Row[] = [
    { path: '/feed', label: '내 피드' },
    { path: '/follows', label: '관심 피드' },
    { path: '/bookmarks', label: '찜한 작품' },
  ]
  const account: Row[] = [
    { path: '/me', label: '내 정보' },
    ...(isAdmin ? [
      { path: '/ranking', label: '레벨', admin: true },
      { path: '/admin', label: '관리자', admin: true },
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
      <span className="sb-label">{r.label}</span>
      <span className="sb-go" aria-hidden>›</span>
    </div>
  )

  return (
    <nav className={`sidebar ${navDrawerOpen ? 'open' : ''}`}>
      {/* ── 머리 블록 ─────────────────────────────────────
          로고·알림·설정·프로필이 한 덩어리다. 아래 흰 목록과 색으로 갈리므로
          "나에 관한 것은 여기, 갈 곳은 아래"가 한눈에 읽힌다. */}
      <div className="sb-top">
        <div className="sb-top-bar">
          <a className="sb-logo" onClick={() => navigate('/')} aria-label="오티티칼 홈">
            <img src="/logo-ottcal.png" alt="오티티칼" />
          </a>
          <button
            className={`sb-top-btn ${notifOpen ? 'on' : ''}`}
            onClick={() => setNotifOpen(v => !v)}
            aria-label={unread > 0 ? `알림 (안 읽음 ${unread}개)` : '알림'}
          >
            <BellIcon size={19} />
            {unread > 0 && <span className="sb-top-dot">{unread > 99 ? '99+' : unread}</span>}
          </button>
          <button className="sb-top-btn" onClick={() => navigate('/settings')} aria-label="설정">
            <SettingsIcon size={19} />
          </button>
        </div>

        {user && (
          <div className="sb-me" {...clickable(() => navigate('/feed'), '내 피드로 가기')}>
            <Avatar src={user.avatarUrl} name={user.nickname} size={38} />
            <div className="sb-me-who">
              <div className="sb-me-nick">{user.nickname}<LevelTag authorId={user.id} /></div>
              <div className="sb-me-sub">{isAccount ? '내 피드 보기' : '유동닉 (비로그인)'}</div>
            </div>
            {/* 로그인 — 지금 누구인지를 말하는 자리가 곧 그걸 바꾸는 자리다.
                (프로필 줄 전체가 내 피드로 가는 버튼이라 눌림이 위로 새지 않게 막는다) */}
            {!isAccount
              ? <button className="sb-login" onClick={e => { e.stopPropagation(); navigate('/auth') }}>로그인</button>
              : <span className="sb-me-go" aria-hidden>›</span>}
          </div>
        )}
      </div>

      {/* 알림 — 화면을 갈아치우지 않고 머리 블록 바로 아래에서 펼친다 */}
      {notifOpen && <NotificationList onNavigate={() => { closeNavDrawer(); setNotifOpen(false) }} />}

      <div className="sb-sec">게시판</div>
      {boards.map(row)}

      <div className="sb-sec">내 활동</div>
      {mine.map(row)}

      <div className="sb-sec">계정</div>
      {account.map(row)}
      {isAccount && (
        <div
          className="sb-row is-danger"
          {...clickable(() => { closeNavDrawer(); void logout().then(() => routerNavigate('/')) }, '로그아웃')}
        >
          <span className="sb-label">로그아웃</span>
          <span className="sb-go" aria-hidden><LogoutIcon size={15} /></span>
        </div>
      )}
    </nav>
  )
}
