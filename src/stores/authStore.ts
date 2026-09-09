import { create } from 'zustand'
import type { User } from '@/types'
import * as DS from '@/api/dataService'
import { supabase } from '@/lib/supabaseClient'
import { setRemember } from '@/lib/authStorage'
import { readGuest, writeGuest, readLegacyGuestId, makeGuest, clearGuest, type GuestIdentity } from '@/lib/guestIdentity'
import { markContentsComplete } from '@/stores/dataStore'

interface AuthResult { ok: boolean; error?: string; needsConfirm?: boolean }

interface AuthState {
  user: User | null
  initialized: boolean
  /** 로그인 계정(고정닉)이면 true, 게스트(유동닉)면 false */
  isAccount: boolean

  init: () => Promise<void>
  login: (email: string, password: string, remember?: boolean) => Promise<AuthResult>
  register: (data: { nickname: string; email: string; password: string }) => Promise<AuthResult>
  logout: () => Promise<void>
  refresh: () => void
  updateProfile: (updates: Partial<User>) => Promise<void>
  deleteAccount: () => Promise<AuthResult>
}

/**
 * 게스트(유동닉)의 role 을 신뢰하지 않는다.
 * 유동닉 신원은 브라우저(localStorage)에 있어서 본인이 role='admin' 으로 고쳐 넣을 수 있고,
 * 레거시 users 행도 한때 누구나 고칠 수 있었다. 관리자 판정은 고정닉 계정(profiles)만.
 */
function asGuest(u: User): User {
  return u.role === 'admin' ? { ...u, role: 'user' } : u
}

/**
 * 이 브라우저의 게스트(유동닉) 신원 확보 — 비로그인 시 사용.
 *
 * **DB 에 행을 만들지 않는다.** 예전엔 방문자마다 users 행을 하나씩 넣어서
 * 5,971행이 쌓였는데 실제로 글·댓글이 참조하는 건 1행뿐이었다(guestIdentity.ts 참고).
 * 옛 키(bangjot_anon_id)를 쓰던 게스트는 **그 id 를 그대로 이어받아** 옛 글과의
 * 연결을 끊지 않는다. 그 시절 users 행이 남아 있으면 닉네임도 거기서 가져온다.
 */
function ensureGuest(): User {
  let g: GuestIdentity | null = readGuest()
  if (!g) {
    const legacyId = readLegacyGuestId()
    g = makeGuest(legacyId || undefined)
    // 옛 users 행이 아직 읽히면 그때 쓰던 닉네임을 살린다(새 닉으로 갈아치우지 않게)
    const legacyRow = legacyId ? DS.getUserById(legacyId) : undefined
    if (legacyRow?.nickname) g = { ...g, nickname: legacyRow.nickname, createdAt: legacyRow.createdAt || g.createdAt }
    writeGuest(g)
  }
  return asGuest({ id: g.id, nickname: g.nickname, email: '', role: 'user', banned: false, createdAt: g.createdAt } as User)
}

/**
 * 로그인 상태 복구 구독 — 자동 로그인의 나머지 절반.
 *
 * init 은 앱이 뜨는 그 한 순간만 본다. 그런데 폰에서 앱을 며칠 만에 열면
 * 저장된 토큰이 만료돼 있어 getSession 이 잠깐 빈손으로 돌아오고(네트워크가 아직
 * 안 붙었을 때도 마찬가지), 그 사이 화면은 게스트로 내려간다. 조금 뒤 토큰 갱신이
 * 성공해도 아무도 그 사실을 화면에 반영하지 않아 로그아웃된 것처럼 남는다.
 * 그래서 갱신·로그인·로그아웃을 계속 듣고 그때그때 상태를 맞춘다.
 *
 * 다른 탭에서 로그아웃한 경우도 여기로 들어온다.
 */
let authSubscribed = false

function subscribeAuthChanges(set: (s: Partial<AuthState>) => void, get: () => AuthState) {
  if (authSubscribed) return
  authSubscribed = true

  supabase.auth.onAuthStateChange((event, session) => {
    // INITIAL_SESSION 은 init 이 직접 처리한다(중복 처리 방지).
    if (event === 'INITIAL_SESSION') return

    // 콜백 안에서 supabase 를 다시 부르면 교착이 생길 수 있다 — 밖으로 빼서 실행한다.
    setTimeout(async () => {
      try {
        if (event === 'SIGNED_OUT' || !session?.user) {
          if (!get().isAccount) return
          const guest = ensureGuest()
          DS.setSession(guest)
          await DS.reloadUserScoped()
          set({ user: guest, isAccount: false })
          return
        }
        // 이미 같은 계정으로 붙어 있으면 굳이 다시 그리지 않는다(토큰만 갱신된 경우).
        if (get().isAccount && get().user?.id === session.user.id) return

        const account = await DS.ensureProfile(session.user)
        if (account.banned) { await supabase.auth.signOut(); return }
        DS.setSession(account)
        await DS.reloadUserScoped()
        set({ user: await withAttendance(account), isAccount: true })
      } catch (e) {
        console.error('[auth] 상태 변경 처리 실패:', e)
      }
    }, 0)
  })
}

/**
 * 2단계 — 작품 전체를 백그라운드로 받는다. 화면을 막지 않는다.
 * 끝나면 dataStore 를 통해 화면들에게 알린다(딥링크가 "없는 작품"으로 튕기지 않게).
 * 한 번만 돈다 — init 이 다시 불려도(HMR 등) 두 번 받지 않는다.
 */
let bgStarted = false
function startBackgroundLoad() {
  if (bgStarted) return
  bgStarted = true
  void DS.loadRest()
    .then(markContentsComplete)
    .catch(e => console.error('[loadRest]', e))
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
      // 구독을 로드보다 먼저 걸면, 아직 캐시가 비어 있는 사이에 SIGNED_IN·
      // TOKEN_REFRESHED 가 도착해 ensureProfile 이 "없는 계정"으로 판단한다.
      // 그래서 로드가 끝난 뒤에 건다. (ensureProfile 자체도 DB 를 다시 확인하지만,
      //  애초에 그 경합을 만들지 않는 게 맞다)
      //
      // ⚠️ 여기서 기다리는 건 **1단계뿐**이다. 작품 전체(1,875KB)를 기다리면
      //    그만큼 흰 화면이 길어진다 — 나머지는 화면을 띄운 뒤 백그라운드로 받는다.
      await DS.loadEssential()
      startBackgroundLoad()
      subscribeAuthChanges(set, get)
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

  login: async (email, password, remember = true) => {
    // 토큰을 어디에 저장할지가 이 한 줄로 갈린다 — 반드시 로그인 요청 전에 정해야
    // 새 토큰이 의도한 저장소로 들어간다.
    setRemember(remember)
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
    // 유동닉은 DB 에 행이 없다 — 이 브라우저의 신원만 고친다
    else writeGuest({ id: current.id, nickname: updates.nickname ?? current.nickname, createdAt: current.createdAt })
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
      // 게스트(유동닉): 이 브라우저의 신원만 지운다. 옛 글·댓글의 작성자 표시는
      // 여기서 함께 지운다(users 행 자체는 읽기 전용이라 남는다 — 관리자만 정리 가능).
      DS.anonymizeGuestPosts(current.id)
      clearGuest()
    }

    // 게스트로 복귀
    const guest = ensureGuest()
    DS.setSession(guest)
    set({ user: guest, isAccount: false })
    return { ok: true }
  },
}))
