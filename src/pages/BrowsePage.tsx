import { useSearchParams } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { ContentCard } from '@/components/content/ContentCard'
import { ReviewBoard } from '@/components/review/ReviewBoard'
import { CONTENT_TYPES, GENRES } from '@/utils/constants'
import type { ContentType } from '@/types'

export function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const type = searchParams.get('type') || ''
  const genre = searchParams.get('genre') || ''
  const sort = searchParams.get('sort') || 'latest'
  const search = searchParams.get('search') || ''

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value); else next.delete(key)
    next.delete('search')
    setSearchParams(next)
  }

  let contents = DS.getContents()
  if (search) {
    const q = search.toLowerCase()
    contents = contents.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.creators.some(cr => cr.toLowerCase().includes(q)) ||
      c.genres.some(g => g.toLowerCase().includes(q)))
  }
  if (type) contents = contents.filter(c => c.type === (type as ContentType))
  if (genre) contents = contents.filter(c => c.genres.includes(genre))

  if (sort === 'top') contents = [...contents].sort((a, b) => b.avgRating - a.avgRating)
  else if (sort === 'reviews') contents = [...contents].sort((a, b) => b.reviewCount - a.reviewCount)
  else contents = [...contents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // 영화탭은 포스터 그리드 대신 자유게시판(리뷰글 목록) 형식
  const isBoard = type === 'movie'
  const contentIds = new Set(contents.map(c => c.id))
  let reviews = isBoard ? DS.getReviews().filter(r => contentIds.has(r.contentId)) : []
  if (isBoard) {
    if (sort === 'top') reviews = [...reviews].sort((a, b) => b.rating - a.rating)
    else if (sort === 'reviews') reviews = [...reviews].sort((a, b) => (b.likes.length - b.dislikes.length) - (a.likes.length - a.dislikes.length))
    else reviews = [...reviews].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  return (
    <>
      <div className="feed-header">
        <h2 className="feed-title">{search ? `"${search}" 검색 결과` : isBoard ? '🎬 영화 리뷰 게시판' : '작품 둘러보기'}</h2>
        <div className="feed-sort">
          <button className={sort === 'latest' ? 'active' : ''} onClick={() => setParam('sort', 'latest')}>최신</button>
          <button className={sort === 'top' ? 'active' : ''} onClick={() => setParam('sort', 'top')}>평점순</button>
          <button className={sort === 'reviews' ? 'active' : ''} onClick={() => setParam('sort', 'reviews')}>{isBoard ? '추천순' : '리뷰순'}</button>
        </div>
      </div>

      {/* 타입 필터 */}
      <div className="filter-bar">
        <button className={`filter-btn ${!type ? 'active' : ''}`} onClick={() => setParam('type', '')}>전체</button>
        {CONTENT_TYPES.map(t => (
          <button key={t.code} className={`filter-btn ${type === t.code ? 'active' : ''}`} onClick={() => setParam('type', t.code)}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* 장르 필터 */}
      <div className="filter-bar">
        <button className={`filter-btn ${!genre ? 'active' : ''}`} onClick={() => setParam('genre', '')}>장르 전체</button>
        {GENRES.map(g => (
          <button key={g} className={`filter-btn ${genre === g ? 'active' : ''}`} onClick={() => setParam('genre', g)}>{g}</button>
        ))}
      </div>

      {isBoard ? (
        !reviews.length ? (
          <div className="empty-state fade-in"><p>아직 등록된 영화 리뷰가 없습니다. 첫 리뷰를 남겨보세요!</p></div>
        ) : (
          <ReviewBoard reviews={reviews} />
        )
      ) : !contents.length ? (
        <div className="empty-state fade-in"><p>조건에 맞는 작품이 없습니다.</p></div>
      ) : (
        <div className="content-grid">
          {contents.map(c => <ContentCard key={c.id} content={c} />)}
        </div>
      )}
    </>
  )
}
