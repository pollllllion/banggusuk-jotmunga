import { useState } from 'react'
import * as DS from '@/api/dataService'
import { fetchSeasonEpisodes, type TmdbSeasonEpisodes } from '@/utils/tmdb'
import type { Content } from '@/types'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** TMDB 의 tv 행인가 — 회차표를 받을 수 있는 작품 (수기 등록·영화는 아니다) */
export function episodeRef(c: Content): { tmdbId: number; seasonNumber: number | null } | null {
  const m = /^tmdb-dr-(\d+)(?:-s(\d+))?$/.exec(c.id)
  if (!m) return null
  return { tmdbId: c.tmdbId || Number(m[1]), seasonNumber: m[2] ? Number(m[2]) : null }
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}(${WEEKDAYS[d.getDay()]})`
}

/**
 * 전체 회차 — 접어 두었다가 누르면 그때 TMDB 에서 받는다.
 *
 * 펼친 채로 두지 않는 이유: 상세정보 표는 한눈에 훑는 자리인데 회차표는 16~100줄이다.
 * 받아 두지 않는 이유: 펼쳐 보는 사람이 일부인데 모든 상세 진입에 요청을 하나씩 더 얹게 된다.
 */
export function EpisodeList({ content }: { content: Content }) {
  const ref = episodeRef(content)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [data, setData] = useState<TmdbSeasonEpisodes | null>(null)
  if (!ref) return null

  const load = async () => {
    setState('loading')
    try {
      setData(await fetchSeasonEpisodes(ref.tmdbId, ref.seasonNumber,
        s => !!DS.getContentById(`tmdb-dr-${ref.tmdbId}-s${s}`)))
      setState('ready')
    } catch { setState('error') }
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && (state === 'idle' || state === 'error')) void load()
  }

  const today = todayKey()
  // '다음'은 오늘 이후 첫 공개일 — 하루에 두 편씩 풀리는 작품이 있어 회차가 아니라 날짜로 잡는다
  const nextDate = data?.episodes.find(e => e.airDate && e.airDate >= today)?.airDate ?? null

  return (
    <div className="ep-list">
      <button className="ep-list-toggle" onClick={toggle} aria-expanded={open}>
        {open ? '회차 접기' : '전체 회차 보기'} <span aria-hidden>{open ? '⌃' : '⌄'}</span>
      </button>
      {open && (
        <div className="ep-list-body">
          {state === 'loading' && <p className="ep-list-msg">불러오는 중…</p>}
          {state === 'error' && (
            <p className="ep-list-msg">회차 정보를 불러오지 못했어요. <button className="btn-text btn-small" onClick={load}>다시 시도</button></p>
          )}
          {state === 'ready' && data && (data.episodes.length === 0 ? (
            <p className="ep-list-msg">아직 등록된 회차 정보가 없어요.</p>
          ) : (
            <>
              {/* 시리즈 행이 뒤 시즌을 보여줄 때만 시즌을 밝힌다 — 시즌 행은 제목에 이미 있다 */}
              {!ref.seasonNumber && data.seasonNumber > 1 && <p className="ep-list-season">시즌 {data.seasonNumber}</p>}
              <ol className="ep-list-rows">
                {data.episodes.map(e => {
                  const aired = !!e.airDate && e.airDate < today
                  const isNext = !!nextDate && e.airDate === nextDate
                  return (
                    <li key={e.number} className={`${aired ? 'aired' : ''} ${isNext ? 'next' : ''}`}>
                      <span className="ep-n">{e.number}화</span>
                      <span className="ep-d">{e.airDate ? fmt(e.airDate) : '날짜 미정'}</span>
                      {isNext && <span className="ep-tag">{e.airDate === today ? '오늘' : '다음'}</span>}
                      {e.name && <span className="ep-t">{e.name}</span>}
                    </li>
                  )
                })}
              </ol>
              <p className="ep-list-src">회차 정보: TMDB · 방송사 사정으로 바뀔 수 있어요</p>
            </>
          ))}
        </div>
      )}
    </div>
  )
}
