import { create } from 'zustand'
import type { User } from '@/types'
import * as DS from '@/api/dataService'
import { supabase } from '@/lib/supabaseClient'

interface AuthResult { ok: boolean; error?: string; needsConfirm?: boolean }

interface AuthState {
  user: User | null
  initialized: boolean
  /** 로그인 계정(고정닉)이면 true, 게스트(유동닉)면 false */
  isAccount: boolean

  init: () => Promise<void>
  login: (email: string, password: string) => Promise<AuthResult>
  register: (data: { nickname: string; email: string; password: string }) => Promise<AuthResult>
  logout: () => Promise<void>
  refresh: () => void
  updateProfile: (updates: Partial<User>) => Promise<void>
  deleteAccount: () => Promise<void>
}

/** 이 브라우저의 게스트(유동닉) 계정 확보 — 비로그인 시 사용 */
function ensureGuest(): User {
  const savedId = localStorage.getItem('bangjot_anon_id')
  let user = savedId ? DS.getUserById(savedId) : undefined
  if (!user) {
    user = DS.createUser({ nickname: '방문객' + Math.floor(1000 + Math.random() * 9000), role: 'user' })
    localStorage.setItem('bangjot_anon_id', user.id)
  }
  return user
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  initialized: false,
  isAccount: false,

  init: async () => {
    try {
      await DS.loadAll()
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        // 로그인 계정(고정닉)
        const account = await DS.ensureProfile(session.user)
        DS.setSession(account)
        set({ user: account, isAccount: true, initialized: true })
        return
      }
      // 비로그인 = 게스트(유동닉)
      const guest = ensureGuest()
      DS.setSession(guest)
      set({ user: guest, isAccount: false, initialized: true })
      return
    } catch (e) {
      console.error('Init failed:', e)
    }
    set({ user: null, initialized: true })
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) return { ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
    const account = await DS.ensureProfile(data.user)
    if (account.banned) { await supabase.auth.signOut(); return { ok: false, error: '정지된 계정입니다. 관리자에게 문의하세요.' } }
    DS.setSession(account)
    set({ user: account, isAccount: true })
    return { ok: true }
  },

  register: async ({ nickname, email, password }) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      const msg = /already registered|already been registered/i.test(error.message)
        ? '이미 가입된 이메일입니다.' : error.message
      return { ok: false, error: msg }
    }
    if (!data.session || !data.user) {
      // 이메일 확인이 켜져 있는 경우
      return { ok: true, needsConfirm: true }
    }
    const account = await DS.ensureProfile(data.user, nickname.trim())
    DS.setSession(account)
    set({ user: account, isAccount: true })
    return { ok: true }
  },

  logout: async () => {
    await supabase.auth.signOut()
    const guest = ensureGuest()
    DS.setSession(guest)
    set({ user: guest, isAccount: false })
  },

  refresh: () => {
    const current = get().user
    if (!current) return
    const fresh = DS.getUserById(current.id)
    if (fresh) { DS.setSession(fresh); set({ user: fresh }) }
  },

  updateProfile: async (updates) => {
    const current = get().user
    if (!current) return
    if (get().isAccount) await DS.updateProfileRow(current.id, updates)
    else DS.updateUser(current.id, updates)
    const fresh = { ...current, ...updates }
    DS.setSession(fresh)
    set({ user: fresh })
  },

  deleteAccount: async () => {
    const current = get().user
    if (!current) return
    // 작성 콘텐츠 익명 처리
    DS.getReviews().filter(r => r.authorId === current.id).forEach(r => DS.updateReview(r.id, { authorId: 'deleted' }))
    if (get().isAccount) await supabase.auth.signOut()
    else DS.deleteUser(current.id)
    // 게스트로 복귀
    const guest = ensureGuest()
    DS.setSession(guest)
    set({ user: guest, isAccount: false })
  },
}))
