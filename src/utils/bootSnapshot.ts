/**
 * 부팅 스냅샷 — 다시 온 사람에게 '로딩 중' 없이 첫 화면을 바로 그리기 위한 사본.
 *
 * 1단계 로드(cache.ts loadEssential)가 끝날 때 localStorage 에 떠 두고, 다음 방문에
 * 그걸로 먼저 그린 뒤 진짜 데이터가 오면 갈아끼운다(보통 1초 안).
 *
 * 여기는 "이 사본을 믿고 그려도 되나"만 판정한다. 틀리게 통과시키면 빈 달력이나
 * 없는 작품 화면이 뜨므로, 조금이라도 안 맞으면 예전 방식(다 받을 때까지 대기)으로 돌린다.
 * (cache.ts 는 supabase 를 import 해서 테스트에서 못 부른다 — 판정만 따로 뺐다)
 */

/** 저장 형태를 바꾸면 올린다. 옛 사본은 그냥 버려진다 */
export const BOOT_SNAPSHOT_VERSION = 1

/** 너무 오래된 사본은 쓰지 않는다 — 갈아끼우기 전 잠깐이라도 한참 전 화면이 보이면 어색하다 */
export const BOOT_SNAPSHOT_MAX_AGE = 7 * 24 * 60 * 60 * 1000

export interface BootSnapshot {
  v: number
  /** 저장 시각(ms) */
  at: number
  /** 받아 둔 작품의 공개일 범위 — 1단계의 windowRange */
  from: string
  to: string
  tables: Record<string, unknown[]>
}

export function isSnapshotUsable(
  snap: unknown,
  want: { now: number; from: string; to: string; contentId: string | null },
): snap is BootSnapshot {
  if (!snap || typeof snap !== 'object') return false
  const s = snap as Partial<BootSnapshot>
  if (s.v !== BOOT_SNAPSHOT_VERSION) return false
  if (typeof s.at !== 'number') return false
  const age = want.now - s.at
  if (age < 0 || age > BOOT_SNAPSHOT_MAX_AGE) return false
  // 달이 바뀌었거나 ?ym= 으로 다른 달을 보러 왔으면 그 달 작품이 사본에 없다
  if (s.from !== want.from || s.to !== want.to) return false
  if (!s.tables || typeof s.tables !== 'object') return false
  const contents = s.tables.contents
  if (!Array.isArray(contents)) return false
  // 작품 딥링크인데 그 작품이 사본에 없으면 '불러오는 중'이 한 번 더 뜬다 — 기다리는 쪽이 낫다
  if (want.contentId && !contents.some(c => (c as { id?: unknown })?.id === want.contentId)) return false
  return true
}
