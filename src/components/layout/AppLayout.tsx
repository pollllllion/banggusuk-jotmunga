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

  /**
   * 화면을 옮기면 언제나 맨 위부터 보여준다.
   *
   * 브라우저는 기본으로 '이 주소에서 아까 어디까지 내렸더라'를 기억했다가 되돌려 놓는데
   * (history.scrollRestoration = 'auto'), SPA 에서는 그 복원이 새 화면을 그리기 전에
   * 일어난다. 아직 짧은 화면에 옛 위치를 적용하니 자리가 매번 달라지고, 결국 사람이
   * 손으로 다시 올려야 했다. 복원을 끄고 우리가 직접 맨 위로 올린다.
   *
   * pathname 만 본다 — ?p=(쪽 번호)·?sub=(탭)·?search=(검색어) 는 같은 화면 안의 변화다.
   * 특히 검색은 글자마다 주소가 바뀌므로 여기서 같이 올리면 타이핑 중에 화면이 튄다.
   * 쪽 번호는 Pager 가 넘길 때 직접 맨 위로 올린다(usePageParam).
   */
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

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
