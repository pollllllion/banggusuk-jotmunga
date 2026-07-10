import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { SearchIcon, PlusIcon, DocumentIcon, BookmarkIcon, SettingsIcon, ShieldIcon } from '@/components/ui/Icons'
import { NotificationPanel } from '@/components/notification/NotificationPanel'

export function Header() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { userMenuOpen, toggleUserMenu, closeUserMenu } = useUIStore()
  const [searchQuery, setSearchQuery] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeUserMenu()
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [closeUserMenu])

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/browse?search=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  if (!user) return null

  return (
    <header className="header">
      <div className="header-left">
        <a className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <div className="logo-icon">&#9889;</div>
          <span className="logo-text"><span>돌</span>직구</span>
        </a>
        <div className="search-bar">
          <SearchIcon />
          <input
            type="text"
            placeholder="작품 검색"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyUp={handleSearch}
          />
        </div>
      </div>
      <div className="header-right">
        <NotificationPanel />
        <button className="btn btn-primary btn-small" onClick={() => navigate('/review/write')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <PlusIcon /> 리뷰쓰기
        </button>
        <div className="user-menu" ref={menuRef}>
          <div className="user-avatar" onClick={toggleUserMenu}>{user.nickname[0]}</div>
          <div className={`user-dropdown ${userMenuOpen ? 'show' : ''}`}>
            <div className="user-dropdown-header">
              {user.nickname}
              <small>{user.email}</small>
            </div>
            <div className="user-dropdown-item" onClick={() => { closeUserMenu(); navigate('/my-reviews') }}>
              <DocumentIcon /> 내 리뷰
            </div>
            <div className="user-dropdown-item" onClick={() => { closeUserMenu(); navigate('/bookmarks') }}>
              <BookmarkIcon /> 찜한 작품
            </div>
            <div className="user-dropdown-item" onClick={() => { closeUserMenu(); navigate('/settings') }}>
              <SettingsIcon /> 계정 설정
            </div>
            {user.role === 'admin' && (
              <div className="user-dropdown-item" onClick={() => { closeUserMenu(); navigate('/admin') }} style={{ color: 'var(--primary)' }}>
                <ShieldIcon /> 관리자
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
