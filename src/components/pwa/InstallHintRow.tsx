import { useState } from 'react'
import { isStandalone } from '@/utils/pwa'
import { InstallGuide } from './InstallGuide'

const SNOOZE_KEY = 'pwa-hint-snoozed-at'
const SNOOZE_DAYS = 30

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY) || 0)
    return at > 0 && Date.now() - at < SNOOZE_DAYS * 86400_000
  } catch { return false }
}

/**
 * '앱으로 쓰기' 한 줄 — 내 피드 맨 위.
 *
 * 안내를 설정 안에만 두니 폰에서 너무 깊었다(프로필 → 계정 설정 → 앱으로 쓰기).
 * 하단 내비에서 한 번에 닿는 화면이 내 피드라 그 위에 한 줄만 둔다.
 * **캘린더·토론방은 건드리지 않는다** — 거기는 보러 온 것을 가리면 안 되는 화면이다.
 *
 * 닫으면 30일 잠든다(자동 배너의 14일과 따로 센다 — 성격이 다른 자리다).
 * 이미 앱으로 열려 있으면 뜨지 않는다.
 */
export function InstallHintRow() {
  const [gone, setGone] = useState(() => isStandalone() || snoozed())
  const [guide, setGuide] = useState(false)

  if (gone) return null

  return (
    <>
      <div className="install-hint">
        {/* 폰 폭(390px)에서 제목이 두 줄로 깨지지 않을 길이로 잡았다.
            화살표(›)는 뺐다 — 오른쪽 ✕ 와 나란히 붙어 칸이 어수선해 보였고,
            줄 전체가 눌리므로 있으나 없으나다. */}
        <button className="install-hint-main" onClick={() => setGuide(true)}>
          <img src="/icons/icon-192.png" alt="" />
          <span>
            <b>홈 화면에 추가하기</b>
            <small>주소창 없이 바로 열리고 알림도 받아요</small>
          </span>
        </button>
        <button
          className="install-hint-close"
          aria-label="이 안내 닫기"
          onClick={() => {
            try { localStorage.setItem(SNOOZE_KEY, String(Date.now())) } catch { /* 사생활 보호 모드 */ }
            setGone(true)
          }}
        >✕</button>
      </div>
      {guide && <InstallGuide onClose={() => setGuide(false)} />}
    </>
  )
}
