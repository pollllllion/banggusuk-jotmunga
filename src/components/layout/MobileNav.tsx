import { useNavigate, useLocation } from 'react-router-dom'
import { CalendarIcon, CommentIcon, GridIcon, PlusIcon, UserIcon } from '@/components/ui/Icons'

/**
 * 모바일 하단 탭. 사이드바가 숨겨지는 폭에서 유일한 이동 수단이라
 * 사이드바 게시판(캘린더·방구석토론방)이 여기서도 반드시 보여야 한다.
 * 나머지 메뉴(릴레이제작소 등)는 헤더 햄버거 → 서랍으로 간다.
 */
export function MobileNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // /talk/write 는 가운데 글쓰기 버튼이 맡으므로 토론방 탭을 켜지 않는다
  const talkActive = pathname.startsWith('/talk') && pathname !== '/talk/write'

  return (
    <nav className="mobile-nav">
      <div className={`mobile-nav-item ${pathname === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
        <CalendarIcon />캘린더
      </div>
      <div className={`mobile-nav-item ${talkActive ? 'active' : ''}`} onClick={() => navigate('/talk')}>
        <CommentIcon size={20} />토론방
      </div>
      <button className="mobile-nav-write" onClick={() => navigate('/talk/write')} aria-label="토론글 쓰기">
        <PlusIcon size={22} />
      </button>
      <div className={`mobile-nav-item ${pathname === '/browse' ? 'active' : ''}`} onClick={() => navigate('/browse')}>
        <GridIcon />작품
      </div>
      <div className={`mobile-nav-item ${pathname === '/feed' ? 'active' : ''}`} onClick={() => navigate('/feed')}>
        <UserIcon />내 피드
      </div>
    </nav>
  )
}
