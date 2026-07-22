import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { WriteDiscussionModal } from '@/components/content/WriteDiscussionModal'
import { DiscussionRow } from '@/components/content/DiscussionRow'
import { TYPE_EMOJIS } from '@/utils/constants'
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
  const { user } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const sub = searchParams.get('sub') || 'all'
  const [showWrite, setShowWrite] = useState(false)
  const [q, setQ] = useState('')
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  const setSub = (key: string) => {
    const next = new URLSearchParams(searchParams)
    if (key === 'all') next.delete('sub'); else next.set('sub', key)
    setSearchParams(next)
  }

  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  const query = q.trim().toLowerCase()

  // 전체 작품 글(discussions) + 작품 정보 결합 → 타입/검색 필터 → 최신순
  const rows = DS.getDiscussions()
    .filter(p => !blockedIds.includes(p.authorId || ''))
    .map(p => ({ post: p, content: DS.getContentById(p.contentId) }))
    .filter((x): x is { post: typeof x.post; content: NonNullable<typeof x.content> } => Boolean(x.content))
    .filter(({ content }) => {
      if (sub === 'other') return !KNOWN_TYPES.includes(content.type)
      if (KNOWN_TYPES.includes(sub)) return content.type === sub
      return true
    })
    .filter(({ post, content }) => !query ||
      (post.title || '').toLowerCase().includes(query) ||
      post.body.toLowerCase().includes(query) ||
      content.title.toLowerCase().includes(query))
    .sort((a, b) => new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())

  const openWrite = () => {
    if (!user) { toast('로그인 후 이용해주세요.'); return }
    setShowWrite(true)
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

      <div className="disc-searchbar">
        <input className="form-input" value={q} onChange={e => setQ(e.target.value)} placeholder="제목·내용·작품 검색" />
        <span className="disc-searchbar-count">{rows.length}건</span>
      </div>

      {!rows.length ? (
        <div className="empty-state fade-in">
          <p>{query ? '검색 결과가 없어요.' : '아직 글이 없어요. 첫 글을 남겨보세요!'}</p>
          {!query && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openWrite}>✍️ 글쓰기</button>}
        </div>
      ) : (
        <div className="disc-board fade-in">
          {rows.map(({ post, content }) => (
            <DiscussionRow key={post.id} post={post} content={content} showContent onOpen={() => navigate(`/talk/${post.id}`)} />
          ))}
        </div>
      )}

      {showWrite && <WriteDiscussionModal onClose={() => setShowWrite(false)} onPosted={() => rerender()} />}
    </>
  )
}
