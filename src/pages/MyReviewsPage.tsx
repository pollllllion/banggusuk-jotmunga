import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { DiscussionRow } from '@/components/content/DiscussionRow'
import { Seo } from '@/components/seo/Seo'

/** 내 토론글 — 내가 쓴 토론글(별점 포함) 목록. (리뷰 통합으로 '내 리뷰' 대체) */
export function MyReviewsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  if (!user) return null

  const posts = DS.getDiscussionsByAuthor(user.id)
    .map(p => ({ post: p, content: DS.getContentById(p.contentId) }))
    .filter((x): x is { post: typeof x.post; content: NonNullable<typeof x.content> } => Boolean(x.content))
    .sort((a, b) => new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())

  return (
    <>
      <Seo title="내 토론글" noindex />
      <div className="feed-header">
        <h2 className="feed-title">내 토론글 ({posts.length})</h2>
      </div>
      {!posts.length ? (
        <div className="empty-state fade-in">
          <p>아직 작성한 글이 없습니다.</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/browse')}>작품 둘러보기</button>
        </div>
      ) : (
        <div className="disc-board fade-in">
          {posts.map(({ post, content }) => (
            <DiscussionRow key={post.id} post={post} content={content} showContent onOpen={() => navigate(`/talk/${post.id}`)} />
          ))}
        </div>
      )}
    </>
  )
}
