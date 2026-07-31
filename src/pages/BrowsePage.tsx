import { useSearchParams } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { ContentCard } from '@/components/content/ContentCard'
import { ReviewBoard } from '@/components/review/ReviewBoard'
import { CONTENT_TYPES, GENRES } from '@/utils/constants'
import { Seo } from '@/components/seo/Seo'
import type { ContentType } from '@/types'

export function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const type = searchParams.get('type') || ''
  const genre = searchParams.get('genre') || ''
  const search = searchParams.get('search') || ''
  // 검색 중엔 사용자가 정렬을 직접 고르기 전까지 관련도 순(searchContents 결과 순서)을 유지한다.
  const sort = searchParams.get('sort') || (search ? 'relevance' : 'latest')

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value); else next.delete(key)
    // 타입·장르를 바꾸면 검색을 벗어나지만, 정렬은 검색 결과 안에서의 조작이라 검색어를 유지한다.
    if (key !== 'sort') next.delete('search')
    setSearchParams(next)
  }

  // 캘린더에서 숨긴 작품(TMDB 전체 동기화에서 밀려난 옛 행)은 목록에서도 뺀다.
  // 캘린더는 이미 제외하고 있었는데 여기만 빠져 있어 숨긴 작품이 노출됐다. sitemap 기준과도 일치시킨다.
  // 검색은 헤더 통합검색과 같은 규칙(공백·문장부호 무시)을 쓴다 — searchContents 하나로 통일.
  let contents = search
    ? DS.searchContents(search, Infinity)
    : DS.getContents().filter(c => !c.hidden)
  if (type) contents = contents.filter(c => c.type === (type as ContentType))
  if (genre) contents = contents.filter(c => c.genres.includes(genre))

  if (sort === 'top') contents = [...contents].sort((a, b) => b.avgRating - a.avgRating)
  else if (sort === 'reviews') contents = [...contents].sort((a, b) => b.reviewCount - a.reviewCount)
  else if (sort !== 'relevance') contents = [...contents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // 영화탭은 포스터 그리드 대신 자유게시판(리뷰글 목록) 형식
  const isBoard = type === 'movie'
  const contentIds = new Set(contents.map(c => c.id))
  let reviews = isBoard ? DS.getReviews().filter(r => contentIds.has(r.contentId)) : []
  if (isBoard) {
    if (sort === 'top') reviews = [...reviews].sort((a, b) => b.rating - a.rating)
    else if (sort === 'reviews') reviews = [...reviews].sort((a, b) => (b.likes.length - b.dislikes.length) - (a.likes.length - a.dislikes.length))
    else reviews = [...reviews].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  // 타입·장르는 색인 가치가 있는 조합이라 canonical 에 남기고,
  // 정렬(sort)과 검색(search)은 같은 목록의 변형일 뿐이라 canonical 에서 뺀다.
  const typeLabel = CONTENT_TYPES.find(t => t.code === type)?.label
  const seoTitle = search ? `"${search}" 검색 결과`
    : isBoard ? '영화 리뷰 게시판'
    : typeLabel ? `${typeLabel}${genre ? ` · ${genre}` : ''} 전체보기`
    : genre ? `${genre} 작품 모아보기`
    : '작품 둘러보기'
  const canonicalQuery = new URLSearchParams()
  if (type) canonicalQuery.set('type', type)
  if (genre) canonicalQuery.set('genre', genre)
  const canonicalPath = `/browse${canonicalQuery.toString() ? `?${canonicalQuery}` : ''}`

  return (
    <>
      <Seo
        path={canonicalPath}
        title={seoTitle}
        description={`${seoTitle} — 공개일·평점·리뷰를 한 곳에서. 넷플릭스·디즈니+·티빙·웨이브 등 OTT 작품과 극장 개봉작, 웹툰·웹소설까지 ${contents.length}편을 모아봤습니다.`}
        noindex={!!search}
      />
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
