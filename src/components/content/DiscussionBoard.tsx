import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { HeartIcon } from '@/components/ui/Icons'
import { timeAgo } from '@/utils/helpers'
import '@/styles/discussion.css'

/** 출시 전 작품의 기대평·떡밥 수다방 (content 단위, 평점 없음) */
export function DiscussionBoard({ contentId }: { contentId: string }) {
  const { user } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [body, setBody] = useState('')
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  const posts = DS.getDiscussionsByContent(contentId).filter(p => !blockedIds.includes(p.authorId))

  const submit = () => {
    if (!user) return
    const text = body.trim()
    if (!text) { toast('내용을 입력하세요.'); return }
    if (text.length > 500) { toast('500자 이내로 입력해주세요.'); return }
    DS.createDiscussion({ contentId, authorId: user.id, body: text })
    setBody(''); rerender()
  }

  const like = (id: string) => {
    if (!user) return
    DS.toggleDiscussionLike(id, user.id); rerender()
  }

  const remove = (id: string) => {
    if (!confirm('이 글을 삭제할까요?')) return
    DS.deleteDiscussion(id); toast('삭제했습니다.'); rerender()
  }

  return (
    <div className="disc-wrap">
      <div className="feed-header" style={{ marginTop: 20 }}>
        <h2 className="feed-title">💬 기대평 · 수다방 {posts.length > 0 && <span style={{ color: 'var(--subtext)', fontWeight: 500 }}>{posts.length}</span>}</h2>
      </div>

      <div className="disc-composer">
        <textarea
          className="disc-input"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="아직 안 나온 작품, 기대되는 점·떡밥·추측 뭐든 나눠보세요! (평점은 공개 후에)"
          maxLength={520}
          rows={3}
        />
        <div className="disc-composer-foot">
          <span className="disc-count">{body.length}/500</span>
          <button className="btn btn-primary btn-small" onClick={submit} disabled={!body.trim()}>기대평 남기기</button>
        </div>
      </div>

      {!posts.length ? (
        <div className="empty-state fade-in"><p>첫 기대평을 남겨보세요! 이 작품을 기다리는 사람들이 모입니다.</p></div>
      ) : (
        <div className="disc-list">
          {posts.map(p => {
            const author = DS.getUserById(p.authorId)
            const liked = user ? p.likes.includes(user.id) : false
            const mine = user && (user.id === p.authorId || user.role === 'admin')
            return (
              <div key={p.id} className="disc-item fade-in">
                <div className="disc-item-head">
                  <span className="disc-author">{author?.nickname || '탈퇴한 사용자'}</span>
                  <span className="disc-time">{timeAgo(p.createdAt)}</span>
                  {mine && <button className="disc-del" onClick={() => remove(p.id)}>삭제</button>}
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
    </div>
  )
}
