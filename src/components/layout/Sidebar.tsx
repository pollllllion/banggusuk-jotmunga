import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useNotifStore } from '@/stores/notifStore'
import { NotificationList } from '@/components/notification/NotificationList'
import { Avatar } from '@/components/profile/Avatar'
import { LevelTag } from '@/components/profile/LevelTag'
import { BellIcon, LogoutIcon, SettingsIcon, SunIcon, MoonIcon } from '@/components/ui/Icons'
import { applyTheme, isDarkNow, watchSystemTheme } from '@/utils/theme'
import { ADMIN_ROWS, BOARD_ROWS, MINE_ROWS, isNavActive, type NavRow } from './navRows'
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
 * 하단 탭(MobileNav)은 그대로 둔다 — 저기는 '자주 가는 네 곳'이라 성격이 다르다.
 *
 * 2026-09-16 2차 — **이제 좁은 화면 전용이다.** 넓은 화면에서는 같은 메뉴가 상단 띠(TopNav)로
 * 눕는다. 목록은 navRows.ts 에 한 벌만 두므로 두 화면이 갈라지지 않는다.
 * (컴포넌트는 넓은 화면에서도 계속 마운트된다 — 아래 알림 재조회가 여기 걸려 있어서,
 *  화면이 넓다고 떼어 내면 PC 에서 종의 숫자가 안 는다.)
 */

export function Sidebar() {
  const routerNavigate = useNavigate()
  const location = useLocation()
  const { user, isAccount, logout } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const { navDrawerOpen, closeNavDrawer } = useUIStore()
  const { unread, sync, reload } = useNotifStore()
  /** 알림 목록을 펼쳤나 — 서랍 안에서 접었다 폈다 한다(화면을 갈아치우지 않는다) */
  const [notifOpen, setNotifOpen] = useState(false)
  /** 지금 어두운 화면인가 — 해/달 버튼 모양. 설정 화면에서 바꾸고 돌아오거나(주소가 바뀐다)
   *  '시스템' 인 채로 OS 가 바뀌면 다시 읽는다. 사이드바는 넓은 화면에서도 계속 마운트돼 있다 */
  const [dark, setDark] = useState(isDarkNow)
  useEffect(() => watchSystemTheme(() => setDark(isDarkNow())), [])
  useEffect(() => { setDark(isDarkNow()) }, [location.pathname])

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

  const adminRows = isAdmin ? ADMIN_ROWS : []

  const row = (r: NavRow) => (
    <div
      key={r.path}
      className={`sb-row ${isNavActive(location.pathname, r.path) ? 'active' : ''} ${r.admin ? 'is-admin' : ''}`}
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
          {/* 라이트·다크 바로 바꾸기 — 설정까지 들어가지 않고 한 번에. 지금 화면의 반대쪽
              아이콘을 보여준다(밝을 땐 달, 어두울 땐 해). 누르면 '시스템 따라가기'가 아니라
              그 모드로 고정된다. 시스템으로 되돌리기는 설정 화면에 그대로 있다 */}
          <button
            className="sb-top-btn"
            onClick={() => { applyTheme(dark ? 'light' : 'dark'); setDark(!dark) }}
            aria-label={dark ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기'}
            title={dark ? '라이트 모드로 바꾸기' : '다크 모드로 바꾸기'}
          >
            {dark ? <SunIcon size={19} /> : <MoonIcon size={18} />}
          </button>
          <button className="sb-top-btn" onClick={() => navigate('/settings')} aria-label="설정">
            <SettingsIcon size={19} />
          </button>
        </div>

        {/* 프로필 줄 — 누르면 내 정보(/me)로. 내 활동 기록과 프로필이 거기 있다.
            목록에 따로 '내 정보' 줄을 두지 않는 이유가 이것이다: 이름과 얼굴이 적힌
            이 줄이 곧 그 화면으로 가는 문이다. 두 번 적을 일이 아니다. */}
        {user && (
          <div className="sb-me" {...clickable(() => navigate('/me'), '내 정보로 가기')}>
            <Avatar src={user.avatarUrl} name={user.nickname} size={38} />
            <div className="sb-me-who">
              <div className="sb-me-nick">{user.nickname}<LevelTag authorId={user.id} /></div>
              <div className="sb-me-sub">{isAccount ? '내 정보' : '유동닉 (비로그인)'}</div>
            </div>
            {/* 로그인 — 지금 누구인지를 말하는 자리가 곧 그걸 바꾸는 자리다.
                (프로필 줄 전체가 내 정보로 가는 버튼이라 눌림이 위로 새지 않게 막는다) */}
            {!isAccount
              ? <button className="sb-login" onClick={e => { e.stopPropagation(); navigate('/auth') }}>로그인</button>
              : <span className="sb-me-go" aria-hidden>›</span>}
          </div>
        )}
      </div>

      {/* 알림 — 화면을 갈아치우지 않고 머리 블록 바로 아래에서 펼친다 */}
      {notifOpen && <NotificationList onNavigate={() => { closeNavDrawer(); setNotifOpen(false) }} />}

      {/* 첫 칸에는 제목을 안 붙인다 — 머리 블록 바로 아래 오는 목록이 게시판이라는 건
          굳이 안 적어도 읽힌다. 아래 칸들은 성격이 갈려서 이름이 있어야 한다. */}
      {BOARD_ROWS.map(row)}

      <div className="sb-sec">내 활동</div>
      {MINE_ROWS.map(row)}

      {/* 관리자 줄은 관리자에게만. 없는 사람에겐 이 칸 자체가 안 그려진다 */}
      {adminRows.length > 0 && <div className="sb-sec">관리자</div>}
      {adminRows.map(row)}

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
