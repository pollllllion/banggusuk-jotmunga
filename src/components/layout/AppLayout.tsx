import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType, useSearchParams } from 'react-router-dom'
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

/**
 * 화면마다 마지막 스크롤 위치. 주소가 아니라 **방문 하나**(location.key)를 키로 쓴다 —
 * 같은 목록을 두 번 들렀다면 각각 다른 자리에서 떠났을 수 있다.
 * 모듈 바깥에 두는 이유: 컴포넌트가 다시 마운트돼도 기억이 지워지면 안 된다.
 */
const scrollMemory = new Map<string, number>()
const MEMORY_MAX = 60

export function AppLayout() {
  const location = useLocation()
  const { pathname } = location
  const navType = useNavigationType()
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
   * 스크롤 자리 — 새 화면은 맨 위부터, 뒤로 가기는 떠났던 자리부터.
   *
   * 브라우저의 자동 복원(history.scrollRestoration = 'auto')은 SPA 에서 못 쓴다.
   * 복원이 새 화면을 그리기 **전에** 일어나서, 아직 짧은 화면에 옛 위치를 적용하고 끝난다.
   * 그래서 복원을 끄고 우리가 직접 한다 — 목록이 다 그려질 때까지 몇 프레임 쫓아가면서.
   *
   * 앞으로 갈 때 pathname 만 보는 이유: ?p=(쪽 번호)·?sub=(탭)·?search=(검색어) 는
   * 같은 화면 안의 변화다. 특히 검색은 글자마다 주소가 바뀌어, 같이 올리면 타이핑 중에 튄다.
   * 쪽 번호는 Pager 가 넘길 때 직접 맨 위로 올린다(usePageParam).
   */
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  // 지금 방문의 스크롤 위치를 계속 적어 둔다 (떠날 때 한 번 더)
  useEffect(() => {
    const key = location.key
    const remember = () => {
      if (scrollMemory.size >= MEMORY_MAX && !scrollMemory.has(key)) {
        // 가장 오래된 것부터 버린다 (Map 은 넣은 차례를 지킨다)
        const oldest = scrollMemory.keys().next().value
        if (oldest !== undefined) scrollMemory.delete(oldest)
      }
      scrollMemory.set(key, window.scrollY)
    }
    window.addEventListener('scroll', remember, { passive: true })
    return () => { window.removeEventListener('scroll', remember); remember() }
  }, [location.key])

  const lastPath = useRef(pathname)
  useEffect(() => {
    const saved = navType === 'POP' ? scrollMemory.get(location.key) : undefined
    if (saved != null) {
      // 목록이 아직 안 그려졌으면 문서가 짧아 그만큼 못 내려간다 — 몇 프레임 더 쫓아간다
      let tries = 0
      let raf = 0
      const chase = () => {
        window.scrollTo(0, saved)
        if (Math.abs(window.scrollY - saved) > 2 && tries++ < 20) raf = requestAnimationFrame(chase)
      }
      raf = requestAnimationFrame(chase)
      lastPath.current = pathname
      return () => cancelAnimationFrame(raf)
    }
    // 새로 들어간 화면만 맨 위로. 같은 화면 안의 주소 변화(검색어·쪽 번호)는 건드리지 않는다
    if (pathname !== lastPath.current) {
      lastPath.current = pathname
      window.scrollTo(0, 0)
    }
  }, [location.key, navType, pathname])

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
