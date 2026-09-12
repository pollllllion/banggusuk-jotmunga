import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthGuard } from '@/guards/AuthGuard'
import { AdminGuard } from '@/guards/AdminGuard'
import { Toast } from '@/components/ui/Toast'

/**
 * 첫 화면(캘린더)과 그 바로 옆 화면만 메인 번들에 둔다.
 *
 * 예전엔 라우트 전부가 한 덩어리(714KB · gzip 205KB)로 묶여서, 캘린더만 보러 온
 * 사람도 관리자 대시보드·큐레이션 편집기·글쓰기 에디터를 다 받고 파싱해야 화면이 떴다.
 * 아래처럼 쪼개면 메인이 **315KB(gzip 98KB)** 로 절반이 된다(실측).
 *
 * 다운로드보다 **파싱·컴파일**이 더 크게 줄어든다 — 그건 압축 전 크기에 비례하고,
 * 저가 안드로이드에서 특히 아프다.
 */
import { CalendarPage } from '@/pages/CalendarPage'
import { BrowsePage } from '@/pages/BrowsePage'
import { DiscussionRoomPage } from '@/pages/DiscussionRoomPage'
import { DiscussionDetailPage } from '@/pages/DiscussionDetailPage'
import { ContentDetailPage } from '@/pages/ContentDetailPage'

// 아래는 눌러야 들어가는 화면 — 그때 받는다
const AuthPage = lazy(() => import('@/pages/AuthPage').then(m => ({ default: m.AuthPage })))
const WriteDiscussionPage = lazy(() => import('@/pages/WriteDiscussionPage').then(m => ({ default: m.WriteDiscussionPage })))
const BoardPage = lazy(() => import('@/pages/BoardPage').then(m => ({ default: m.BoardPage })))
const FollowFeedPage = lazy(() => import('@/pages/FollowFeedPage').then(m => ({ default: m.FollowFeedPage })))
const MyPage = lazy(() => import('@/pages/MyPage').then(m => ({ default: m.MyPage })))
const MyFeedPage = lazy(() => import('@/pages/MyFeedPage').then(m => ({ default: m.MyFeedPage })))
const RankingPage = lazy(() => import('@/pages/RankingPage').then(m => ({ default: m.RankingPage })))
const UserProfilePage = lazy(() => import('@/pages/UserProfilePage').then(m => ({ default: m.UserProfilePage })))
const BookmarksPage = lazy(() => import('@/pages/BookmarksPage').then(m => ({ default: m.BookmarksPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const NotificationSettingsPage = lazy(() => import('@/pages/NotificationSettingsPage').then(m => ({ default: m.NotificationSettingsPage })))
const AdminPage = lazy(() => import('@/pages/AdminPage').then(m => ({ default: m.AdminPage })))
const CurationListPage = lazy(() => import('@/pages/CurationListPage').then(m => ({ default: m.CurationListPage })))
const CurationDetailPage = lazy(() => import('@/pages/CurationDetailPage').then(m => ({ default: m.CurationDetailPage })))
const AboutPage = lazy(() => import('@/pages/StaticPages').then(m => ({ default: m.AboutPage })))
const TermsPage = lazy(() => import('@/pages/StaticPages').then(m => ({ default: m.TermsPage })))
const PrivacyPage = lazy(() => import('@/pages/StaticPages').then(m => ({ default: m.PrivacyPage })))
const AdsPage = lazy(() => import('@/pages/StaticPages').then(m => ({ default: m.AdsPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

/** 라우트 청크를 받아오는 동안 잠깐 뜨는 자리 — 앱 초기 로딩과 같은 모양으로 둔다 */
function RouteFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: 'var(--subtext)', fontSize: 14 }}>
      불러오는 중...
    </div>
  )
}

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
          <Suspense fallback={<RouteFallback />}>
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
                <Route path="/curation" element={<CurationListPage />} />
                <Route path="/curation/:id" element={<CurationDetailPage />} />
                <Route path="/board/:slug" element={<BoardPage />} />
                <Route path="/content/:id" element={<ContentDetailPage />} />
                {/* 리뷰는 토론글로 통합됨 — 옛 링크는 토론방으로 보낸다 */}
                <Route path="/review/write" element={<Navigate to="/talk/write" replace />} />
                <Route path="/review/write/:contentId" element={<Navigate to="/talk/write" replace />} />
                <Route path="/review/*" element={<Navigate to="/talk" replace />} />
                <Route path="/me" element={<MyPage />} />
                {/* 옛 주소 — 메뉴의 '내 토론글' 이 '내 정보' 로 바뀌었다. 북마크·옛 링크를 살려 둔다 */}
                <Route path="/my-reviews" element={<Navigate to="/me" replace />} />
                <Route path="/feed" element={<MyFeedPage />} />
                <Route path="/follows" element={<FollowFeedPage />} />
                <Route path="/ranking" element={<AdminGuard><RankingPage /></AdminGuard>} />
                <Route path="/u/:id" element={<UserProfilePage />} />
                <Route path="/bookmarks" element={<BookmarksPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/notifications" element={<NotificationSettingsPage />} />
                {/* 안내 문서 (푸터에서 진입) */}
                <Route path="/about" element={<AboutPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/ads" element={<AdsPage />} />
                <Route path="/admin" element={<AdminGuard><AdminPage /></AdminGuard>} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AppInit>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
