import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { InstallGuide } from './InstallGuide'
import { useAuthStore } from '@/stores/authStore'
import {
  isStandalone, isIosSafari, wasInstalledHere, devicePlatform,
  getInstallPrompt, clearInstallPrompt, onInstallPromptChange,
  type BeforeInstallPromptEvent,
} from '@/utils/pwa'

const SNOOZE_KEY = 'pwa-install-snoozed-at'
const SHOW_DELAY_MS = 4000

/** 닫으면 하루 뒤 다시. PC 는 캘린더 첫 화면에서만, 폰은 어느 화면이든 */
const SNOOZE_MS = 86400_000
const isDesktop = () => window.matchMedia('(min-width: 769px)').matches

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY) || 0)
    return at > 0 && Date.now() - at < SNOOZE_MS
  } catch { return false }
}

/**
 * 홈화면 설치 안내 배너.
 * - 안드로이드/크롬: 미리 잡아 둔 beforeinstallprompt 를 우리 UI 로 띄운다
 * - iOS 사파리: 프로그램적 설치가 없어서 '공유 → 홈 화면에 추가' 안내만 한다
 * 이미 설치했거나(앱 창·이 브라우저에서 설치한 기록) 최근에 닫았으면 뜨지 않는다.
 */
export function InstallPrompt() {
  const { pathname } = useLocation()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [show, setShow] = useState(false)
  const [guide, setGuide] = useState(false)
  const isAccount = useAuthStore(s => s.isAccount)
  const installedOn = useAuthStore(s => s.user?.appInstalledOn)
  const updateProfile = useAuthStore(s => s.updateProfile)
  const installedOnThisKind = isAccount && !!installedOn?.includes(devicePlatform())

  // 앱으로 열렸으면 계정에 기기 종류를 적는다 — 아이폰 사파리는 이 기록으로만 설치를 안다
  useEffect(() => {
    if (!isStandalone() || !isAccount || installedOnThisKind) return
    // 칸이 없으면(마이그레이션 전) 저장만 실패한다. 배너 판단엔 영향이 없다
    updateProfile({ appInstalledOn: [...(installedOn ?? []), devicePlatform()] }).catch(() => {})
  }, [isAccount, installedOn, installedOnThisKind, updateProfile])

  useEffect(() => {
    if (isStandalone() || wasInstalledHere() || snoozed()) return

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
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())) } catch { /* 사생활 보호 모드 */ }
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice   // 수락이든 거절이든 배너는 접는다
    clearInstallPrompt()
    setDeferred(null)
    close()
  }

  if (guide) return <InstallGuide onClose={() => { setGuide(false); close() }} />
  if (!show || (!deferred && !iosHint) || installedOnThisKind) return null
  // PC 에서는 캘린더 첫 화면에만. 작품·글을 읽는 화면 구석을 계속 차지하지 않게
  if (isDesktop() && pathname !== '/') return null

  return (
    <div className="install-banner" role="dialog" aria-label="홈화면에 추가">
      <img src="/icons/icon-192.png" alt="" />
      <div className="install-text">
        <b>앱처럼 쓰기</b>
        {deferred
          ? <span>홈화면에 추가하면 주소창 없이 바로 열려요.</span>
          : <span>공유 <b>⎋</b> → <b>홈 화면에 추가</b>를 누르면 앱처럼 열려요.</span>}
      </div>
      {/* 크롬 계열은 한 번에 설치되고, 아이폰은 사람이 눌러야 해서 절차를 보여준다 */}
      {deferred
        ? <button className="btn btn-primary btn-small" onClick={install}>추가</button>
        : <button className="btn btn-secondary btn-small" onClick={() => setGuide(true)}>방법 보기</button>}
      <button className="install-close" onClick={close} aria-label="닫기">✕</button>
    </div>
  )
}
