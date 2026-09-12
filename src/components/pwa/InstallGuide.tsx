import { useState, type ReactNode } from 'react'
import { isIos, isIosSafari, isStandalone, getInstallPrompt, clearInstallPrompt } from '@/utils/pwa'
import { useToastStore } from '@/components/ui/Toast'

/** 아이폰 사파리의 공유 버튼 모양. 말로 "□에서 화살표가 나오는 모양"이라 설명할 일이 아니다 */
function ShareGlyph() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" role="img" aria-label="공유 버튼"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.2V14" />
      <path d="M8.4 6.8 12 3.2l3.6 3.6" />
      <path d="M7.6 10H5.8A1.8 1.8 0 0 0 4 11.8v7.4A1.8 1.8 0 0 0 5.8 21h12.4a1.8 1.8 0 0 0 1.8-1.8v-7.4A1.8 1.8 0 0 0 18.2 10h-1.8" />
    </svg>
  )
}

/** 크롬 계열의 메뉴 버튼 모양(⋮) */
function DotsGlyph() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" role="img" aria-label="메뉴 버튼" fill="currentColor">
      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
    </svg>
  )
}

/**
 * '홈 화면에 추가' 안내 — **언제든 찾아올 수 있는** 설명.
 *
 * 자동 배너(InstallPrompt)만으로는 부족하다. 한 번 닫으면 14일 잠들고, 크롬이
 * beforeinstallprompt 를 주지 않는 상황(이미 설치했다고 판단할 때 등)에는 아예 뜨지 않는다.
 * 무엇보다 **아이폰은 사파리에서 공유 → 홈 화면에 추가** 를 사람이 직접 눌러야 하는데,
 * 그 경로를 모르는 사람이 많다.
 *
 * 화면(캘린더·피드)을 가리지 않도록 평소엔 숨어 있고, 설정에서 열린다.
 * 기기에 맞는 절차만 보여준다 — 안드로이드 사람에게 아이폰 설명을 읽히지 않는다.
 */
export function InstallGuide({ onClose }: { onClose: () => void }) {
  const toast = useToastStore(s => s.show)
  const [busy, setBusy] = useState(false)
  const prompt = getInstallPrompt()

  const install = async () => {
    if (!prompt || busy) return
    setBusy(true)
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      clearInstallPrompt()
      if (outcome === 'accepted') { toast('홈 화면에 추가했어요.'); onClose() }
    } catch {
      toast('설치 창을 열지 못했어요. 브라우저 메뉴에서 "앱 설치"를 눌러주세요.')
    } finally {
      setBusy(false)
    }
  }

  const steps = (): ReactNode[] => {
    if (isStandalone()) return ['이미 앱으로 열려 있어요. 더 할 일이 없습니다.']
    if (isIosSafari()) return [
      // 모양을 말로 풀어 쓰는 대신 그 버튼을 그려 넣는다 — 찾는 건 눈이 하는 일이다
      <>화면 아래 <ShareGlyph /> 를 누르세요.</>,
      <>메뉴를 내려서 <b>홈 화면에 추가</b>를 누르세요.</>,
      <>오른쪽 위 <b>추가</b>를 누르면 끝이에요.</>,
    ]
    // 아이폰인데 사파리가 아니면 그 브라우저에서는 아예 불가능하다 — 먼저 사파리로 옮겨야 한다
    if (isIos()) return [
      '지금 브라우저(크롬·네이버앱 등)에서는 홈 화면에 추가할 수 없어요. 아이폰은 사파리만 됩니다.',
      '주소를 복사해 사파리에서 ottcal.com 을 열어주세요.',
      <>사파리에서 <ShareGlyph /> → <b>홈 화면에 추가</b>를 누르면 끝이에요.</>,
    ]
    if (prompt) return ['아래 "홈 화면에 추가" 버튼을 누르면 바로 설치돼요.']
    return [
      <>브라우저 메뉴 <DotsGlyph /> 를 누르세요.</>,
      <><b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 누르세요.</>,
      '주소창 오른쪽에 설치 아이콘이 보이면 그걸 눌러도 됩니다.',
    ]
  }

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet install-guide" role="dialog" aria-label="홈 화면에 추가">
        <div className="sheet-group">
          {/* 로고를 가운데 위로. 글자 옆에 붙여 두니 폰에서 왼쪽 모서리에 처박힌 것처럼 보였다 */}
          <div className="install-guide-head">
            <img src="/icons/icon-192.png" alt="" />
            <b>홈 화면에 추가</b>
            <span>주소창 없이 바로 열리고, 알림도 받을 수 있어요</span>
          </div>
          <ol className="install-guide-steps">
            {steps().map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          {prompt && !isStandalone() && (
            <div className="install-guide-action">
              <button className="btn btn-primary" disabled={busy} onClick={() => void install()}>
                {busy ? '설치 창 여는 중...' : '홈 화면에 추가'}
              </button>
            </div>
          )}
        </div>
        <button className="sheet-item sheet-cancel" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}
