import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useNotifStore } from '@/stores/notifStore'
import { timeAgo } from '@/utils/helpers'
import { clickable } from '@/utils/a11y'

/**
 * 알림 목록 — 서랍(Sidebar) 안에서 펼쳐진다.
 *
 * 2026-09-16 — 헤더 오른쪽 종 아이콘의 드롭다운(NotificationPanel)이던 것을 옮겼다.
 * 이동 수단이 네 군데(햄버거·종·아바타·하단 탭)로 흩어져 "그게 어디 있더라"가 생겼고,
 * 왼쪽 햄버거 하나로 모으기로 했다. 상태는 store 에 있다 — 햄버거의 빨간 숫자와
 * 이 목록이 같은 값을 봐야 하기 때문이다(stores/notifStore.ts).
 *
 * 서버 재조회(visibilitychange·focus)는 여기가 아니라 **Sidebar** 가 건다.
 * 이 컴포넌트는 서랍을 펼쳤을 때만 그려지는데, 그러면 닫아 둔 동안 숫자가 안 는다.
 */
export function NotificationList({ onNavigate }: {
  /** 알림을 눌러 다른 화면으로 갈 때 — 서랍을 닫는다 */
  onNavigate?: () => void
}) {
  const navigate = useNavigate()
  const { user, isAccount } = useAuthStore()
  const { notifs, sync, reload, markRead, markAllRead } = useNotifStore()

  const uid = user?.id
  // 열 때는 간격을 무시하고 받아온다 — 확인하려고 누른 것이다
  const open = useCallback(() => { void reload(uid, isAccount, true) }, [uid, isAccount, reload])
  useEffect(() => { open() }, [open])

  const go = (notifId: string, reviewId: string, type: string) => {
    if (!uid) return
    markRead(notifId, uid)
    onNavigate?.()
    if (!reviewId) return
    // 관심 알림은 글이 아니라 **그 사람**을 가리킨다 (reviewId 에 상대 id 가 들어 있다)
    navigate(type === 'follow' ? `/u/${reviewId}` : `/talk/${reviewId}`)
  }

  return (
    <div className="notif-list">
      {notifs.length > 0 && (
        <div className="notif-list-head">
          <span>최근 알림</span>
          <button className="btn-text btn-small" onClick={() => uid && markAllRead(uid)}>모두 읽음</button>
        </div>
      )}
      {!notifs.length ? (
        <div className="notif-list-empty">
          {/* 유동닉은 알림을 받을 수 없다 — 빈 칸만 보여주면 안 오는 건지 없는 건지 알 수 없다 */}
          {isAccount ? '알림이 없습니다.' : '알림은 로그인(고정닉) 계정만 받을 수 있어요.'}
        </div>
      ) : (
        notifs.map(n => (
          <div key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`} {...clickable(() => go(n.id, n.reviewId, n.type))}>
            <div className="notif-msg">{n.message}</div>
            <div className="notif-time">{timeAgo(n.createdAt)}</div>
          </div>
        ))
      )}
      {/* 알림이 잦다고 느끼는 순간이 곧 여기다 — 끄러 가는 길을 그 자리에 둔다 */}
      <button
        className="notif-list-foot"
        onClick={() => { onNavigate?.(); navigate('/settings/notifications'); void sync(uid) }}>
        알림 설정 ›
      </button>
    </div>
  )
}
