import { useState } from 'react'
import { ShareIcon } from '@/components/ui/Icons'
import { useToastStore } from '@/components/ui/Toast'
import { shareOrCopy, shareMessage } from '@/utils/share'

/**
 * 공유 버튼 — 글·작품·캘린더 어디에나 붙는다.
 *
 * 폰에서는 OS 공유 시트(카톡·메시지…), PC 에서는 주소 복사.
 * 어느 쪽인지 사용자가 알 필요는 없어서 버튼은 하나다.
 *
 * @param path  공유할 경로 ('/talk/123' · '/content/abc' · '/?ym=2026-12')
 * @param label 스크린리더용 설명 (예: "'오징어 게임' 공유")
 */
export function ShareButton({ path, title, text, label, className = 'btn btn-secondary', children }: {
  path: string
  title?: string
  text?: string
  label?: string
  className?: string
  children?: React.ReactNode
}) {
  const toast = useToastStore(s => s.show)
  const [busy, setBusy] = useState(false)

  const onShare = async () => {
    if (busy) return
    setBusy(true)
    try {
      const msg = shareMessage(await shareOrCopy({ path, title, text }))
      // 사용자가 공유 시트를 그냥 닫았으면(null) 아무 말도 하지 않는다
      if (msg) toast(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onShare}
      disabled={busy}
      aria-label={label || '공유하기'}>
      <ShareIcon /> {children ?? '공유'}
    </button>
  )
}
