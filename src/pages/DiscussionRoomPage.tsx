import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { WriteDiscussionModal } from '@/components/content/WriteDiscussionModal'
import { HeartIcon } from '@/components/ui/Icons'
import { TYPE_EMOJIS, TYPE_LABELS } from '@/utils/constants'
import { timeAgo } from '@/utils/helpers'
import '@/styles/discussion.css'

/** 세부 탭 — 글의 작품 타입으로 필터 */
const SUBS: { key: string; label: string }[] = [
  { key: 'all',      label: '전체' },
  { key: 'movie',    label: '영화' },
  { key: 'drama',    label: '드라마' },
  { key: 'variety',  label: '예능' },
  { key: 'webtoon',  label: '웹툰' },
  { key: 'webnovel', label: '웹소설' },
  { key: 'other',    label: '기타' },
]
const KNOWN_TYPES = ['movie', 'drama', 'variety', 'webtoon', 'webnovel']

export function DiscussionRoomPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, isAccount } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const sub = searchParams.get('sub') || 'all'
  const [showWrite, setShowWrite] = useState(false)
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  const setSub = (key: string) => {
    const next = new URLSearchParams(searchParams)
    if (key === 'all') next.delete('sub'); else next.set('sub', key)
    setSearchParams(next)
  }

  const blockedIds = user ? DS.getBlockedIds(user.id) : []

  // 모든 글(discussions) + 작품 정보 결합 → 타입 필터 → 최신순
  const rows = DS.getDiscussions()
    .filter(p => !blockedIds.includes(p.authorId || ''))
    .map(p => ({ post: p, content: DS.getContentById(p.contentId) }))
    .filter((x): x is { post: typeof x.post; content: NonNullable<typeof x.content> } => Boolean(x.content))
    .filter(({ content }) => {
      if (sub === 'other') return !KNOWN_TYPES.includes(content.type)
      if (KNOWN_TYPES.includes(sub)) return content.type === sub
      return true // 'all' 또는 알 수 없는 값 → 전체
    })
    .sort((a, b) => new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())

  const openWrite = () => {
    if (!user) { toast('로그인 후 이용해주세요.'); return }
    setShowWrite(true)
  }

  const like = (id: string) => {
    if (!user) return
    if (!isAccount) { toast('공감은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    DS.toggleDiscussionLike(id, user.id); rerender()
  }

  return (
    <>
      <div className="feed-header">
        <h2 className="feed-title">{'\u{1F5E3}\u{FE0F}'} 방구석토론방</h2>
        <button className="btn btn-primary btn-small" onClick={openWrite}>✍️ 글쓰기</button>
      </div>

      <div className="feed-typefilter">
        {SUBS.map(s => (
          <button key={s.key} className={sub === s.key ? 'active' : ''} onClick={() => setSub(s.key)}>
            {s.key !== 'all' && TYPE_EMOJIS[s.key] ? `${TYPE_EMOJIS[s.key]} ` : ''}{s.label}
          </button>
        ))}
      </div>

      {!rows.length ? (
        <div className="empty-state fade-in">
          <p>아직 글이 없어요. 첫 글을 남겨보세요!</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openWrite}>✍️ 글쓰기</button>
        </div>
      ) : (
        <div className="disc-list fade-in">
          {rows.map(({ post: p, content: c }) => {
            const isGuest = !!p.guestName
            const displayName = isGuest ? p.guestName : (DS.getUserById(p.authorId || '')?.nickname || '탈퇴한 사용자')
            const liked = user ? p.likes.includes(user.id) : false
            return (
              <div key={p.id} className="disc-item fade-in">
                {/* 작품 태그 — 클릭 시 그 작품의 글 모아보기(수다방) */}
                <div
                  className="disc-tag"
                  onClick={() => navigate(`/content/${c.id}?tab=talk`)}
                  title="이 작품의 글 모두 보기">
                  <span className={`type-badge type-${c.type}`}>{TYPE_EMOJIS[c.type]} {TYPE_LABELS[c.type]}</span>
                  <span className="disc-tag-title">{c.title}</span>
                  <span className="disc-tag-more">글 모아보기 ›</span>
                </div>
                <div className="disc-item-head">
                  <span className="disc-author">{displayName}</span>
                  {isGuest && <span className="disc-guest-badge">유동</span>}
                  <span className="disc-time">{timeAgo(p.createdAt)}</span>
                </div>
                <p className="disc-body">{p.body}</p>
                <div className="disc-item-foot">
                  <button className={`disc-like ${liked ? 'on' : ''}`} onClick={() => like(p.id)}>
                    <HeartIcon filled={liked} size={14} /> {p.likes.length > 0 ? p.likes.length : '공감'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showWrite && (
        <WriteDiscussionModal onClose={() => setShowWrite(false)} onPosted={() => rerender()} />
      )}
    </>
  )
}
