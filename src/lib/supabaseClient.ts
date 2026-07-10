/**
 * Supabase 클라이언트
 *
 * 환경변수(.env / Netlify)가 있으면 그 값을, 없으면 아래 기본값을 사용합니다.
 * publishable 키는 브라우저 노출을 전제로 설계된 공개용 키라 코드에 있어도 안전합니다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_URL = 'https://ggswwptjbwvesjkowwsc.supabase.co'
const DEFAULT_ANON = 'sb_publishable_XRQiUZAforlq1XXAZytb0A_6CAkxx6t'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient = createClient(url, anonKey)
