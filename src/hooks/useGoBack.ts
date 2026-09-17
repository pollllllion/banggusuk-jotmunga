import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * 화면 안의 ← 버튼용 — **누르기 직전 화면으로** 돌아간다.
 *
 * 예전엔 ← 가 navigate('/talk') 처럼 목록을 **새로 여는** 이동이었다. 그러면 목록이 맨 위부터
 * 다시 그려진다 — 한참 내려가 글을 눌렀다 돌아오면 읽던 자리를 잃는다. 앱(홈 화면)에는
 * 브라우저 뒤로 가기 버튼이 없어서 이 ← 가 유일한 길이라 더 아팠다.
 *
 * history 를 한 칸 되감으면(POP) AppLayout 의 스크롤 복원이 떠났던 자리로 데려다준다.
 * 캘린더 → 작품 → 작품방처럼 어디서 왔든 그 직전 화면이 나온다.
 *
 * 되감을 곳이 없을 때(공유 링크·검색으로 바로 들어옴 — idx 0)만 fallback 으로 간다.
 * 그때 replace 로 가는 이유: 안 그러면 fallback 화면에서 '뒤로'가 다시 이 글로 돌아온다.
 */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate()
  return useCallback(() => {
    // react-router 가 history.state.idx 에 '이 탭에서 몇 번째 화면인가'를 적어 둔다
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, fallback])
}
