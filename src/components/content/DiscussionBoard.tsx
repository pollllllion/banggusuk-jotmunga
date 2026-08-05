import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { DiscussionRow } from '@/components/content/DiscussionRow'
import '@/styles/discussion.css'

/** 작품방 게시판 — 이 작품의 토론글 목록 + '토론하기'(통합 작성기로 이동). */
export function DiscussionBoard({ contentId }: { contentId: string }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const content = DS.getContentById(contentId)

  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  const posts = DS.getDiscussionsByContent(contentId).filter(p => !blockedIds.includes(p.authorId || ''))

  const goWrite = () => navigate(`/talk/write?contentId=${contentId}`)

  return (
    <div className="disc-wrap">
      <div className="feed-header" style={{ marginTop: 20 }}>
        <h2 className="feed-title">💬 토론글 {posts.length > 0 && <span style={{ color: 'var(--subtext)', fontWeight: 500 }}>{posts.length}</span>}</h2>
        <button className="btn btn-primary btn-small" onClick={goWrite}>✍️ 토론하기</button>
      </div>

      {!posts.length ? (
        <div className="empty-state fade-in">
          <p>아직 글이 없어요. 첫 글을 남겨보세요!</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={goWrite}>✍️ 토론하기</button>
        </div>
      ) : (
        <div className="disc-board">
          {content && posts.map(p => (
            <DiscussionRow key={p.id} post={p} content={content} onOpen={() => navigate(`/talk/${p.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}
