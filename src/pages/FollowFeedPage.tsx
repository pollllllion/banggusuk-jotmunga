import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { Avatar } from '@/components/profile/Avatar'
import { LevelTag } from '@/components/profile/LevelTag'
import { Seo } from '@/components/seo/Seo'
import { boardDate, scoreColor } from '@/utils/helpers'
import { clickable } from '@/utils/a11y'
import type { Content, Discussion, User } from '@/types'

/** 한 화면에 흘릴 최대 줄 수 — 더 보려면 그 사람 프로필로 간다 */
const FEED_MAX = 60

/** 관심 피드 한 줄 — 별점을 매긴 글이면 점수가 붙고, 아니면 그냥 새 글이다 */
interface Row { post: Discussion; author: User; content: Content | undefined }

/**
 * 관심 피드 — 관심 등록한 사람들의 새 글과 별점을 시간순으로 모은다.
 *
 * 왜 따로 화면인가: "이 사람 별점이 궁금하다"가 프로필을 하나씩 찾아가는 일이 되면
 * 아무도 안 한다. 새 별점이 저절로 흘러와야 관심을 등록한 뜻이 있다.
 *
 * 알림은 붙이지 않는다 — 남이 별점을 매길 때마다 알림이 오면 사람들은 그냥 알림을 끈다.
 * 보러 오는 사람에게만 보이면 된다.
 */
export function FollowFeedPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  if (!user) return null

  const follows = (user.follows ?? [])
    .map(id => DS.getUserById(id))
    .filter((u): u is User => Boolean(u))

  const blockedIds = DS.getBlockedIds(user.id)
  const rows: Row[] = follows.length
    ? DS.getDiscussions()
        .filter(p => p.authorId && user.follows?.includes(p.authorId) && !blockedIds.includes(p.authorId))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, FEED_MAX)
        .map(p => ({ post: p, author: DS.getUserById(p.authorId || ''), content: DS.getContentById(p.contentId) }))
        .filter((x): x is Row => Boolean(x.author))
    : []

  return (
    <>
      <Seo title="관심 피드" noindex />
      <div className="feed-header">
        <h2 className="feed-title">관심 피드 {follows.length > 0 && follows.length}</h2>
      </div>

      {!follows.length ? (
        <div className="empty-state fade-in">
          <p>아직 관심 등록한 사람이 없어요.</p>
          <p style={{ fontSize: 12, marginTop: 6 }}>
            닉네임을 눌러 그 사람 피드로 간 뒤 <b>+ 관심</b>을 누르면 여기에 그 사람의 새 글과 별점이 모입니다.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/talk')}>토론방 둘러보기</button>
        </div>
      ) : (
        <>
          {/* 관심 등록한 사람들 — 눌러서 그 사람 피드로 */}
          <div className="follow-people">
            {follows.map(f => (
              <div key={f.id} className="follow-person" {...clickable(() => navigate(`/u/${f.id}`), `${f.nickname} 피드`)}>
                <Avatar src={f.avatarUrl} name={f.nickname} size={44} />
                <span className="follow-person-nick">{f.nickname}</span>
              </div>
            ))}
          </div>

          {!rows.length ? (
            <div className="empty-state fade-in"><p>아직 올라온 글이 없어요.</p></div>
          ) : (
            <div className="disc-board fade-in">
              {rows.map(({ post, author, content }) => (
                <div key={post.id} className="follow-row" {...clickable(() => navigate(`/talk/${post.id}`))}>
                  {/* 별점을 매긴 글이면 포스터 + 점수 — 이 화면에 오는 이유가 그거다 */}
                  {content && post.rating != null && (
                    <div className="follow-row-poster"><Poster content={content} showScore={false} /></div>
                  )}
                  <div className="follow-row-main">
                    <div className="follow-row-who">
                      <Avatar src={author.avatarUrl} name={author.nickname} size={20} />
                      <span className="disc-author">{author.nickname}</span>
                      <LevelTag authorId={author.id} />
                      <span className="disc-time">{boardDate(post.createdAt)}</span>
                    </div>
                    <div className="follow-row-title">{post.title || post.body.slice(0, 40)}</div>
                    <div className="follow-row-work">{content?.title || '자유방'}</div>
                  </div>
                  {post.rating != null && (
                    <span className="feed-rating-score" style={{ background: scoreColor(post.rating) }}>{post.rating}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
