/**
 * 클릭되는 <div> 를 키보드로도 쓸 수 있게 만드는 소품들.
 *
 * 이 앱에는 눌러야 하는 <div> 가 49군데 있었는데 role·tabIndex 가 붙은 건 0곳이었다.
 * 마우스로는 멀쩡해 보이지만, 키보드만 쓰는 사람에게는 사이드바·하단탭·뒤로가기·
 * 검색 결과·카드가 전부 **존재하지 않는 것과 같았다.** 스크린리더도 그냥 글 뭉치로 읽는다.
 *
 * 원칙: 새로 만드는 건 <button> 을 쓴다. 이 helper 는 이미 있는 div 의 모양(CSS)을
 * 건드리지 않고 동작만 채워 넣기 위한 것이다 — button 으로 바꾸면 display·padding·
 * font 상속이 달라져서 레이아웃이 흔들리는 자리가 많다.
 *
 * 쓰는 법:  <div className="back-btn" {...clickable(() => navigate('/talk'))}>목록으로</div>
 *
 * ⚠️ 배경(모달 뒤 어두운 곳)에는 쓰지 말 것. 거기까지 탭이 멈추면 오히려 방해된다 —
 *    배경은 useEscapeKey 로 닫는 게 맞다.
 */
import type { KeyboardEvent } from 'react'

export type ClickableProps = {
  role: 'button'
  tabIndex: number
  onClick: () => void
  onKeyDown: (e: KeyboardEvent) => void
  'aria-label'?: string
}

/**
 * @param onClick 누르면 할 일
 * @param label   눌렀을 때 뭐가 되는지 글로 안 보이는 경우에만 (예: 아바타, 아이콘 하나짜리)
 */
export function clickable(onClick: () => void, label?: string): ClickableProps {
  return {
    role: 'button',
    tabIndex: 0,
    onClick,
    onKeyDown: (e: KeyboardEvent) => {
      // 진짜 button 과 같게: Enter 와 Space 로 눌린다.
      // Space 는 기본 동작이 '스크롤' 이라 반드시 막아야 한다.
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
    ...(label ? { 'aria-label': label } : {}),
  }
}
