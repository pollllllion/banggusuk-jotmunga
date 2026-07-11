import { useParams } from 'react-router-dom'
import { BOARDS } from '@/utils/constants'

/** 신규 게시판 임시 페이지. 각 게시판 스펙 확정 시 개별 구현으로 교체 */
export function BoardPage() {
  const { slug } = useParams()
  const board = BOARDS.find(b => b.slug === slug)

  return (
    <>
      <div className="feed-header">
        <h2 className="feed-title">
          {board ? `${board.emoji} ${board.label}` : '게시판'}
        </h2>
      </div>
      <div className="empty-state fade-in">
        <p>이 게시판은 준비 중입니다. 곧 오픈해요! 🚧</p>
      </div>
    </>
  )
}
