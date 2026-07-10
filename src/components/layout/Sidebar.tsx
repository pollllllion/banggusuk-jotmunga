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
      <div className="sidebar-title">둘러보기</div>
      <div className={`sidebar-item ${location.pathname === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
        <span className="e">{'\u{1F3E0}'}</span> 홈 피드
      </div>
      <div className={`sidebar-item ${isBrowse && !currentType ? 'active' : ''}`} onClick={() => navigate('/browse')}>
        <span className="e">{'\u{1F50D}'}</span> 작품 전체
      </div>
      <div className="sidebar-item" onClick={() => navigate('/browse?sort=top')}>
        <span className="e">{'\u{1F525}'}</span> 평점 높은순 <span className="hot-tag">TOP</span>
      </div>

      <div className="sidebar-divider" />
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
