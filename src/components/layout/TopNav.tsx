import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { ADMIN_ROWS, BOARD_ROWS, MINE_ROWS, isNavActive, type NavRow } from './navRows'
import { clickable } from '@/utils/a11y'

/**
 * PC 상단 메뉴 띠 — **넓은 화면에서만 나온다.**
 *
 * 2026-09-16 2차 개편. 그전에는 넓은 화면에서도 왼쪽 240px 사이드바가 늘 펼쳐져 있었는데,
 * 본문이 860px 로 묶여 있어 사이드바가 본문을 왼쪽으로 몰고 오른쪽만 비는 그림이 됐다.
 * 메뉴를 가로로 눕히면 그 240px 이 본문으로 돌아온다.
 *
 * 왼쪽·오른쪽으로 가르는 이유(디시 PC 구성 + 이 앱의 규칙):
 *   왼쪽 = 게시판(남들과 함께 보는 곳) · 오른쪽 = 내 활동(나만의 것).
 * 모바일 서랍이 '게시판 / 내 활동' 으로 나눠 놓은 것과 같은 규칙이라 두 화면이 같은 지도를 쓴다.
 * 목록 자체는 navRows.ts 한 곳에 있다 — 게시판을 추가할 때 한쪽만 고치는 일이 없게.
 *
 * **모바일에는 이게 안 나온다**(CSS 로 숨긴다). 좁은 화면의 메뉴는 그대로 왼쪽 서랍이다.
 */
export function TopNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'admin'

  // 로그인/유동닉 배정 전에는 헤더와 함께 통째로 안 그린다 (Header 와 같은 조건)
  if (!user) return null

  const link = (r: NavRow) => (
    <span
      key={r.path}
      className={`tn-link ${isNavActive(location.pathname, r.path) ? 'active' : ''} ${r.admin ? 'is-admin' : ''}`}
      {...clickable(() => navigate(r.path), r.label)}
    >
      {r.label}
    </span>
  )

  return (
    <nav className="topnav" aria-label="주 메뉴">
      <div className="topnav-inner">
        <div className="tn-group">{BOARD_ROWS.map(link)}</div>
        {/* 오른쪽 끝으로 민다 — 가운데가 비어 있어야 메뉴가 늘어도 두 덩어리가 안 붙는다 */}
        <div className="tn-group tn-mine">
          {MINE_ROWS.map(link)}
          {isAdmin && ADMIN_ROWS.map(link)}
        </div>
      </div>
    </nav>
  )
}
