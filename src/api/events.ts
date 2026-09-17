/**
 * 회원 행동 기록(user_events)의 DB 쓰기 — migration_user_insight.sql.
 *
 * 무엇을·언제 남길지는 utils/analytics.ts 의 trackEvent 가 정한다. 여기는 넣기만 한다.
 * 캐시 대상이 아니다(쓰기 전용 표 — 클라이언트는 읽지 못한다). dataService 에서 다시 내보내지 않는
 * 이유: social.ts 가 trackEvent 를 부르므로 dataService → analytics → dataService 로 돌게 된다.
 */
import { supabase } from '@/lib/supabaseClient'

export function insertUserEvent(row: { uid: string; name: string; target: string | null; meta: Record<string, unknown> | null }): void {
  void supabase.from('user_events').insert(row).then(({ error }) => {
    // 마이그레이션 전이면 표가 없다 — 그때는 조용히 아무 일도 안 한 셈이 된다
    if (error && error.code !== '42P01') console.debug('[user_events]', error.message)
  })
}
