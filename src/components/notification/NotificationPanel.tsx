import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellIcon } from '@/components/ui/Icons'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { timeAgo } from '@/utils/helpers'
import type { Notification } from '@/types'

/** 자동 재조회 최소 간격 — 탭을 오갈 때마다 요청이 나가지 않게 */
const REFRESH_MIN_GAP_MS = 30_000

export function NotificationPanel() {
  const navigate = useNavigate()
  const { user, isAccount } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const lastFetch = useRef(0)

  /** 캐시 → 화면. 읽음 처리처럼 캐시만 바뀌는 경우에도 이걸로 다시 그린다. */
  const sync = useCallback(() => {
    setNotifs(user ? DS.getUserNotifications(user.id).slice(0, 30) : [])
  }, [user])

  /**
   * 서버에서 다시 받아온다.
   * 시작 로드는 앱이 뜨는 순간만 캐시를 채우므로, 탭을 켜 둔 채 온 알림은 이걸 불러야 보인다.
   * 유동닉은 RLS 상 자기 알림을 읽을 수 없어(auth.uid() 없음) 요청 자체를 보내지 않는다.
   */
  const reload = useCallback(async (force = false) => {
    if (!isAccount) { sync(); return }
    const now = Date.now()
    if (!force && now - lastFetch.current < REFRESH_MIN_GAP_MS) return
    lastFetch.current = now
    await DS.refreshNotifications()
    sync()
  }, [isAccount, sync])

  // 첫 표시 + 계정이 바뀔 때
  useEffect(() => { void reload(true) }, [reload])

  // 탭으로 돌아오면 확인 (폰에서 앱을 다시 열었을 때가 이 경로다)
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void reload() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const unreadCount = notifs.filter(n => !n.read).length

  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    if (next) void reload(true)   // 열 때는 간격 무시 — 확인하려고 누른 것이다
  }

  const handleClick = (notifId: string, reviewId: string) => {
    DS.markRead(notifId)
    setOpen(false)
    sync()
    if (reviewId) navigate(`/talk/${reviewId}`)
  }

  const handleMarkAll = () => {
    if (!user) return
    DS.markAllRead(user.id)
    sync()
  }

  return (
    <div className="notif-menu" ref={ref}>
      <button className="notif-btn" onClick={toggleOpen} aria-label="알림">
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-header">
            <span>알림</span>
            <button className="btn btn-text btn-small" onClick={handleMarkAll}>모두 읽음</button>
          </div>
          <div>
            {!notifs.length ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--subtext)', fontSize: 13 }}>
                {/* 유동닉은 알림을 받을 수 없다 — 빈 종만 보여주면 안 오는 건지 없는 건지 알 수 없다 */}
                {isAccount ? '알림이 없습니다.' : '알림은 로그인(고정닉) 계정만 받을 수 있어요.'}
              </div>
            ) : (
              notifs.map(n => (
                <div key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => handleClick(n.id, n.reviewId)}>
                  <div className="notif-msg">{n.message}</div>
                  <div className="notif-time">{timeAgo(n.createdAt)}</div>
                </div>
              ))
            )}
          </div>
          {/* 알림이 잦다고 느끼는 순간이 곧 여기다 — 끄러 가는 길을 그 자리에 둔다 */}
          <button
            className="notif-panel-foot"
            onClick={() => { setOpen(false); navigate('/settings/notifications') }}>
            알림 설정
          </button>
        </div>
      )}
    </div>
  )
}
