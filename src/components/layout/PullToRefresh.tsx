import { useEffect, useRef, useState } from 'react'
import * as DS from '@/api/dataService'
import { useAuthStore } from '@/stores/authStore'
import { markDataRefreshed } from '@/stores/dataStore'

/** 이만큼 끌어내리면 놓았을 때 새로 고친다 (표시기가 움직인 거리 기준 · px) */
const TRIGGER = 64
/** 표시기가 내려오는 한계 */
const MAX_PULL = 96
/** 손가락이 움직인 거리의 절반만 따라온다 — 당기는 데 저항이 느껴져야 실수로 안 걸린다 */
const RESISTANCE = 0.5
/** 너무 빨리 끝나면 '된 건가?' 싶다 — 돌아가는 모습을 최소 이만큼은 보여준다 */
const MIN_SPIN_MS = 500

/** 이 안에서 시작한 터치는 무시한다 — 모달·시트·서랍은 자기 스크롤이 있다 */
const IGNORE = '.modal-overlay, .sheet-overlay, .sidebar, .nav-scrim, .disc-menu, textarea, input, [contenteditable="true"]'

/**
 * 당겨서 새로 고침 (좁은 화면·터치 전용).
 *
 * 앱(홈 화면)으로 열면 주소창도 새로 고침 버튼도 없다 — 새 글을 보려면 앱을 껐다 켜야 했다.
 *
 * location.reload() 가 아니라 **데이터만 다시 받는다**(loadEssential → dataVersion 신호).
 * 화면이 하얗게 비지 않고, 쓰던 댓글·스크롤·열어 둔 탭이 그대로 남는다.
 * 작품 전체(2단계 · 300KB↑)는 다시 받지 않는다 — 당길 때 보고 싶은 건 새 글·댓글·알림이다.
 *
 * 브라우저 자체의 당겨서 새로 고침(안드로이드 크롬)과 겹치지 않게 global.css 에서
 * overscroll-behavior-y: contain 을 준다.
 */
export function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  // 터치 핸들러는 한 번만 건다 — 최신 값을 ref 로 읽는다
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)
  const busyRef = useRef(false)

  useEffect(() => {
    const setP = (v: number) => { pullRef.current = v; setPull(v) }

    const refresh = async () => {
      busyRef.current = true; setBusy(true)
      const began = Date.now()
      try {
        await DS.loadEssential()
        if (useAuthStore.getState().isAccount) await DS.reloadUserScoped()
        markDataRefreshed()
      } catch (e) {
        console.error('[pull-to-refresh]', e)
      }
      const wait = MIN_SPIN_MS - (Date.now() - began)
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      busyRef.current = false; setBusy(false); setP(0)
    }

    const onStart = (e: TouchEvent) => {
      startY.current = null
      if (busyRef.current || e.touches.length !== 1) return
      if (window.scrollY > 0) return                       // 맨 위에서 시작한 당김만
      if (document.body.style.overflow === 'hidden') return // 서랍 등이 본문을 잠가 둔 동안
      const t = e.target as Element | null
      if (t?.closest?.(IGNORE)) return
      startY.current = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (startY.current == null) return
      const dy = e.touches[0].clientY - startY.current
      // 위로 밀었거나 그새 화면이 내려갔으면 평범한 스크롤이다 — 이번 터치는 손 뗀다
      if (dy <= 0 || window.scrollY > 0) { startY.current = null; if (pullRef.current) setP(0); return }
      setP(Math.min(MAX_PULL, dy * RESISTANCE))
    }
    const onEnd = () => {
      if (startY.current == null) return
      startY.current = null
      if (pullRef.current >= TRIGGER) void refresh()
      else setP(0)
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  if (!pull && !busy) return null

  const ready = pull >= TRIGGER
  // 새로 고치는 동안엔 TRIGGER 자리에 머문다
  const y = busy ? TRIGGER : pull
  return (
    <div className="ptr" style={{ transform: `translate(-50%, ${y}px)`, opacity: busy ? 1 : Math.min(1, pull / TRIGGER) }}
      role="status" aria-live="polite" aria-label={busy ? '새로 고치는 중' : ready ? '놓으면 새로 고침' : '당겨서 새로 고침'}>
      <span className={`ptr-icon ${busy ? 'spin' : ''}`}
        style={busy ? undefined : { transform: `rotate(${(pull / TRIGGER) * 270}deg)` }}>↻</span>
    </div>
  )
}
