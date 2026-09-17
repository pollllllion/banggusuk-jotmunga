import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { useToastStore } from '@/components/ui/Toast'
import { WatchLogModal, LockIcon, GlobeIcon } from './WatchLogModal'
import { clickable } from '@/utils/a11y'
import { holidayOf } from '@/shared/holidays.mjs'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import type { WatchLog } from '@/types'
import '@/styles/diary.css'

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const todayStr = () => { const t = new Date(); return keyOf(t.getFullYear(), t.getMonth(), t.getDate()) }
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
/** 한 칸에 포스터는 넷까지 — 그 이상은 '+N' 으로 */
const MAX_IN_CELL = 4

/**
 * 작품일지 — 본 날 칸에 포스터가 채워지는 달력.
 *
 * 달력 아래에 그날 기록을 펼치던 칸은 없앴다(2026-09-17). 날짜를 누르면 창으로 연다:
 *   - 기록이 있는 날 → 그날 기록 창(보기 · 내 일지면 고치기·지우기·공개 전환·더 쓰기)
 *   - 기록이 없는 날 → 내 일지면 바로 쓰기 창, 남의 일지면 아무 일도 없다
 * 찜 달력(CalendarPage)과 같은 포스터 칸 방식이다. 남의 일지는 공개 기록만 온다(RLS).
 */
export function WatchDiary({ userId, editable, title }: {
  userId: string
  editable: boolean
  title: string
}) {
  const toast = useToastStore(s => s.show)
  const [logs, setLogs] = useState<WatchLog[] | undefined>(() => DS.getWatchLogs(userId))
  const [cursor, setCursor] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() } })
  /** 기록 보기 창이 열린 날 */
  const [viewDay, setViewDay] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ log?: WatchLog; day: string } | null>(null)

  useEffect(() => {
    let alive = true
    void DS.loadWatchLogs(userId).then(list => {
      if (!alive) return
      setLogs(list)
      // 남의 프로필은 이번 달이 비어 있기 쉽다 — 마지막 기록이 있는 달을 먼저 보여준다
      const thisMonth = todayStr().slice(0, 7)
      const last = list[list.length - 1]
      if (!editable && last && !list.some(l => l.watchedOn.startsWith(thisMonth))) {
        setCursor({ y: Number(last.watchedOn.slice(0, 4)), m: Number(last.watchedOn.slice(5, 7)) - 1 })
      }
    })
    return () => { alive = false }
  }, [userId, editable])

  const refresh = () => setLogs([...(DS.getWatchLogs(userId) ?? [])])

  // 남의 프로필에서 공개 기록이 하나도 없으면 칸을 통째로 안 그린다
  if (!editable && (!logs || !logs.length)) return null

  const all = logs ?? []
  const byDay = new Map<string, WatchLog[]>()
  for (const l of all) byDay.set(l.watchedOn, [...(byDay.get(l.watchedOn) ?? []), l])

  const monthKey = `${cursor.y}-${pad(cursor.m + 1)}`
  const monthCount = all.filter(l => l.watchedOn.startsWith(monthKey)).length
  const firstDow = new Date(cursor.y, cursor.m, 1).getDay()
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)

  const shift = (d: number) => setCursor(c => {
    const t = new Date(c.y, c.m + d, 1)
    return { y: t.getFullYear(), m: t.getMonth() }
  })
  const today = todayStr()

  /** 보기 창에서 쓰기 창으로 넘어간다 — 두 창을 겹쳐 두지 않는다 */
  const openEditor = (day: string, log?: WatchLog) => { setViewDay(null); setEditing({ day, log }) }

  return (
    <section className="diary">
      <div className="feed-header" style={{ marginTop: 24 }}>
        <h2 className="feed-title">{title}</h2>
        {editable && (
          <span className="feed-sec-right">
            <button className="btn-text btn-small" onClick={() => openEditor(today)}>+ 기록하기</button>
          </span>
        )}
      </div>

      <div className="diary-cal fade-in">
        <div className="diary-monthbar">
          <button className="diary-navbtn" onClick={() => shift(-1)} aria-label="이전 달">‹</button>
          <span className="diary-month">{cursor.y}년 {cursor.m + 1}월</span>
          <button className="diary-navbtn" onClick={() => shift(1)} aria-label="다음 달">›</button>
          <span className="diary-count">{monthCount ? `${monthCount}편 봤어요` : '기록 없음'}</span>
        </div>

        <div className="diary-grid">
          {WEEK.map((w, i) => <div key={w} className={`diary-dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>{w}</div>)}
          {cells.map((d, i) => {
            if (d == null) return <div key={`b${i}`} className="diary-cell blank" />
            const k = keyOf(cursor.y, cursor.m, d)
            const here = byDay.get(k) ?? []
            const shown = here.slice(0, MAX_IN_CELL)
            const holiday = holidayOf(k) as string | null
            // 일요일·공휴일은 빨강, 토요일은 파랑 — 공개 캘린더(CalendarPage)와 같은 규칙
            const dow = (firstDow + d - 1) % 7
            const red = dow === 0 || !!holiday
            const clickableDay = here.length > 0 || editable
            const open = () => {
              if (here.length) setViewDay(k)
              else if (editable) openEditor(k)
            }
            const label = [`${cursor.m + 1}월 ${d}일`, holiday, here.length ? `기록 ${here.length}개 보기` : editable ? '기록하기' : null]
              .filter(Boolean).join(' · ')
            return (
              <div
                key={k}
                className={`diary-cell ${here.length ? 'has' : ''} ${k === today ? 'today' : ''} ${red ? 'sun' : dow === 6 ? 'sat' : ''} ${clickableDay ? '' : 'idle'}`}
                title={label}
                {...(clickableDay ? clickable(open, label) : {})}
              >
                <span className="diary-day">{d}</span>
                {holiday && <span className="diary-holiday">{holiday}</span>}
                {shown.length > 0 && (
                  <div className={`diary-posters n${shown.length}`}>
                    {shown.map(l => {
                      const c = DS.getContentById(l.contentId)
                      return c?.posterUrl
                        ? <span key={l.id} className="diary-poster" style={{ backgroundImage: `url(${c.posterUrl})` }} />
                        : <span key={l.id} className="diary-poster none">{c?.title?.slice(0, 4) ?? '?'}</span>
                    })}
                  </div>
                )}
                {here.length > MAX_IN_CELL && <span className="diary-more">+{here.length - MAX_IN_CELL}</span>}
              </div>
            )
          })}
        </div>
      </div>

      {viewDay && (
        <DayLogsModal
          day={viewDay}
          logs={byDay.get(viewDay) ?? []}
          editable={editable}
          onClose={() => setViewDay(null)}
          onAdd={() => openEditor(viewDay)}
          onEdit={log => openEditor(log.watchedOn, log)}
          onChanged={() => {
            refresh()
            // 마지막 기록을 지웠으면 빈 창을 남기지 않는다
            if (!(DS.getWatchLogs(userId) ?? []).some(l => l.watchedOn === viewDay)) setViewDay(null)
          }}
          toast={toast}
        />
      )}

      {editing && (
        <WatchLogModal
          userId={userId}
          day={editing.day}
          initial={editing.log}
          onClose={() => setEditing(null)}
          onSaved={log => {
            refresh()
            // 저장한 날로 달력을 옮기고 그날 기록 창을 열어 방금 쓴 것을 보여준다
            setCursor({ y: Number(log.watchedOn.slice(0, 4)), m: Number(log.watchedOn.slice(5, 7)) - 1 })
            setViewDay(log.watchedOn)
          }}
        />
      )}
    </section>
  )
}

/** 그날 기록 창 — 보기 · 내 일지면 고치기·지우기·공개 전환·더 쓰기 */
function DayLogsModal({ day, logs, editable, onClose, onAdd, onEdit, onChanged, toast }: {
  day: string
  logs: WatchLog[]
  editable: boolean
  onClose: () => void
  onAdd: () => void
  onEdit: (log: WatchLog) => void
  onChanged: () => void
  toast: (msg: string) => void
}) {
  const navigate = useNavigate()
  useEscapeKey(true, onClose)
  const [y, m, d] = day.split('-').map(Number)
  const holiday = holidayOf(day) as string | null

  const remove = async (log: WatchLog) => {
    const t = DS.getContentById(log.contentId)?.title || '이 기록'
    if (!window.confirm(`'${t}' 기록을 지울까요?`)) return
    try { await DS.deleteWatchLog(log); toast('기록을 지웠어요.'); onChanged() }
    catch (e: any) { toast(e?.message || '지우지 못했어요.') }
  }

  const togglePublic = async (log: WatchLog) => {
    try {
      await DS.saveWatchLog({ ...log, isPublic: !log.isPublic })
      toast(log.isPublic ? '나만 보기로 바꿨어요.' : '전체 공개로 바꿨어요.')
      onChanged()
    }
    catch (e: any) { toast(e?.message || '바꾸지 못했어요.') }
  }

  return (
    <div className="modal-overlay show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal diary-modal" style={{ maxWidth: 480, width: '92vw' }} role="dialog" aria-label={`${m}월 ${d}일 기록`}>
        <button className="modal-close" onClick={onClose} aria-label="닫기">✕</button>
        <h3 className="diary-day-title">
          {y}년 {m}월 {d}일
          <span className={holiday || new Date(y, m - 1, d).getDay() === 0 ? 'red' : ''}>
            {WEEK[new Date(y, m - 1, d).getDay()]}요일{holiday ? ` · ${holiday}` : ''}
          </span>
        </h3>

        <div className="diary-day-list">
          {logs.map(l => {
            const c = DS.getContentById(l.contentId)
            const meta = [l.place, l.companions, l.progress].filter(Boolean)
            const go = () => { if (c) { onClose(); navigate(`/content/${c.id}`) } }
            return (
              <article key={l.id} className="diary-entry">
                {c?.posterUrl
                  ? <img className="diary-entry-poster" src={c.posterUrl} alt="" loading="lazy" {...clickable(go, c.title)} />
                  : <div className="diary-entry-poster none" />}
                <div className="diary-entry-body">
                  <div className="diary-entry-top">
                    <span className="diary-entry-title" {...clickable(go)}>{c?.title ?? '지워진 작품'}</span>
                    {/* 지금 상태는 누를 수 없는 표시로만, 바꾸기는 아래 글자 버튼으로 — 한 버튼이
                        상태와 동작을 같이 말하면 '공개'가 지금인지 누르면인지 헷갈린다 */}
                    {editable && (
                      <span className={`diary-vis ${l.isPublic ? 'public' : ''}`}>
                        {l.isPublic ? <><GlobeIcon /> 전체 공개</> : <><LockIcon /> 나만 보기</>}
                      </span>
                    )}
                  </div>
                  {meta.length > 0 && <div className="diary-entry-meta">{meta.join(' · ')}</div>}
                  {l.memo && <p className="diary-entry-memo">{l.memo}</p>}
                  {editable && (
                    <div className="diary-entry-actions">
                      <button className="btn-text btn-small" onClick={() => onEdit(l)}>고치기</button>
                      <button className="btn-text btn-small" onClick={() => togglePublic(l)}>
                        {l.isPublic ? '나만 보기로 바꾸기' : '전체 공개로 바꾸기'}
                      </button>
                      <button className="btn-text btn-small" onClick={() => remove(l)}>지우기</button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>닫기</button>
          {editable && <button className="btn btn-primary" onClick={onAdd}>+ 이날 기록 더하기</button>}
        </div>
      </div>
    </div>
  )
}
