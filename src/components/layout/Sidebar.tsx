import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { BOARDS } from '@/utils/constants'

// 이 게시판 항목 뒤에 구분선을 넣는다
const DIVIDER_AFTER = new Set(['calendar', 'talk'])

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'admin'

  const isActive = (path: string) => {
    if (path.startsWith('/browse')) {
      const type = new URLSearchParams(path.split('?')[1] || '').get('type')
      return location.pathname === '/browse' && searchParams.get('type') === type
    }
    return location.pathname === path
  }

  return (
    <nav className="sidebar">
      <a className="sidebar-brand" onClick={() => navigate('/')}>
        <img src="/logo-trim.png" alt="방구석좋문가" />
      </a>
      {BOARDS.map(b => (
        <div key={b.slug}>
          <div
            className={`sidebar-item ${isActive(b.path) ? 'active' : ''}`}
            onClick={() => navigate(b.path)}>
            <span className="e">{b.emoji}</span> {b.label}
          </div>
          {DIVIDER_AFTER.has(b.slug) && <div className="sidebar-divider" />}
        </div>
      ))}

      {/* 방구석 레벨 — 유저 충분히 모이면 오픈. 그 전엔 관리자만 노출 */}
      {isAdmin && (
        <>
          <div className="sidebar-divider" />
          <div
            className={`sidebar-item ${isActive('/ranking') ? 'active' : ''}`}
            onClick={() => navigate('/ranking')}>
            <span className="e">{'\u{1F3C5}'}</span> 방구석 레벨
          </div>
        </>
      )}

      <div className="sidebar-divider" />
      <div className="sidebar-title">내 활동</div>
      <div className="sidebar-item" onClick={() => navigate('/feed')}>
        <span className="e">{'\u{1F4F0}'}</span> 내 피드
      </div>
    </nav>
  )
}
