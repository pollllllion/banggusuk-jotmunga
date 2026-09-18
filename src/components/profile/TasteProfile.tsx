import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { smartSearchTmdb, isSearchableQuery, tmdbEnabled, tmdbContentId, tmdbTvType, type TmdbResult } from '@/utils/tmdb'
import { GENRES, TYPE_LABELS } from '@/utils/constants'
import type { Content, ContentType, FavoritePerson, User } from '@/types'
import { PeoplePicker } from './PeoplePicker'
import { peopleOf } from '@/utils/people'
import { clickable } from '@/utils/a11y'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useListKeyNav } from '@/hooks/useListKeyNav'

/** 취향 편집 창. 보여주는 쪽은 components/profile/ProfileShowcase.tsx 가 맡는다 —
 *  내 피드와 공개 프로필이 같은 화면을 쓰기 때문에 이 파일은 고치는 일만 한다. */
const MAX_WORKS = 10

/** 편집 창은 칸마다 따로 뜬다. 화면에서 세 곳에 흩어져 있는 것을 한 창에 몰아 넣으면
 *  취향 한 줄만 고치려 해도 인생작품 검색·장르 목록이 통째로 딸려 나온다. */
export type TasteSection = 'works' | 'bio' | 'genres' | 'people'

const SECTION_META: Record<TasteSection, { title: string; sub: string }> = {
  works: { title: '인생작품', sub: '내 피드 맨 위에 포스터로 걸립니다. 본 작품 전체가 아니라 인생작품만 골라주세요.' },
  bio: { title: '취향 한 줄', sub: '프로필 아래 한 줄로 뜹니다. 장르·감독은 여기 적지 말고 취향 칸에 넣어주세요.' },
  genres: { title: '선호 장르', sub: "내 피드의 '이런 걸 봅니다' 줄에 뜹니다. 고른 것만 보여요." },
  people: { title: '감독·작가·배우', sub: "내 피드의 '이 사람들 걸 봅니다' 줄에 뜹니다. 이름을 검색해 고르면 감독·작가와 배우로 알아서 나뉩니다." },
}

/** 취향 편집 창 — 한 번에 한 칸만 고친다(section). 내 피드·공개 프로필이 같이 쓴다. */
export function TasteEditModal({ user, section, onClose }: { user: User; section: TasteSection; onClose: () => void }) {
  const updateProfile = useAuthStore(s => s.updateProfile)
  const toast = useToastStore(s => s.show)

  const [bio, setBio] = useState(user.tasteBio ?? '')
  const [works, setWorks] = useState<string[]>(user.favoriteWorks ?? [])
  const [genres, setGenres] = useState<string[]>(user.favoriteGenres ?? [])
  const [people, setPeople] = useState<FavoritePerson[]>(() => peopleOf(user))
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)

  // 로컬 DB 매칭 (이미 등록된 작품) — 통합검색과 같은 소스
  const matches = useMemo(() => {
    const query = q.trim()
    if (!query) return []
    return DS.searchContents(query, 20).filter(c => !works.includes(c.id)).slice(0, 6)
  }, [q, works])

  // TMDB 통합 검색 (DB에 없는 작품도 찾기) — 본 작품 등록과 동일 소스
  const [tmdbCands, setTmdbCands] = useState<{ contentId: string; type: ContentType; r: TmdbResult }[]>([])
  const [tmdbLoading, setTmdbLoading] = useState(false)
  useEffect(() => {
    const query = q.trim()
    if (!tmdbEnabled || !isSearchableQuery(query)) { setTmdbCands([]); setTmdbLoading(false); return }
    let alive = true
    setTmdbLoading(true)
    const timer = setTimeout(async () => {
      try {
        const [mv, tv] = await Promise.all([smartSearchTmdb('movie', query), smartSearchTmdb('tv', query)])
        if (!alive) return
        const seen = new Set<string>([...works, ...matches.map(c => c.id)])
        const cands: { contentId: string; type: ContentType; r: TmdbResult }[] = []
        for (const r of mv) {
          const id = tmdbContentId('movie', r.tmdbId)
          if (!seen.has(id)) { seen.add(id); cands.push({ contentId: id, type: 'movie', r }) }
        }
        for (const r of tv) {
          const id = tmdbContentId('drama', r.tmdbId, r.seasonNumber)
          if (!seen.has(id)) { seen.add(id); cands.push({ contentId: id, type: tmdbTvType(r.genreIds), r }) }
        }
        setTmdbCands(cands.slice(0, 12))
      } catch {
        if (alive) setTmdbCands([])
      } finally {
        if (alive) setTmdbLoading(false)
      }
    }, 350)
    return () => { alive = false; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, works])

  const addWork = (id: string) => { if (works.length < MAX_WORKS) setWorks([...works, id]); setQ('') }
  // TMDB 결과는 DB에 없을 수 있으니 ensureContent 로 확보 후 id 저장
  const addTmdb = async (c: { contentId: string; type: ContentType; r: TmdbResult }) => {
    if (works.length >= MAX_WORKS) return
    try {
      const content = await DS.ensureContent({
        contentId: c.contentId, type: c.type, title: c.r.title,
        posterUrl: c.r.posterUrl, releaseYear: c.r.year, synopsis: c.r.overview,
      })
      setWorks(w => w.includes(content.id) ? w : [...w, content.id])
      setQ(''); setTmdbCands([])
    } catch (e: any) {
      toast(e?.message || '작품 추가에 실패했어요.')
    }
  }
  const removeWork = (id: string) => setWorks(works.filter(w => w !== id))

  // 키보드 선택 — 두 목록(DB → TMDB)을 화면 차례대로 한 줄로 센다
  const nav = useListKeyNav(matches.length + tmdbCands.length, q, i => {
    if (i < matches.length) addWork(matches[i].id)
    else addTmdb(tmdbCands[i - matches.length])
  })
  const toggleGenre = (g: string) => setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  /** 지금 고치고 있는 칸만 저장한다 — 다른 칸까지 같이 덮어쓰면
   *  두 창을 나란히 열어 둔 경우 나중에 닫는 쪽이 앞의 저장을 되돌린다. */
  const save = async () => {
    setSaving(true)
    try {
      await updateProfile(
        section === 'works' ? { favoriteWorks: works }
          : section === 'bio' ? { tasteBio: bio.trim() || null }
            : section === 'genres' ? { favoriteGenres: genres }
              // favoritePeople 이 기준. 이름만 담던 두 칸에도 비춰 적는다(옛 자산을 캐시한 PWA 가 읽는다)
              : {
                favoritePeople: people,
                favoriteDirectors: people.filter(x => x.role === 'maker').map(x => x.name),
                favoriteActors: people.filter(x => x.role === 'actor').map(x => x.name),
              },
      )
      toast(`${SECTION_META[section].title}을(를) 저장했어요.`)
      onClose()
    } catch (e) {
      // 저장이 서버까지 못 갔다 — 창을 닫지 않는다(쓴 내용을 잃지 않게)
      toast(e instanceof Error ? e.message : '취향을 저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  useEscapeKey(true, onClose)

  const overlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() }

  return (
    <div className="modal-overlay show" onClick={overlayClick}>
      <div className="modal taste-modal" style={{ maxWidth: 520, width: '94vw' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>{SECTION_META[section].title}</h3>
        <p className="taste-modal-sub">{SECTION_META[section].sub}</p>

        {section === 'bio' && (
        <div className="form-group">
          <label>취향 한 줄 <span className="opt">최대 60자</span></label>
          <input className="form-input" maxLength={60} value={bio} onChange={e => setBio(e.target.value)}
            autoFocus placeholder="예: 서사 탄탄한 느와르에 약합니다" />
        </div>
        )}

        {section === 'works' && (
        <div className="form-group">
          <label>{SECTION_META[section].title} <span className="opt">최대 {MAX_WORKS}</span></label>
          {works.length > 0 && (
            <div className="taste-works edit">
              {works.map(id => {
                const c = DS.getContentById(id)
                if (!c) return null
                return (
                  <div key={id} className="taste-work">
                    <button className="taste-work-x" onClick={() => removeWork(id)}>✕</button>
                    <Poster content={c} showScore={false} />
                    <div className="taste-work-title">{c.title}</div>
                  </div>
                )
              })}
            </div>
          )}
          {works.length < MAX_WORKS && (
            <>
              <input className="form-input" value={q} onChange={e => setQ(e.target.value)} onKeyDown={nav.onKeyDown} autoComplete="off" placeholder="작품 제목 검색해서 추가 (영화·드라마·예능은 전체 검색)" />
              {(matches.length > 0 || tmdbCands.length > 0) && (
                <div className="tmdb-results" ref={nav.listRef}>
                  {matches.map((c, i) => (
                    <div key={c.id} className={`tmdb-result${i === nav.activeIdx ? ' active' : ''}`} {...clickable(() => addWork(c.id))}>
                      {c.posterUrl ? <img src={c.posterUrl} alt={c.title} /> : <div className="noimg">No Image</div>}
                      <div><div className="t">{c.title}</div><div className="m">{TYPE_LABELS[c.type]}{c.releaseYear ? ` · ${c.releaseYear}` : ''}</div></div>
                    </div>
                  ))}
                  {tmdbCands.map((c, i) => (
                    <div key={c.contentId} className={`tmdb-result${matches.length + i === nav.activeIdx ? ' active' : ''}`} {...clickable(() => addTmdb(c))}>
                      {c.r.posterUrl ? <img src={c.r.posterUrl} alt={c.r.title} /> : <div className="noimg">No Image</div>}
                      <div><div className="t">{c.r.title}</div><div className="m">{TYPE_LABELS[c.type]}{c.r.year ? ` · ${c.r.year}` : ''}</div></div>
                    </div>
                  ))}
                </div>
              )}
              {tmdbLoading && <p style={{ fontSize: 12, color: 'var(--subtext)', marginTop: 6 }}>검색 중…</p>}
              {!tmdbLoading && q.trim().length >= 2 && !matches.length && !tmdbCands.length && (
                <p style={{ fontSize: 12, color: 'var(--subtext)', marginTop: 6 }}>검색 결과가 없어요. (웹툰·웹소설은 본 작품 등록에서 먼저 추가해주세요)</p>
              )}
            </>
          )}
        </div>
        )}

        {/* 장르와 사람은 창이 따로다 (2026-09-19). 처음엔 '취향' 한 창에 같이 뒀는데, 화면에서는
            두 줄이 저마다 ＋ 를 갖고 있어서 어느 쪽을 눌러도 똑같은 창이 떴다 — 사람을 넣으려고
            눌렀는데 장르 목록부터 나오는 식. 누른 줄의 것만 나와야 한다. */}
        {section === 'genres' && (
        <div className="form-group">
          <label>선호 장르</label>
          <div className="taste-chips">
            {GENRES.map(g => (
              <span key={g} className={`taste-chip selectable ${genres.includes(g) ? 'on' : ''}`} onClick={() => toggleGenre(g)}>{g}</span>
            ))}
          </div>
        </div>
        )}

        {section === 'people' && <PeoplePicker people={people} onChange={setPeople} />}

        <div className="write-actions">
          <button className="btn btn-secondary" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}
