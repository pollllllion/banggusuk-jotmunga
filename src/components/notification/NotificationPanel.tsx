import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellIcon } from '@/components/ui/Icons'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { timeAgo } from '@/utils/helpers'

export function NotificationPanel() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [, setTick] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = user ? DS.getUnreadCount(user.id) : 0
  const notifs = user ? DS.getUserNotifications(user.id).slice(0, 30) : []

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const handleClick = (notifId: string, reviewId: string) => {
    DS.markRead(notifId)
    setOpen(false)
    setTick(t => t + 1)
    if (reviewId) navigate(`/talk/${reviewId}`)
  }

  const handleMarkAll = () => {
    if (user) { DS.markAllRead(user.id); setTick(t => t + 1) }
  }

  return (
    <div className="notif-menu" ref={ref}>
      <button className="notif-btn" onClick={() => setOpen(!open)}>
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
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--subtext)', fontSize: 13 }}>알림이 없습니다.</div>
            ) : (
              notifs.map(n => (
                <div key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => handleClick(n.id, n.reviewId)}>
                  <div className="notif-msg">{n.message}</div>
                  <div className="notif-time">{timeAgo(n.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
