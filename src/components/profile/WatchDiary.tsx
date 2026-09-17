import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { useToastStore } from '@/components/ui/Toast'
import { WatchLogModal } from './WatchLogModal'
import { clickable } from '@/utils/a11y'
import type { WatchLog } from '@/types'
import '@/styles/diary.css'

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const todayStr = () => { const t = new Date(); return keyOf(t.getFullYear(), t.getMonth(), t.getDate()) }
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
/** 한 칸에 포스터는 넷까지 — 그 이상은 '+N' 으로 */
const MAX_IN_CELL = 4

/**
 * 나만의 캘린더 — 본 날 칸에 포스터가 채워지는 달력 + 고른 날의 기록.
 *
 * 내 피드(editable)에서는 쓰고 고치고, 남의 프로필에서는 공개로 둔 기록만 본다
 * (RLS 가 비공개 줄을 아예 안 준다). 찜 달력(CalendarPage)과 같은 포스터 칸 방식이다.
 */
export function WatchDiary({ userId, editable, title }: {
  userId: string
  editable: boolean
  title: string
}) {
  const navigate = useNavigate()
  const toast = useToastStore(s => s.show)
  const [logs, setLogs] = useState<WatchLog[] | undefined>(() => DS.getWatchLogs(userId))
  const [cursor, setCursor] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() } })
  const [selected, setSelected] = useState(todayStr)
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
        setSelected(last.watchedOn)
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
  const dayLogs = byDay.get(selected) ?? []

  const remove = async (log: WatchLog) => {
    const t = DS.getContentById(log.contentId)?.title || '이 기록'
    if (!window.confirm(`'${t}' 기록을 지울까요?`)) return
    try { await DS.deleteWatchLog(log); toast('기록을 지웠어요.'); refresh() }
    catch (e: any) { toast(e?.message || '지우지 못했어요.') }
  }

  const togglePublic = async (log: WatchLog) => {
    try { await DS.saveWatchLog({ ...log, isPublic: !log.isPublic }); refresh() }
    catch (e: any) { toast(e?.message || '바꾸지 못했어요.') }
  }

  const [sy, sm, sd] = selected.split('-').map(Number)

  return (
    <section className="diary">
      <div className="feed-header" style={{ marginTop: 24 }}>
        <h2 className="feed-title">{title}</h2>
        {editable && (
          <span className="feed-sec-right">
            <button className="btn-text btn-small" onClick={() => setEditing({ day: selected })}>+ 기록하기</button>
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
            return (
              <div
                key={k}
                className={`diary-cell ${here.length ? 'has' : ''} ${k === today ? 'today' : ''} ${k === selected ? 'sel' : ''}`}
                {...clickable(() => setSelected(k), `${cursor.m + 1}월 ${d}일${here.length ? ` 기록 ${here.length}개` : ''}`)}
              >
                <span className="diary-day">{d}</span>
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

      {/* 고른 날의 기록 — 일기장 한 쪽 */}
      <div className="diary-day-panel">
        <div className="diary-day-head">
          <strong>{sm}월 {sd}일</strong>
          <span>{WEEK[new Date(sy, sm - 1, sd).getDay()]}요일</span>
          {editable && (
            <button className="btn-text btn-small" onClick={() => setEditing({ day: selected })}>+ 이날 기록</button>
          )}
        </div>
        {!logs ? (
          <p className="diary-empty">불러오는 중…</p>
        ) : !dayLogs.length ? (
          <p className="diary-empty">{editable ? '이날 남긴 기록이 없어요.' : '이날은 공개한 기록이 없어요.'}</p>
        ) : dayLogs.map(l => {
          const c = DS.getContentById(l.contentId)
          const meta = [l.place, l.companions, l.progress].filter(Boolean)
          return (
            <article key={l.id} className="diary-entry">
              {c?.posterUrl
                ? <img className="diary-entry-poster" src={c.posterUrl} alt="" loading="lazy" {...clickable(() => navigate(`/content/${c.id}`), c.title)} />
                : <div className="diary-entry-poster none" />}
              <div className="diary-entry-body">
                <div className="diary-entry-top">
                  <span className="diary-entry-title" {...clickable(() => c && navigate(`/content/${c.id}`))}>{c?.title ?? '지워진 작품'}</span>
                  {editable && (
                    <button className={`feed-public ${l.isPublic ? 'on' : ''}`} onClick={() => togglePublic(l)}
                      title={l.isPublic ? '남에게 보입니다. 누르면 비공개로 바꿔요' : '나만 봅니다. 누르면 공개로 바꿔요'}>
                      {l.isPublic ? '공개' : '비공개'}
                    </button>
                  )}
                </div>
                {meta.length > 0 && <div className="diary-entry-meta">{meta.join(' · ')}</div>}
                {l.memo && <p className="diary-entry-memo">{l.memo}</p>}
                {editable && (
                  <div className="diary-entry-actions">
                    <button className="btn-text btn-small" onClick={() => setEditing({ log: l, day: l.watchedOn })}>고치기</button>
                    <button className="btn-text btn-small" onClick={() => remove(l)}>지우기</button>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {editing && (
        <WatchLogModal
          userId={userId}
          day={editing.day}
          initial={editing.log}
          onClose={() => setEditing(null)}
          onSaved={log => {
            refresh()
            // 다른 날로 저장했으면 그날로 옮겨 가서 방금 쓴 기록이 보이게
            setSelected(log.watchedOn)
            setCursor({ y: Number(log.watchedOn.slice(0, 4)), m: Number(log.watchedOn.slice(5, 7)) - 1 })
          }}
        />
      )}
    </section>
  )
}
