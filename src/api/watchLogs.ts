/**
 * 작품일지 — 시청 기록(일기).
 *
 * 시작 로드(cache.ts TABLES)에 넣지 않는다 — 메모가 길고, 남의 기록은 볼 일이 드물다.
 * 내 피드·프로필에 들어갈 때 그 사람 것만 받아 여기 담아 둔다.
 * RLS 가 남의 비공개 줄을 걸러 주므로 같은 질의로 내 것·남의 것을 다 받는다.
 */
import { supabase } from '@/lib/supabaseClient'
import type { WatchLog } from '@/types'
import { SaveFailedError } from './cache'

const byUser = new Map<string, WatchLog[]>()

const sortLogs = (list: WatchLog[]) =>
  [...list].sort((a, b) => a.watchedOn === b.watchedOn
    ? a.createdAt.localeCompare(b.createdAt)
    : a.watchedOn.localeCompare(b.watchedOn))

/** 캐시에 담긴 기록 — 아직 안 받았으면 undefined (빈 배열과 구분한다) */
export function getWatchLogs(userId: string): WatchLog[] | undefined {
  return byUser.get(userId)
}

/** 그 사람 기록을 받아 온다. 이미 받았으면 다시 안 간다(force 로 새로 받기) */
export async function loadWatchLogs(userId: string, force = false): Promise<WatchLog[]> {
  if (!force && byUser.has(userId)) return byUser.get(userId)!
  const { data, error } = await supabase
    .from('watch_logs').select('*')
    .eq('userId', userId)
    .order('watchedOn', { ascending: true })
  if (error) { console.error('[loadWatchLogs]', error.message); return byUser.get(userId) ?? [] }
  const list = sortLogs((data || []) as WatchLog[])
  byUser.set(userId, list)
  return list
}

/** 새로 쓰기·고치기 — 서버까지 가야 캐시에 반영한다(일기는 조용히 사라지면 안 된다) */
export async function saveWatchLog(log: WatchLog): Promise<WatchLog> {
  const row = { ...log, updatedAt: new Date().toISOString() }
  const { error } = await supabase.from('watch_logs').upsert(row, { onConflict: 'id' })
  if (error) { console.error('[saveWatchLog]', error.message); throw new SaveFailedError(error.message) }
  const list = (byUser.get(log.userId) ?? []).filter(l => l.id !== log.id)
  byUser.set(log.userId, sortLogs([...list, row]))
  return row
}

export async function deleteWatchLog(log: WatchLog): Promise<void> {
  const { error } = await supabase.from('watch_logs').delete().eq('id', log.id)
  if (error) { console.error('[deleteWatchLog]', error.message); throw new SaveFailedError(error.message) }
  byUser.set(log.userId, (byUser.get(log.userId) ?? []).filter(l => l.id !== log.id))
}
