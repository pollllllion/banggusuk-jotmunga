import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { LevelCard } from '@/components/profile/LevelCard'
import { TasteProfile } from '@/components/profile/TasteProfile'
import { DiscussionRow } from '@/components/content/DiscussionRow'
import { ContentCard } from '@/components/content/ContentCard'
import { BackIcon } from '@/components/ui/Icons'
import { Seo } from '@/components/seo/Seo'
import { clickable } from '@/utils/a11y'
import type { Content } from '@/types'

/** 프로필에서 보여줄 '본 작품' 최대 개수 — 프로필이 작품 목록에 잡아먹히지 않게 */
const MAX_WATCHED = 12

/** 공개 유저 프로필 — 레벨 + 취향 + 작성 토론글 + 본 작품.
 *  다른 유저가 취향을 보고 신뢰를 판단하는 화면이다. */
export function UserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const me = useAuthStore(s => s.user)

  /**
   * 본 작품(watched)은 캐시에 **내 행만** 있다(RLS + 시작 로드 용량).
   * 그래서 프로필을 열 때 그 사람 것만 따로 물어본다.
   * watched 의 select 가 "본인만"이면 남의 것은 빈 배열로 오고, 이 칸은 그냥 안 뜬다
   * (공개하려면 supabase/migration_watched_public.sql).
   */
  const [watched, setWatched] = useState<Content[] | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    DS.fetchUserWatched(id).then(rows => {
      if (!alive) return
      const items = rows
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(w => DS.getContentById(w.contentId))
        .filter((c): c is Content => !!c)
      setWatched(items)
    })
    return () => { alive = false }
  }, [id])

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
      <div className="back-btn" {...clickable(() => navigate(-1))}><BackIcon /> 뒤로</div>
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

      {/* 본 작품 — 볼 수 있을 때만 그린다(빈 배열이면 통째로 숨김) */}
      {watched && watched.length > 0 && (
        <>
          <div className="feed-header" style={{ marginTop: 24 }}>
            <h3 className="feed-title" style={{ fontSize: 16 }}>본 작품 {watched.length}</h3>
            {isMe && (
              <button className="btn btn-text btn-small" onClick={() => navigate('/feed')}>내 피드 전체</button>
            )}
          </div>
          <div className="content-grid">
            {watched.slice(0, MAX_WATCHED).map(c => <ContentCard key={c.id} content={c} />)}
          </div>
        </>
      )}
    </>
  )
}
