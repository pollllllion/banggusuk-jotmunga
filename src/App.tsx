import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthGuard } from '@/guards/AuthGuard'
import { AdminGuard } from '@/guards/AdminGuard'
import { Toast } from '@/components/ui/Toast'
import { AuthPage } from '@/pages/AuthPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { BrowsePage } from '@/pages/BrowsePage'
import { DiscussionRoomPage } from '@/pages/DiscussionRoomPage'
import { WriteDiscussionPage } from '@/pages/WriteDiscussionPage'
import { DiscussionDetailPage } from '@/pages/DiscussionDetailPage'
import { BoardPage } from '@/pages/BoardPage'
import { ContentDetailPage } from '@/pages/ContentDetailPage'
import { MyReviewsPage } from '@/pages/MyReviewsPage'
import { MyFeedPage } from '@/pages/MyFeedPage'
import { RankingPage } from '@/pages/RankingPage'
import { UserProfilePage } from '@/pages/UserProfilePage'
import { BookmarksPage } from '@/pages/BookmarksPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AdminPage } from '@/pages/AdminPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

function AppInit({ children }: { children: React.ReactNode }) {
  const { init, initialized } = useAuthStore()

  useEffect(() => {
    init()
  }, [init])

  if (!initialized) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--subtext)', fontSize: 14 }}>
        로딩 중...
      </div>
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppInit>
          <Toast />
          <Routes>
            {/* 인증 불필요 */}
            <Route path="/auth" element={<AuthPage />} />

            {/* 인증 필요 — AppLayout 안에 렌더링 */}
            <Route element={<AuthGuard><AppLayout /></AuthGuard>}>
              <Route path="/" element={<CalendarPage />} />
              <Route path="/talk" element={<DiscussionRoomPage />} />
              <Route path="/talk/write" element={<WriteDiscussionPage />} />
              <Route path="/talk/:id" element={<DiscussionDetailPage />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route path="/board/:slug" element={<BoardPage />} />
              <Route path="/content/:id" element={<ContentDetailPage />} />
              {/* 리뷰는 토론글로 통합됨 — 옛 링크는 방구석토론방으로 보낸다 */}
              <Route path="/review/write" element={<Navigate to="/talk/write" replace />} />
              <Route path="/review/write/:contentId" element={<Navigate to="/talk/write" replace />} />
              <Route path="/review/*" element={<Navigate to="/talk" replace />} />
              <Route path="/my-reviews" element={<MyReviewsPage />} />
              <Route path="/feed" element={<MyFeedPage />} />
              <Route path="/ranking" element={<AdminGuard><RankingPage /></AdminGuard>} />
              <Route path="/u/:id" element={<UserProfilePage />} />
              <Route path="/bookmarks" element={<BookmarksPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminGuard><AdminPage /></AdminGuard>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppInit>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
