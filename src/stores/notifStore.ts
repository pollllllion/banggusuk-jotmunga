import { create } from 'zustand'
import * as DS from '@/api/dataService'
import type { Notification } from '@/types'

/** 자동 재조회 최소 간격 — 탭을 오갈 때마다 요청이 나가지 않게 */
const REFRESH_MIN_GAP_MS = 30_000

/**
 * 알림 상태.
 *
 * 2026-09-16 — 컴포넌트(NotificationPanel) 안에 있던 것을 store 로 꺼냈다.
 * 알림이 서랍(Sidebar) 안으로 들어가면서 **두 곳이 같은 값을 봐야** 하게 됐기 때문이다:
 *   · 헤더 햄버거의 빨간 숫자 — 서랍을 닫아 둔 채로도 알림이 왔는지 알아야 한다
 *   · 서랍 안의 알림 목록
 * 컴포넌트마다 제 상태를 들고 있으면 둘이 어긋나고, 서버 요청도 두 번 나간다.
 */
interface NotifState {
  notifs: Notification[]
  unread: number
  /** 마지막으로 서버에 물어본 시각 — 간격 제한용 */
  lastFetch: number
  /** 캐시 → 화면. 읽음 처리처럼 캐시만 바뀌는 경우에도 이걸로 다시 그린다 */
  sync: (userId: string | null | undefined) => void
  /** 서버에서 다시 받아온다. force 면 간격을 무시한다(사람이 열어 본 경우) */
  reload: (userId: string | null | undefined, isAccount: boolean, force?: boolean) => Promise<void>
  markRead: (id: string, userId: string) => void
  markAllRead: (userId: string) => void
}

export const useNotifStore = create<NotifState>((set, get) => ({
  notifs: [],
  unread: 0,
  lastFetch: 0,

  sync: (userId) => {
    const rows = userId ? DS.getUserNotifications(userId).slice(0, 30) : []
    set({ notifs: rows, unread: rows.filter(n => !n.read).length })
  },

  /**
   * 시작 로드는 앱이 뜨는 순간만 캐시를 채우므로, 탭을 켜 둔 채 온 알림은 이걸 불러야 보인다.
   * 유동닉은 RLS 상 자기 알림을 읽을 수 없어(auth.uid() 없음) 요청 자체를 보내지 않는다.
   */
  reload: async (userId, isAccount, force = false) => {
    if (!isAccount) { get().sync(userId); return }
    const now = Date.now()
    if (!force && now - get().lastFetch < REFRESH_MIN_GAP_MS) return
    set({ lastFetch: now })
    await DS.refreshNotifications()
    get().sync(userId)
  },

  markRead: (id, userId) => { DS.markRead(id); get().sync(userId) },
  markAllRead: (userId) => { DS.markAllRead(userId); get().sync(userId) },
}))
