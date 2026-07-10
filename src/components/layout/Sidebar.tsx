import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { CONTENT_TYPES } from '@/utils/constants'

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const currentType = searchParams.get('type') || ''
  const isBrowse = location.pathname === '/browse'

  return (
    <nav className="sidebar">
      <div className="sidebar-title">카테고리</div>
      {CONTENT_TYPES.map(t => (
        <div key={t.code}
          className={`sidebar-item ${isBrowse && currentType === t.code ? 'active' : ''}`}
          onClick={() => navigate(`/browse?type=${t.code}`)}>
          <span className="e">{t.emoji}</span> {t.label}
        </div>
      ))}

      <div className="sidebar-divider" />
      <div className="sidebar-title">내 활동</div>
      <div className="sidebar-item" onClick={() => navigate('/my-reviews')}>
        <span className="e">{'\u{270D}'}</span> 내 리뷰
      </div>
      <div className="sidebar-item" onClick={() => navigate('/bookmarks')}>
        <span className="e">{'\u{1F516}'}</span> 찜한 작품
      </div>
    </nav>
  )
}
