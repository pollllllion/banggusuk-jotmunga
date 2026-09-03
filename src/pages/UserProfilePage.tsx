import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { LevelCard } from '@/components/profile/LevelCard'
import { TasteProfile } from '@/components/profile/TasteProfile'
import { DiscussionRow } from '@/components/content/DiscussionRow'
import { BackIcon } from '@/components/ui/Icons'
import { Seo } from '@/components/seo/Seo'

/** 공개 유저 프로필 — 레벨 + 취향 + 작성 토론글. 다른 유저가 취향을 보고 신뢰를 판단. */
export function UserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const me = useAuthStore(s => s.user)

  const u = id ? DS.getUserById(id) : undefined
  if (!u) {
    return (
      <div className="empty-state fade-in"><p>존재하지 않는 사용자예요.</p></div>
    )
  }
  const isMe = me?.id === u.id

  const posts = DS.getDiscussionsByAuthor(u.id)
    // 자유방 글은 작품이 없다 — 예전처럼 content 없는 줄을 걸러내면 내 글이 목록에서 사라진다.
    // DiscussionRow 가 작품 없는 줄을 그릴 수 있으므로 그대로 둔다.
    .map(p => ({ post: p, content: DS.getContentById(p.contentId) }))
    .sort((a, b) => new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())

  return (
    <>
      <Seo title={`${u.nickname} 님의 프로필`} noindex />
      <div className="back-btn" onClick={() => navigate(-1)}><BackIcon /> 뒤로</div>
      <div className="feed-header">
        <h2 className="feed-title">{u.nickname}{isMe && <span style={{ fontSize: 13, color: 'var(--subtext)', fontWeight: 500 }}> · 나</span>}</h2>
      </div>

      <LevelCard user={u} />
      <TasteProfile user={u} editable={isMe} />

      <div className="feed-header" style={{ marginTop: 20 }}>
        <h3 className="feed-title" style={{ fontSize: 16 }}>작성한 토론글 {posts.length}</h3>
      </div>
      {!posts.length ? (
        <div className="empty-state fade-in"><p>아직 작성한 글이 없어요.</p></div>
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
