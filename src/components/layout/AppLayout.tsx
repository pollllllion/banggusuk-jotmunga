import { useEffect } from 'react'
import { Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { Footer } from './Footer'
import { ReportModal } from '@/components/report/ReportModal'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { useUIStore } from '@/stores/uiStore'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useAuthStore } from '@/stores/authStore'
import { trackPageView } from '@/utils/analytics'

export function AppLayout() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const { navDrawerOpen, closeNavDrawer } = useUIStore()
  // 유동닉은 남기지 않는다 — 통계에 필요한 건 '회원이 얼마나 오나' 뿐이다
  const uid = useAuthStore(s => (s.isAccount ? s.user?.id ?? null : null))

  /**
   * 방문 기록. 여기 한 곳에만 두면 새 화면을 만들어도 빠지지 않는다.
   * 경로만 남기고 쿼리스트링은 버린다 — 다만 사이트 검색어(?search=)는 따로 담는다.
   */
  const search = searchParams.get('search')
  useEffect(() => {
    trackPageView(pathname, { q: pathname === '/browse' ? search : null, uid })
  }, [pathname, search, uid])

  // 서랍이 열린 채 다른 경로로 가면(뒤로가기 포함) 남지 않게
  useEffect(() => { closeNavDrawer() }, [pathname, closeNavDrawer])

  // 배경을 눌러 닫는 건 마우스만의 방법이다 — 키보드에는 Esc 를 준다
  useEscapeKey(navDrawerOpen, closeNavDrawer)

  // 서랍이 열려 있는 동안 뒤쪽 본문 스크롤 잠금
  useEffect(() => {
    if (!navDrawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [navDrawerOpen])

  return (
    <>
      <Header />
      <div className="layout">
        <Sidebar />
        {navDrawerOpen && <div className="nav-scrim" onClick={closeNavDrawer} />}
        <main className="main">
          <Outlet />
          <Footer />
        </main>
      </div>
      <MobileNav />
      <InstallPrompt />
      <ReportModal />
    </>
  )
}
