import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { ReportModal } from '@/components/report/ReportModal'

export function AppLayout() {
  return (
    <>
      <Header />
      <div className="layout">
        <Sidebar />
        <main className="main">
          <Outlet />
        </main>
      </div>
      <MobileNav />
      <ReportModal />
    </>
  )
}
