import { useEffect, useState } from 'react'
import {
  isStandalone, isIosSafari,
  getInstallPrompt, clearInstallPrompt, onInstallPromptChange,
  type BeforeInstallPromptEvent,
} from '@/utils/pwa'

const SNOOZE_KEY = 'pwa-install-snoozed-at'
const SNOOZE_DAYS = 14
const SHOW_DELAY_MS = 4000

function snoozed(): boolean {
  const at = Number(localStorage.getItem(SNOOZE_KEY) || 0)
  return at > 0 && Date.now() - at < SNOOZE_DAYS * 86400_000
}

/**
 * 홈화면 설치 안내 배너.
 * - 안드로이드/크롬: 미리 잡아 둔 beforeinstallprompt 를 우리 UI 로 띄운다
 * - iOS 사파리: 프로그램적 설치가 없어서 '공유 → 홈 화면에 추가' 안내만 한다
 * 이미 설치해 실행 중이거나 최근에 닫았으면 뜨지 않는다.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (isStandalone() || snoozed()) return

    // 마운트 전에 이미 도착했을 수 있다 — 먼저 꺼내 보고, 그 뒤 변화를 구독한다
    setDeferred(getInstallPrompt())
    const off = onInstallPromptChange(setDeferred)

    // iOS 는 beforeinstallprompt 가 없다 — 사파리면 안내를 띄운다
    if (isIosSafari()) setIosHint(true)

    // 첫 화면을 잠깐이라도 보고 나서 뜨게 (열자마자 배너부터 보이면 닫고 만다)
    const timer = setTimeout(() => setShow(true), SHOW_DELAY_MS)
    return () => { off(); clearTimeout(timer) }
  }, [])

  const close = () => {
    setShow(false)
    localStorage.setItem(SNOOZE_KEY, String(Date.now()))
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice   // 수락이든 거절이든 배너는 접는다
    clearInstallPrompt()
    setDeferred(null)
    close()
  }

  if (!show || (!deferred && !iosHint)) return null

  return (
    <div className="install-banner" role="dialog" aria-label="홈화면에 추가">
      <img src="/icons/icon-192.png" alt="" />
      <div className="install-text">
        <b>앱처럼 쓰기</b>
        {deferred
          ? <span>홈화면에 추가하면 주소창 없이 바로 열려요.</span>
          : <span>공유 <b>⎋</b> → <b>홈 화면에 추가</b>를 누르면 앱처럼 열려요.</span>}
      </div>
      {deferred && <button className="btn btn-primary btn-small" onClick={install}>추가</button>}
      <button className="install-close" onClick={close} aria-label="닫기">✕</button>
    </div>
  )
}
