import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import type { ReactNode } from 'react'

export function AdminGuard({ children }: { children: ReactNode }) {
  const { user, isAccount } = useAuthStore()
  // 고정닉 계정(profiles)만 관리자가 될 수 있다. 게스트(users)의 role 은 신뢰하지 않는다.
  if (!user || !isAccount || user.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}
