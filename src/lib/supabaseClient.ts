/**
 * Supabase 클라이언트
 *
 * 환경변수(.env / Netlify)가 있으면 그 값을, 없으면 아래 기본값을 사용합니다.
 * publishable 키는 브라우저 노출을 전제로 설계된 공개용 키라 코드에 있어도 안전합니다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authStorage } from './authStorage'

const DEFAULT_URL = 'https://ggswwptjbwvesjkowwsc.supabase.co'
const DEFAULT_ANON = 'sb_publishable_XRQiUZAforlq1XXAZytb0A_6CAkxx6t'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON

export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * 자동 로그인은 여기서 정해진다.
 * 토큰을 보관하고(persistSession) 만료 전에 갱신하면(autoRefreshToken),
 * 브라우저를 껐다 켜도·폰을 며칠 뒤에 열어도 로그인 상태가 이어진다.
 * supabase-js 의 기본값과 같지만, 기본값이 바뀌면 조용히 로그아웃되는 종류의 변화라 명시한다.
 *
 * 어디에 보관할지는 로그인 화면의 "로그인 상태 유지" 체크가 정한다 → authStorage.
 *
 * storageKey 는 건드리지 않는다 — 바꾸는 순간 기존 토큰이 옛 키에 남아
 * 지금 로그인해 둔 사람이 전부 로그아웃된다.
 *
 * ⚠️ iOS Safari 에서 홈 화면에 추가하지 않고 탭으로만 쓰면, 7일간 방문이 없을 때
 * 브라우저(ITP)가 localStorage 를 비워서 로그아웃된다. 앱으로 설치하면 유지된다.
 */
export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage,
  },
})
