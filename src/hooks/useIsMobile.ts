import { useEffect, useState } from 'react'

/**
 * 좁은 화면 여부. CSS 로 감출 수 있는 것은 CSS 로 하고, **개수 계산이 달라지는 곳**에만 쓴다.
 * (예: 캘린더 셀이 모바일에선 포스터 1장만 보여주므로 "+N" 의 N 이 데스크톱과 다르다)
 * 720px 은 `styles/calendar.css` 의 미디어쿼리 경계와 같은 값이다 — 한쪽만 바꾸면 어긋난다.
 */
export function useIsMobile(maxWidth = 720): boolean {
  const q = `(max-width: ${maxWidth}px)`
  const [is, setIs] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setIs(mq.matches)
    mq.addEventListener('change', on)
    on()
    return () => mq.removeEventListener('change', on)
  }, [q])
  return is
}
