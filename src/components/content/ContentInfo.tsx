import { Fragment } from 'react'
import { castProfileUrl, channelNames, nextEpisodeOf } from '@/utils/ott'
import { formatAudience } from '@/utils/helpers'
import { shortPlatformByName, trustedEpisodeCount, isShortForm } from '@/shared/shortForm.mjs'
import { EpisodeList, episodeRef } from './EpisodeList'
import type { Content } from '@/types'
import type { DetailState } from '@/hooks/useContentDetail'
import '@/styles/calendar.css'

/** 편성 요약: 시즌·회차·러닝타임을 한 줄로 */
function scheduleSummary(c: Content): string | null {
  const parts: string[] = []
  if (c.numberOfSeasons && c.numberOfSeasons > 1) parts.push(`시즌 ${c.numberOfSeasons}`)
  // 숏폼은 TMDB 회차 수가 1~2화로 틀려 있는 일이 흔하다 — 모르면 안 쓴다 (shared/shortForm.mjs)
  const eps = trustedEpisodeCount(c)
  if (eps) parts.push(`총 ${eps}부작`)
  if (c.runtime) parts.push(c.type === 'movie' ? `${c.runtime}분` : `회차당 ${c.runtime}분`)
  return parts.length ? parts.join(' · ') : null
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 다음 회차 한 줄: "9. 24(목) · 7화" (+ 오늘/내일이면 그 말을 앞에) */
function nextEpisodeLabel(c: Content): string | null {
  const now = new Date()
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const ne = nextEpisodeOf(c, key(now))
  if (!ne) return null
  const d = new Date(ne.date + 'T00:00:00')
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const when = ne.date === key(now) ? '오늘 · ' : ne.date === key(tomorrow) ? '내일 · ' : ''
  return `${when}${d.getMonth() + 1}. ${d.getDate()}(${WEEKDAYS[d.getDay()]})${ne.number ? ` · ${ne.number}화` : ''}`
}

/**
 * 작품 상세 정보 (감독/연출·채널·편성·구성·장르·평점 + 출연진).
 * 캘린더 모달과 작품 상세 페이지가 동일한 정보를 쓰도록 공용화.
 *
 * detail 은 지연 로드 상태(useContentDetail). 이 정보의 절반(채널·구성·평점·출연진)은
 * 시작 로드에 없는 컬럼이라, 아직 안 온 것을 '없음'으로 그리면 정보가 사라진 것처럼 보인다.
 */
export function ContentInfo({ content, detail = 'ready' }: { content: Content; detail?: DetailState }) {
  if (detail === 'loading') return <ContentInfoSkeleton />
  const cast = content.castMembers ?? []
  // 방영사가 없으면 OTT 로 대신한다 (utils/ott 의 channelNames)
  const networks = channelNames(content)
  const sched = scheduleSummary(content)
  const nextEp = nextEpisodeLabel(content)
  const hasRating = typeof content.voteAverage === 'number' && content.voteAverage > 0
  const hasAudience = typeof content.koficAudience === 'number' && content.koficAudience > 0
  const hasGrid = (content.creators?.length ?? 0) > 0 || networks.length > 0 || !!sched || !!nextEp ||
    (content.genres?.length ?? 0) > 0 || hasRating || hasAudience
  const hasEpisodes = !!episodeRef(content)
  if (!hasGrid && !cast.length && !hasEpisodes) return null

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
            <dt>{isShortForm(content) ? '플랫폼' : '채널·편성'}</dt>
            <dd className="cal-detail-networks">
              {networks.map(n => {
                const sp = shortPlatformByName(n)
                return sp?.url
                  ? <a key={n} className="cal-net" href={sp.url} target="_blank" rel="noopener noreferrer">{sp.label} ↗</a>
                  : <span key={n} className="cal-net">{sp?.label || n}</span>
              })}
            </dd>
          </>
        )}
        {sched && (<><dt>구성</dt><dd>{sched}</dd></>)}
        {/* 방영 중인 시리즈만 — 값은 scripts/sync-next-episodes.mjs 가 매일 TMDB 에서 받아 적는다 */}
        {nextEp && (<><dt>다음 회차</dt><dd className="cal-detail-nextep">{nextEp}</dd></>)}
        {content.genres && content.genres.length > 0 && (
          <><dt>장르</dt><dd>{content.genres.join(' · ')}</dd></>
        )}
        {hasRating && (
          <><dt>평점</dt><dd>{content.voteAverage!.toFixed(1)} <span className="cal-detail-sub">/ 10 (TMDB)</span></dd></>
        )}
        {/* 누적관객 — 한국에서 극장 개봉한 영화만 있다. 평점이 남의 취향이라면 이건 사실에 가깝고,
            출처가 정부기관(영화진흥위원회)이라 숫자를 그대로 믿고 쓸 수 있다.
            값은 scripts/sync-kofic.mjs 가 매일 받아 적는다(상세 전용 칸이라 모달·작품방에서만 보인다) */}
        {hasAudience && (
          <><dt>누적관객</dt><dd>{formatAudience(content.koficAudience!)} <span className="cal-detail-sub">(영화진흥위원회)</span></dd></>
        )}
      </dl>

      {/* 전체 회차 — 접혀 있다가 누르면 그때 받는다 (TV 작품만) */}
      {hasEpisodes && <EpisodeList key={content.id} content={content} />}

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

/** 상세 컬럼이 오는 동안 자리를 잡아 둔다 — 레이아웃이 튀지 않게 실제 구조와 같은 높이로 */
function ContentInfoSkeleton() {
  return (
    <div className="content-info" aria-busy="true">
      <dl className="cal-detail-grid">
        {[0, 1, 2].map(i => (
          <Fragment key={i}>
            <dt><span className="sk sk-line" style={{ width: 48 }} /></dt>
            <dd><span className="sk sk-line" style={{ width: i === 1 ? 180 : 120 }} /></dd>
          </Fragment>
        ))}
      </dl>
      <div className="cal-cast">
        <div className="cal-cast-label">출연</div>
        <div className="cal-cast-list">
          {[0, 1, 2, 3, 4].map(i => (
            <div className="cal-cast-item" key={i}>
              <div className="cal-cast-photo sk" />
              <div className="cal-cast-name"><span className="sk sk-line" style={{ width: 44 }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
