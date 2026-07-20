import { useNavigate, useLocation } from 'react-router-dom'
import { HomeIcon, GridIcon, PlusIcon, UserIcon } from '@/components/ui/Icons'

export function MobileNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <div className="mobile-nav">
      <div className={`mobile-nav-item ${pathname === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
        <HomeIcon />캘린더
      </div>
      <div className={`mobile-nav-item ${pathname === '/browse' ? 'active' : ''}`} onClick={() => navigate('/browse')}>
        <GridIcon />작품
      </div>
      <div className="mobile-nav-item" onClick={() => navigate('/review/write')} style={{ color: 'var(--primary)' }}>
        <PlusIcon size={20} />리뷰
      </div>
      <div className={`mobile-nav-item ${pathname === '/feed' ? 'active' : ''}`} onClick={() => navigate('/feed')}>
        <UserIcon />내 피드
      </div>
    </div>
  )
}
