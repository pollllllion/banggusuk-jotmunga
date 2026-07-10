import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import type { ReactNode } from 'react'

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, initialized } = useAuthStore()

  if (!initialized) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--subtext)' }}>로딩 중...</div>
  if (!user) return <Navigate to="/auth" replace />

  return <>{children}</>
}
