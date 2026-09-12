import { useState } from 'react'
import { isIos, isIosSafari, isStandalone, getInstallPrompt, clearInstallPrompt } from '@/utils/pwa'
import { useToastStore } from '@/components/ui/Toast'

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

  const steps = () => {
    if (isStandalone()) return ['이미 앱으로 열려 있어요. 더 할 일이 없습니다.']
    if (isIosSafari()) return [
      '화면 아래 공유 버튼(□에서 화살표가 나오는 모양)을 누르세요.',
      '메뉴를 내려서 "홈 화면에 추가"를 누르세요.',
      '오른쪽 위 "추가"를 누르면 끝이에요.',
    ]
    // 아이폰인데 사파리가 아니면 그 브라우저에서는 아예 불가능하다 — 먼저 사파리로 옮겨야 한다
    if (isIos()) return [
      '지금 브라우저(크롬·네이버앱 등)에서는 홈 화면에 추가할 수 없어요. 아이폰은 사파리만 됩니다.',
      '주소를 복사해 사파리에서 ottcal.com 을 열어주세요.',
      '사파리에서 공유 버튼 → "홈 화면에 추가" 를 누르면 끝이에요.',
    ]
    if (prompt) return ['아래 "홈 화면에 추가" 버튼을 누르면 바로 설치돼요.']
    return [
      '브라우저 메뉴(⋮)를 누르세요.',
      '"앱 설치" 또는 "홈 화면에 추가"를 누르세요.',
      '주소창 오른쪽에 설치 아이콘(⊕)이 보이면 그걸 눌러도 됩니다.',
    ]
  }

  return (
    <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet install-guide" role="dialog" aria-label="홈 화면에 추가">
        <div className="sheet-group">
          <div className="install-guide-head">
            <img src="/icons/icon-192.png" alt="" />
            <div>
              <b>앱처럼 쓰기</b>
              <span>홈 화면에 추가하면 주소창 없이 바로 열리고, 알림도 받을 수 있어요.</span>
            </div>
          </div>
          <ol className="install-guide-steps">
            {steps().map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          {prompt && !isStandalone() && (
            <button className="btn btn-primary" disabled={busy} onClick={() => void install()}>
              {busy ? '설치 창 여는 중...' : '홈 화면에 추가'}
            </button>
          )}
        </div>
        <button className="sheet-item sheet-cancel" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}
