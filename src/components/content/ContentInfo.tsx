import { castProfileUrl } from '@/utils/ott'
import type { Content } from '@/types'
import '@/styles/calendar.css'

/** 편성 요약: 시즌·회차·러닝타임을 한 줄로 */
function scheduleSummary(c: Content): string | null {
  const parts: string[] = []
  if (c.numberOfSeasons && c.numberOfSeasons > 1) parts.push(`시즌 ${c.numberOfSeasons}`)
  if (c.numberOfEpisodes) parts.push(`총 ${c.numberOfEpisodes}부작`)
  if (c.runtime) parts.push(c.type === 'movie' ? `${c.runtime}분` : `회차당 ${c.runtime}분`)
  return parts.length ? parts.join(' · ') : null
}

/**
 * 작품 상세 정보 (감독/연출·채널·편성·구성·장르·평점 + 출연진).
 * 캘린더 모달과 작품 상세 페이지가 동일한 정보를 쓰도록 공용화.
 */
export function ContentInfo({ content }: { content: Content }) {
  const cast = content.castMembers ?? []
  const networks = content.networks ?? []
  const sched = scheduleSummary(content)
  const hasRating = typeof content.voteAverage === 'number' && content.voteAverage > 0
  const hasGrid = (content.creators?.length ?? 0) > 0 || networks.length > 0 || !!sched ||
    (content.genres?.length ?? 0) > 0 || hasRating
  if (!hasGrid && !cast.length) return null

  return (
    <div className="content-info">
      <dl className="cal-detail-grid">
        {content.creators && content.creators.length > 0 && (
          <>
            <dt>{content.type === 'movie' ? '감독' : '연출·제작'}</dt>
            <dd>{content.creators.join(', ')}</dd>
          </>
        )}
        {networks.length > 0 && (
          <>
            <dt>채널·편성</dt>
            <dd className="cal-detail-networks">
              {networks.map(n => <span key={n.name} className="cal-net">{n.name}</span>)}
            </dd>
          </>
        )}
        {sched && (<><dt>구성</dt><dd>{sched}</dd></>)}
        {content.genres && content.genres.length > 0 && (
          <><dt>장르</dt><dd>{content.genres.join(' · ')}</dd></>
        )}
        {hasRating && (
          <><dt>평점</dt><dd>⭐ {content.voteAverage!.toFixed(1)} <span className="cal-detail-sub">/ 10 (TMDB)</span></dd></>
        )}
      </dl>

      {cast.length > 0 && (
        <div className="cal-cast">
          <div className="cal-cast-label">출연</div>
          <div className="cal-cast-list">
            {cast.map((p, i) => {
              const url = castProfileUrl(p.profilePath)
              return (
                <div className="cal-cast-item" key={p.name + i}>
                  <div className="cal-cast-photo">
                    {url ? <img src={url} alt={p.name} loading="lazy" /> : <span>{p.name.slice(0, 1)}</span>}
                  </div>
                  <div className="cal-cast-name">{p.name}</div>
                  {p.character && <div className="cal-cast-role">{p.character}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
