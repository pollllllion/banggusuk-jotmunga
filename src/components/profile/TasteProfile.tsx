import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { smartSearchTmdb, tmdbEnabled, tmdbContentId, tmdbTvType, type TmdbResult } from '@/utils/tmdb'
import { GENRES, TYPE_LABELS } from '@/utils/constants'
import type { Content, ContentType, User } from '@/types'
import { clickable } from '@/utils/a11y'
import { useEscapeKey } from '@/hooks/useEscapeKey'

/** 취향 편집 창. 보여주는 쪽은 components/profile/ProfileShowcase.tsx 가 맡는다 —
 *  내 피드와 공개 프로필이 같은 화면을 쓰기 때문에 이 파일은 고치는 일만 한다. */
const MAX_WORKS = 10
const MAX_DIRECTORS = 8

/** 편집 창은 칸마다 따로 뜬다. 화면에서 세 곳에 흩어져 있는 것을 한 창에 몰아 넣으면
 *  취향 한 줄만 고치려 해도 인생작품 검색·장르 목록이 통째로 딸려 나온다. */
export type TasteSection = 'works' | 'bio' | 'taste'

const SECTION_META: Record<TasteSection, { title: string; sub: string }> = {
  works: { title: '인생작품', sub: '내 피드 맨 위에 포스터로 걸립니다. 본 작품 전체가 아니라 인생작품만 골라주세요.' },
  bio: { title: '취향 한 줄', sub: '프로필 아래 한 줄로 뜹니다. 장르·감독은 여기 적지 말고 취향 칸에 넣어주세요.' },
  taste: { title: '취향', sub: '선호 장르와 좋아하는 감독·작가·배우. 고른 것만 내 피드에 뜹니다.' },
}

/** 취향 편집 창 — 한 번에 한 칸만 고친다(section). 내 피드·공개 프로필이 같이 쓴다. */
export function TasteEditModal({ user, section, onClose }: { user: User; section: TasteSection; onClose: () => void }) {
  const updateProfile = useAuthStore(s => s.updateProfile)
  const toast = useToastStore(s => s.show)

  const [bio, setBio] = useState(user.tasteBio ?? '')
  const [works, setWorks] = useState<string[]>(user.favoriteWorks ?? [])
  const [genres, setGenres] = useState<string[]>(user.favoriteGenres ?? [])
  const [directors, setDirectors] = useState<string[]>(user.favoriteDirectors ?? [])
  const [q, setQ] = useState('')
  const [dirInput, setDirInput] = useState('')
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
    if (!tmdbEnabled || query.length < 2) { setTmdbCands([]); setTmdbLoading(false); return }
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
          const id = tmdbContentId('drama', r.tmdbId)
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
  const toggleGenre = (g: string) => setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  const addDirector = () => {
    const d = dirInput.trim()
    if (d && !directors.includes(d) && directors.length < MAX_DIRECTORS) setDirectors([...directors, d])
    setDirInput('')
  }

  /** 지금 고치고 있는 칸만 저장한다 — 다른 칸까지 같이 덮어쓰면
   *  두 창을 나란히 열어 둔 경우 나중에 닫는 쪽이 앞의 저장을 되돌린다. */
  const save = async () => {
    setSaving(true)
    try {
      await updateProfile(
        section === 'works' ? { favoriteWorks: works }
          : section === 'bio' ? { tasteBio: bio.trim() || null }
            : { favoriteGenres: genres, favoriteDirectors: directors },
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
          <label>인생작품 <span className="opt">최대 {MAX_WORKS}</span></label>
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
              <input className="form-input" value={q} onChange={e => setQ(e.target.value)} placeholder="작품 제목 검색해서 추가 (영화·드라마·예능은 전체 검색)" />
              {(matches.length > 0 || tmdbCands.length > 0) && (
                <div className="tmdb-results">
                  {matches.map(c => (
                    <div key={c.id} className="tmdb-result" {...clickable(() => addWork(c.id))}>
                      {c.posterUrl ? <img src={c.posterUrl} alt={c.title} /> : <div className="noimg">No Image</div>}
                      <div><div className="t">{c.title}</div><div className="m">{TYPE_LABELS[c.type]}{c.releaseYear ? ` · ${c.releaseYear}` : ''}</div></div>
                    </div>
                  ))}
                  {tmdbCands.map(c => (
                    <div key={c.contentId} className="tmdb-result" {...clickable(() => addTmdb(c))}>
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

        {/* '취향' 창은 장르와 감독·작가·배우 둘을 함께 다룬다 — 둘 다 칩으로 고르는 같은 성격이고,
            화면에서도 취향 한 칸에 나란히 뜬다. */}
        {section === 'taste' && (
        <>
        <div className="form-group">
          <label>선호 장르</label>
          <div className="taste-chips">
            {GENRES.map(g => (
              <span key={g} className={`taste-chip selectable ${genres.includes(g) ? 'on' : ''}`} onClick={() => toggleGenre(g)}>{g}</span>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>좋아하는 감독·작가·배우 <span className="opt">최대 {MAX_DIRECTORS}</span></label>
          {directors.length > 0 && (
            <div className="taste-chips" style={{ marginBottom: 8 }}>
              {directors.map(d => (
                <span key={d} className="taste-chip on" onClick={() => setDirectors(directors.filter(x => x !== d))}>{d} ✕</span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" value={dirInput} onChange={e => setDirInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDirector() } }}
              placeholder="이름 입력 후 Enter (예: 봉준호 · 송강호)" />
            <button className="btn btn-secondary btn-small" onClick={addDirector}>추가</button>
          </div>
        </div>
        </>
        )}

        <div className="write-actions">
          <button className="btn btn-secondary" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}
