import { useEffect } from 'react'

/**
 * Esc 로 닫기.
 *
 * 모달·서랍의 배경을 눌러 닫는 건 마우스만의 방법이다. 키보드로는 닫을 길이 없었다
 * (배경 div 에 tabIndex 를 붙이는 건 답이 아니다 — 탭 순서에 쓸모없는 정거장만 는다).
 *
 * @param enabled 열려 있을 때만 true. 닫힌 모달이 Esc 를 가로채지 않게 한다.
 * @param onClose 닫는 함수. 매 렌더 새 함수여도 되도록 ref 없이 의존성에 넣는다.
 */
export function useEscapeKey(enabled: boolean, onClose: () => void) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 한글 입력 중(조합)에 누른 Esc 는 조합 취소용이다 — 모달까지 닫아 버리면
      // 쓰던 글이 통째로 사라진 것처럼 느껴진다.
      if (e.isComposing) return
      onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [enabled, onClose])
}
