import { useEffect, useRef, useState } from 'react'
import { searchPeople, type TmdbPerson } from '@/utils/tmdb'
import {
  MAX_PEOPLE_PER_ROLE, ROLE_LABEL, addPerson, personPhotoUrl, roleOfDepartment, samePerson,
} from '@/utils/people'
import type { FavoritePerson, PersonRole } from '@/types'

const DEPARTMENT_KO: Record<string, string> = {
  Acting: '배우', Directing: '감독', Writing: '작가', Production: '제작', Creator: '크리에이터',
  Camera: '촬영', Editing: '편집', Sound: '음악·음향', Art: '미술', 'Costume & Make-Up': '의상·분장',
  'Visual Effects': '시각효과', Crew: '스태프', Lighting: '조명',
}

const ROLES: PersonRole[] = ['maker', 'actor']

/**
 * 좋아하는 감독·작가·배우 고르기 — 이름을 치면 TMDB 인물이 사진·대표작과 함께 뜬다.
 *
 * 입력칸은 하나다. 고르는 순간 TMDB 의 직군으로 감독·작가 / 배우가 갈린다(칩의 ⇄ 로 옮길 수 있다 —
 * 연출도 하는 배우가 있다). 검색에 안 나오는 사람은 이름 그대로 넣을 수 있어야 한다:
 * TMDB 에 한글 이름이 안 적힌 사람이 실제로 있다('포핸즈' 연출 신이원 — 2026-09-19 확인).
 */
export function PeoplePicker({ people, onChange }: { people: FavoritePerson[]; onChange: (next: FavoritePerson[]) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<TmdbPerson[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  // 작품 검색(RegisterWatchedModal)과 같은 방식 — 타이핑이 멈추면 검색, 늦게 온 응답은 버린다
  useEffect(() => {
    const query = q.trim()
    setActiveIdx(-1)
    if (query.length < 2) { setResults([]); setSearched(false); setLoading(false); return }
    let alive = true
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const r = await searchPeople(query)
        if (alive) { setResults(r); setSearched(true) }
      } catch {
        if (alive) { setResults([]); setSearched(true) }
      } finally {
        if (alive) setLoading(false)
      }
    }, 300)
    return () => { alive = false; clearTimeout(timer) }
  }, [q])

  useEffect(() => {
    if (activeIdx >= 0) listRef.current?.querySelector('.tmdb-result.active')?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const shown = results.filter(r => !people.some(p => samePerson(p, { name: r.name, tmdbId: r.tmdbId })))
  const full = (role: PersonRole) => people.filter(p => p.role === role).length >= MAX_PEOPLE_PER_ROLE

  const pick = (r: TmdbPerson) => {
    onChange(addPerson(people, { name: r.name, role: roleOfDepartment(r.department), tmdbId: r.tmdbId, profilePath: r.profilePath }))
    setQ('')
  }
  const addManual = (role: PersonRole) => {
    onChange(addPerson(people, { name: q.trim(), role, tmdbId: null, profilePath: null }))
    setQ('')
  }
  const remove = (p: FavoritePerson) => onChange(people.filter(x => !samePerson(x, p)))
  const swap = (p: FavoritePerson) => {
    const to: PersonRole = p.role === 'actor' ? 'maker' : 'actor'
    if (full(to)) return
    onChange(people.map(x => (samePerson(x, p) ? { ...x, role: to } : x)))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && shown.length) {
      e.preventDefault(); setActiveIdx(i => (i + 1) % shown.length)
    } else if (e.key === 'ArrowUp' && shown.length) {
      e.preventDefault(); setActiveIdx(i => (i <= 0 ? shown.length : i) - 1)
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      // 고른 줄이 있으면 그 사람, 없으면 맨 위 결과. 결과가 없을 땐 아무 일도 안 한다 —
      // 이름만 넣기는 감독·작가/배우를 골라야 해서 버튼으로만 한다
      e.preventDefault()
      const target = shown[activeIdx >= 0 ? activeIdx : 0]
      if (target) pick(target)
    }
  }

  const name = q.trim()
  const alreadyIn = !!name && people.some(p => samePerson(p, { name, tmdbId: null }))

  return (
    <div className="form-group">
      {ROLES.map(role => {
        const group = people.filter(p => p.role === role)
        if (!group.length) return null
        return (
          <div key={role} className="people-group">
            <div className="people-group-label">{ROLE_LABEL[role]} <span className="opt">{group.length}/{MAX_PEOPLE_PER_ROLE}</span></div>
            <div className="taste-chips">
              {group.map(p => {
                const photo = personPhotoUrl(p.profilePath)
                return (
                  <span key={`${p.tmdbId ?? 'n'}-${p.name}`} className="taste-chip on person-chip">
                    {photo ? <img src={photo} alt="" /> : <i aria-hidden>{p.name.slice(0, 1)}</i>}
                    {p.name}
                    <button onClick={() => swap(p)} title={`${ROLE_LABEL[role === 'actor' ? 'maker' : 'actor']}(으)로 옮기기`} aria-label={`${p.name} — ${ROLE_LABEL[role === 'actor' ? 'maker' : 'actor']}(으)로 옮기기`}>⇄</button>
                    <button onClick={() => remove(p)} aria-label={`${p.name} 빼기`}>✕</button>
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}

      <input
        className="form-input" autoFocus autoComplete="off" value={q}
        onChange={e => setQ(e.target.value)} onKeyDown={onKey}
        placeholder="이름으로 검색 (예: 봉준호 · 송강호 · 놀란)" />

      <div ref={listRef}>
        {shown.length > 0 && (
          <div className="tmdb-results" style={{ maxHeight: '34vh' }}>
            {shown.map((r, i) => {
              const role = roleOfDepartment(r.department)
              const photo = personPhotoUrl(r.profilePath, 'w185')
              return (
                <div
                  key={r.tmdbId}
                  className={`tmdb-result person-result${i === activeIdx ? ' active' : ''}${full(role) ? ' busy' : ''}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { if (!full(role)) pick(r) }}>
                  {photo ? <img src={photo} alt="" /> : <div className="noimg">{r.name.slice(0, 1)}</div>}
                  <div>
                    <div className="t">{r.name} <span className="type-badge">{DEPARTMENT_KO[r.department || ''] || ROLE_LABEL[role]}</span></div>
                    <div className="m">{r.knownFor.length ? r.knownFor.join(' · ') : '대표작 정보 없음'}{full(role) ? ` · ${ROLE_LABEL[role]} 칸이 꽉 찼어요` : ''}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {loading && <p className="people-msg">검색 중…</p>}

      {/* 검색에 없는 사람 — 이름 그대로 넣는다. 어느 갈래인지는 우리가 알 수 없어서 고르게 한다 */}
      {name.length >= 2 && searched && !loading && !alreadyIn && (
        <div className="people-manual">
          <span>{shown.length ? '찾는 사람이 없나요?' : '검색 결과가 없어요.'} <b>'{name}'</b> 그대로 추가</span>
          {ROLES.map(role => (
            <button key={role} className="btn btn-secondary btn-small" disabled={full(role)} onClick={() => addManual(role)}>{ROLE_LABEL[role]}</button>
          ))}
        </div>
      )}
    </div>
  )
}
