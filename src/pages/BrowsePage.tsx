import { useSearchParams } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { ContentCard } from '@/components/content/ContentCard'
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
    if (key !== 'sort') next.delete('search')
    setSearchParams(next)
  }

  let contents = search
    ? DS.searchContents(search, Infinity)
    : DS.getContents().filter(c => !c.hidden)
  if (type) contents = contents.filter(c => c.type === (type as ContentType))
  if (genre) contents = contents.filter(c => c.genres.includes(genre))

  if (sort === 'top') contents = [...contents].sort((a, b) => b.avgRating - a.avgRating)
  else if (sort === 'reviews') contents = [...contents].sort((a, b) => b.reviewCount - a.reviewCount)
  else if (sort !== 'relevance') contents = [...contents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const typeLabel = CONTENT_TYPES.find(t => t.code === type)?.label
  const seoTitle = search ? `"${search}" 검색 결과`
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
        description={`${seoTitle} — 공개일·평점·별점을 한 곳에서. 넷플릭스·디즈니+·티빙·웨이브 등 OTT 작품과 극장 개봉작, 웹툰·웹소설까지 ${contents.length}편을 모아봤습니다.`}
        noindex={!!search}
      />
      <div className="feed-header">
        <h2 className="feed-title">{search ? `"${search}" 검색 결과` : '작품 둘러보기'}</h2>
        <div className="feed-sort">
          <button className={sort === 'latest' ? 'active' : ''} onClick={() => setParam('sort', 'latest')}>최신</button>
          <button className={sort === 'top' ? 'active' : ''} onClick={() => setParam('sort', 'top')}>평점순</button>
          <button className={sort === 'reviews' ? 'active' : ''} onClick={() => setParam('sort', 'reviews')}>별점순</button>
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

      {!contents.length ? (
        <div className="empty-state fade-in"><p>조건에 맞는 작품이 없습니다.</p></div>
      ) : (
        <div className="content-grid">
          {contents.map(c => <ContentCard key={c.id} content={c} />)}
        </div>
      )}
    </>
  )
}
