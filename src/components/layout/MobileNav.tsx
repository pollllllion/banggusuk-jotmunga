import { useNavigate, useLocation } from 'react-router-dom'
import { HomeIcon, GridIcon, PlusIcon, BookmarkIcon, UserIcon } from '@/components/ui/Icons'

export function MobileNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <div className="mobile-nav">
      <div className={`mobile-nav-item ${pathname === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
        <HomeIcon />홈
      </div>
      <div className={`mobile-nav-item ${pathname === '/browse' ? 'active' : ''}`} onClick={() => navigate('/browse')}>
        <GridIcon />작품
      </div>
      <div className="mobile-nav-item" onClick={() => navigate('/review/write')} style={{ color: 'var(--primary)' }}>
        <PlusIcon size={20} />리뷰
      </div>
      <div className={`mobile-nav-item ${pathname === '/bookmarks' ? 'active' : ''}`} onClick={() => navigate('/bookmarks')}>
        <BookmarkIcon />찜
      </div>
      <div className={`mobile-nav-item ${pathname === '/my-reviews' ? 'active' : ''}`} onClick={() => navigate('/my-reviews')}>
        <UserIcon />내글
      </div>
    </div>
  )
}
