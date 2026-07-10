/**
 * Supabase 클라이언트 (연결 준비용 스캐폴딩)
 *
 * 현재 앱은 localStorage 기반 dataService로 동작합니다.
 * 실제 백엔드 전환 시 이 클라이언트를 통해 dataService의 각 함수를
 * Supabase 쿼리로 교체하면 됩니다.
 *
 * .env 파일에 아래 값을 채워야 활성화됩니다:
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** 환경변수가 설정되어 있을 때만 실제 클라이언트를 생성 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.info('[supabase] 환경변수 미설정 — 현재 localStorage 모드로 동작 중입니다. .env를 채우면 연결됩니다.')
}
