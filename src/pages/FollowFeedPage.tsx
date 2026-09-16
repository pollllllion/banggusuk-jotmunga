import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { Avatar } from '@/components/profile/Avatar'
import { LevelTag } from '@/components/profile/LevelTag'
import { Seo } from '@/components/seo/Seo'
import { boardDate } from '@/utils/helpers'
import { TALK_LABEL } from '@/utils/constants'
import { clickable } from '@/utils/a11y'
import type { Content, Discussion, User } from '@/types'

/** 한 화면에 흘릴 최대 줄 수 — 더 보려면 그 사람 프로필로 간다 */
const FEED_MAX = 60

/** 관심 피드 한 줄 = 관심 있는 사람이 쓴 글 하나 */
interface Row { post: Discussion; author: User; content: Content | undefined }

/**
 * 관심 피드 — 관심 등록한 사람들이 **쓴 글**을 시간순으로 모은다.
 *
 * 왜 따로 화면인가: "이 사람 글이 궁금하다"가 프로필을 하나씩 찾아가는 일이 되면
 * 아무도 안 한다. 새 글이 저절로 흘러와야 관심을 등록한 뜻이 있다.
 *
 * 2026-09-16 — 포스터와 별점 배지를 걷어냈다. 별점 단 글에만 포스터가 붙어서
 * 줄 높이가 제각각이었고, 글 목록인지 작품 목록인지 한눈에 안 갈렸다.
 * 점수가 궁금하면 글을 열면 된다 — 여기서는 **누가 무슨 글을 썼나**만 읽힌다.
 *
 * 알림은 붙이지 않는다 — 남이 글을 쓸 때마다 알림이 오면 사람들은 그냥 알림을 끈다.
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
            닉네임을 눌러 그 사람 피드로 간 뒤 <b>+ 관심</b>을 누르면 여기에 그 사람의 새 글이 모입니다.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/talk')}>{TALK_LABEL} 둘러보기</button>
        </div>
      ) : (
        <>
          {/* 관심 등록한 사람들 — 눌러서 그 사람 피드로 */}
          <div className="follow-people">
            {follows.map(f => (
              <div key={f.id} className="follow-person" {...clickable(() => navigate(`/u/${f.id}`), `${f.nickname} 피드`)}>
                <Avatar src={f.avatarUrl} name={f.nickname} size={44} />
                <span className="follow-person-name">
                  <span className="follow-person-nick">{f.nickname}</span>
                  <LevelTag authorId={f.id} />
                </span>
              </div>
            ))}
          </div>

          {!rows.length ? (
            <div className="empty-state fade-in"><p>아직 올라온 글이 없어요.</p></div>
          ) : (
            <div className="disc-board fade-in">
              {rows.map(({ post, author, content }) => (
                <div key={post.id} className="follow-row" {...clickable(() => navigate(`/talk/${post.id}`))}>
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
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
