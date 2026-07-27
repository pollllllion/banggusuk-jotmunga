import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import * as DS from '@/api/dataService'
import { ContentCard } from '@/components/content/ContentCard'
import { Seo } from '@/components/seo/Seo'

export function BookmarksPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  if (!user) return null

  const bookmarks = DS.getUserBookmarks(user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const contents = bookmarks.map(b => DS.getContentById(b.contentId)).filter(Boolean)

  return (
    <>
      <Seo title="찜한 작품" noindex />
      <div className="feed-header">
        <h2 className="feed-title">찜한 작품 ({contents.length})</h2>
      </div>
      {!contents.length ? (
        <div className="empty-state fade-in">
          <p>찜한 작품이 없습니다.</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/browse')}>작품 둘러보기</button>
        </div>
      ) : (
        <div className="content-grid">
          {contents.map(c => <ContentCard key={c!.id} content={c!} />)}
        </div>
      )}
    </>
  )
}
