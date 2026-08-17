import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { ReportModal } from '@/components/report/ReportModal'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { useUIStore } from '@/stores/uiStore'

export function AppLayout() {
  const { pathname } = useLocation()
  const { navDrawerOpen, closeNavDrawer } = useUIStore()

  // 서랍이 열린 채 다른 경로로 가면(뒤로가기 포함) 남지 않게
  useEffect(() => { closeNavDrawer() }, [pathname, closeNavDrawer])

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
        </main>
      </div>
      <MobileNav />
      <InstallPrompt />
      <ReportModal />
    </>
  )
}
