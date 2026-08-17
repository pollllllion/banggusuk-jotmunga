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
  deleteAccount: () => Promise<AuthResult>
}

/**
 * 게스트(유동닉)의 role 을 신뢰하지 않는다.
 * users 테이블은 설계상 개방(누구나 수정)이라, 남이든 본인이든 브라우저에서
 * role='admin' 으로 바꿔 넣을 수 있다. 관리자 판정은 고정닉 계정(profiles)만.
 */
function asGuest(u: User): User {
  return u.role === 'admin' ? { ...u, role: 'user' } : u
}

/** 이 브라우저의 게스트(유동닉) 계정 확보 — 비로그인 시 사용 */
function ensureGuest(): User {
  const savedId = localStorage.getItem('bangjot_anon_id')
  let user = savedId ? DS.getUserById(savedId) : undefined
  if (!user) {
    user = DS.createUser({ nickname: '방문객' + Math.floor(1000 + Math.random() * 9000), role: 'user' })
    localStorage.setItem('bangjot_anon_id', user.id)
  }
  return asGuest(user)
}

/** 계정 로그인 시 출석 streak 을 집계하고, 갱신된 값을 유저에 반영한다.
 *  (profiles 마이그레이션 미적용 시 touchAttendance 가 null → 원본 그대로) */
async function withAttendance(account: User): Promise<User> {
  const att = await DS.touchAttendance(account.id)
  return att ? { ...account, streak: att.streak, visitDays: att.visitDays } : account
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
        // RLS 유저별 테이블(watched/bookmarks/…)을 인증 상태로 다시 로드
        await DS.reloadUserScoped()
        const user = await withAttendance(account)
        set({ user, isAccount: true, initialized: true })
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
    await DS.reloadUserScoped()
    const fresh = await withAttendance(account)
    set({ user: fresh, isAccount: true })
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
    await DS.reloadUserScoped()
    set({ user: account, isAccount: true })
    return { ok: true }
  },

  logout: async () => {
    await supabase.auth.signOut()
    const guest = ensureGuest()
    DS.setSession(guest)
    // 로그아웃 후엔 이전 계정의 유저별 캐시를 비운다(anon → 0행)
    await DS.reloadUserScoped()
    set({ user: guest, isAccount: false })
  },

  refresh: () => {
    const current = get().user
    if (!current) return
    const found = DS.getUserById(current.id)
    if (found) {
      const fresh = get().isAccount ? found : asGuest(found)
      DS.setSession(fresh); set({ user: fresh })
    }
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
    if (!current) return { ok: false, error: '로그인 상태가 아닙니다.' }

    if (get().isAccount) {
      // 계정(고정닉): 서버에서 게시물 익명화 + 개인정보·계정 삭제까지 처리한다.
      // 실패하면 로그아웃시키지 않는다 — 데이터가 남은 채로 나가면 탈퇴한 줄 알게 된다.
      const res = await DS.deleteMyAccount(current.id)
      if (!res.ok) return { ok: false, error: '탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요.' }
      await supabase.auth.signOut()
    } else {
      // 게스트(유동닉): 이 브라우저에 있는 임시 계정만 지운다
      DS.deleteUser(current.id)
      localStorage.removeItem('bangjot_anon_id')
    }

    // 게스트로 복귀
    const guest = ensureGuest()
    DS.setSession(guest)
    set({ user: guest, isAccount: false })
    return { ok: true }
  },
}))
