import type { ReactNode } from 'react'

/**
 * 비어 있거나 감춰진 칸의 자리표.
 *
 * 남의 프로필에서는 칸을 **지우지 않는다**: 아무것도 없으면 화면이 통째로 비어
 * "이 사람이 아무것도 안 했나" 인지 "원래 이런 게 없는 서비스인가" 인지 알 수 없다.
 * 빈 줄 하나가 '여기는 이런 걸 채우는 자리' 라고 말해 준다.
 */
export function FeedBlank({ children }: { children: ReactNode }) {
  return <div className="feed-blank fade-in"><p>{children}</p></div>
}
