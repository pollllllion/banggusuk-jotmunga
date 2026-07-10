import { create } from 'zustand'
import type { User } from '@/types'
import * as DS from '@/api/dataService'

interface AuthState {
  user: User | null
  initialized: boolean

  init: () => Promise<void>
  login: (email: string, password: string) => { ok: boolean; error?: string }
  register: (data: { nickname: string; email: string; password: string }) => User
  logout: () => void
  refresh: () => void
  updateProfile: (updates: Partial<User>) => void
  deleteAccount: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  initialized: false,

  init: async () => {
    try {
      // Supabase에서 전체 데이터 로드 (모두 공유)
      await DS.loadAll()
      // 로그인창 없이, 이 브라우저 전용 익명 사용자 확보 (localStorage에 id 유지)
      const savedId = localStorage.getItem('bangjot_anon_id')
      let user = savedId ? DS.getUserById(savedId) : undefined
      if (!user) {
        user = DS.createUser({ nickname: '방문객' + Math.floor(1000 + Math.random() * 9000), role: 'user' })
        localStorage.setItem('bangjot_anon_id', user.id)
      }
      DS.setSession(user)
      set({ user, initialized: true })
      return
    } catch (e) {
      console.error('Init failed:', e)
    }
    set({ user: null, initialized: true })
  },

  login: (email, password) => {
    const user = DS.findUserByEmail(email)
    if (!user || user.password !== password) return { ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
    if (user.banned) return { ok: false, error: '정지된 계정입니다. 관리자에게 문의하세요.' }
    DS.setSession(user)
    set({ user })
    return { ok: true }
  },

  register: (data) => {
    const user = DS.createUser({ ...data })
    DS.setSession(user)
    set({ user })
    return user
  },

  logout: () => {
    DS.setSession(null)
    set({ user: null })
  },

  refresh: () => {
    const current = get().user
    if (!current) return
    const fresh = DS.getUserById(current.id)
    if (fresh) {
      DS.setSession(fresh)
      set({ user: fresh })
    }
  },

  updateProfile: (updates) => {
    const current = get().user
    if (!current) return
    DS.updateUser(current.id, updates)
    DS.refreshSession()
    const fresh = DS.getUserById(current.id)
    if (fresh) set({ user: fresh })
  },

  deleteAccount: () => {
    const current = get().user
    if (!current) return
    DS.deleteUser(current.id)
    DS.setSession(null)
    set({ user: null })
  },
}))
