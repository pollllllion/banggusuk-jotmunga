import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { GENRES, TYPE_LABELS } from '@/utils/constants'
import type { Content, User } from '@/types'

/** 공개 취향 프로필 — 인생작품 / 선호 장르 / 좋아하는 감독 + 자동 파생(많이 본 장르).
 *  다른 유저에게 공개되어 "취향이 비슷한 사람"의 추천 신뢰도를 높이는 목적. */
export function TasteProfile({ user, editable }: { user: User; editable: boolean }) {
  const [editing, setEditing] = useState(false)

  const works = (user.favoriteWorks ?? []).map(id => DS.getContentById(id)).filter((c): c is Content => Boolean(c))
  const genres = user.favoriteGenres ?? []
  const directors = user.favoriteDirectors ?? []
  const bio = user.tasteBio?.trim()

  // 자동 파생: 내가 본 작품에서 가장 많은 장르 top 3 (입력 없이 취향을 보여주는 신뢰 신호)
  const topWatchedGenres = useMemo(() => {
    const count = new Map<string, number>()
    for (const w of DS.getUserWatched(user.id)) {
      const c = DS.getContentById(w.contentId)
      c?.genres?.forEach(g => count.set(g, (count.get(g) || 0) + 1))
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  }, [user.id])

  const isEmpty = !bio && !works.length && !genres.length && !directors.length

  return (
    <div className="taste-card fade-in">
      <div className="taste-head">
        <h3>🎬 내 취향</h3>
        {editable && <button className="btn-text btn-small" onClick={() => setEditing(true)}>{isEmpty ? '+ 등록' : '편집'}</button>}
      </div>

      {isEmpty ? (
        <p className="taste-empty">
          {editable
            ? '인생작품·선호 장르·좋아하는 감독을 등록해보세요. 취향이 비슷한 사람들이 회원님의 추천을 더 신뢰하게 돼요.'
            : '아직 등록한 취향이 없어요.'}
        </p>
      ) : (
        <>
          {bio && <p className="taste-bio">“{bio}”</p>}

          {works.length > 0 && (
            <section className="taste-sec">
              <div className="taste-label">🏆 인생작품</div>
              <div className="taste-works">
                {works.map(c => <TasteWork key={c.id} content={c} />)}
              </div>
            </section>
          )}

          {genres.length > 0 && (
            <section className="taste-sec">
              <div className="taste-label">🎭 선호 장르</div>
              <div className="taste-chips">{genres.map(g => <span key={g} className="taste-chip">{g}</span>)}</div>
            </section>
          )}

          {directors.length > 0 && (
            <section className="taste-sec">
              <div className="taste-label">🎥 좋아하는 감독·작가</div>
              <div className="taste-chips">{directors.map(d => <span key={d} className="taste-chip">{d}</span>)}</div>
            </section>
          )}
        </>
      )}

      {topWatchedGenres.length > 0 && (
        <section className="taste-sec">
          <div className="taste-label">📊 많이 본 장르 <span className="taste-auto">자동</span></div>
          <div className="taste-chips">
            {topWatchedGenres.map(([g, n]) => <span key={g} className="taste-chip ghost">{g} <b>{n}</b></span>)}
          </div>
        </section>
      )}

      {editing && <TasteEditModal user={user} onClose={() => setEditing(false)} />}
    </div>
  )
}

function TasteWork({ content }: { content: Content }) {
  const navigate = useNavigate()
  return (
    <div className="taste-work" onClick={() => navigate(`/content/${content.id}`)} title={content.title}>
      <Poster content={content} showScore={false} />
      <div className="taste-work-title">{content.title}</div>
      <div className="taste-work-type">{TYPE_LABELS[content.type]}</div>
    </div>
  )
}

const MAX_WORKS = 6
const MAX_DIRECTORS = 8

function TasteEditModal({ user, onClose }: { user: User; onClose: () => void }) {
  const updateProfile = useAuthStore(s => s.updateProfile)
  const toast = useToastStore(s => s.show)

  const [bio, setBio] = useState(user.tasteBio ?? '')
  const [works, setWorks] = useState<string[]>(user.favoriteWorks ?? [])
  const [genres, setGenres] = useState<string[]>(user.favoriteGenres ?? [])
  const [directors, setDirectors] = useState<string[]>(user.favoriteDirectors ?? [])
  const [q, setQ] = useState('')
  const [dirInput, setDirInput] = useState('')
  const [saving, setSaving] = useState(false)

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return []
    return DS.getContents().filter(c => c.title.toLowerCase().includes(query) && !works.includes(c.id)).slice(0, 8)
  }, [q, works])

  const addWork = (id: string) => { if (works.length < MAX_WORKS) setWorks([...works, id]); setQ('') }
  const removeWork = (id: string) => setWorks(works.filter(w => w !== id))
  const toggleGenre = (g: string) => setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  const addDirector = () => {
    const d = dirInput.trim()
    if (d && !directors.includes(d) && directors.length < MAX_DIRECTORS) setDirectors([...directors, d])
    setDirInput('')
  }

  const save = async () => {
    setSaving(true)
    try {
      await updateProfile({
        tasteBio: bio.trim() || null,
        favoriteWorks: works,
        favoriteGenres: genres,
        favoriteDirectors: directors,
      })
      toast('취향을 저장했어요.')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const overlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() }

  return (
    <div className="modal-overlay show" onClick={overlayClick}>
      <div className="modal taste-modal" style={{ maxWidth: 520, width: '94vw' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>🎬 내 취향 편집</h3>
        <p className="taste-modal-sub">공개 프로필이에요. 취향이 비슷한 사람들이 회원님 평을 더 신뢰하게 됩니다.</p>

        <div className="form-group">
          <label>취향 한 줄</label>
          <input className="form-input" maxLength={60} value={bio} onChange={e => setBio(e.target.value)}
            placeholder="예: 서사 탄탄한 느와르에 약합니다" />
        </div>

        <div className="form-group">
          <label>🏆 인생작품 <span className="opt">최대 {MAX_WORKS}</span></label>
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
              <input className="form-input" value={q} onChange={e => setQ(e.target.value)} placeholder="작품 제목 검색해서 추가" />
              {matches.length > 0 && (
                <div className="tmdb-results">
                  {matches.map(c => (
                    <div key={c.id} className="tmdb-result" onClick={() => addWork(c.id)}>
                      {c.posterUrl ? <img src={c.posterUrl} alt={c.title} /> : <div className="noimg">No Image</div>}
                      <div><div className="t">{c.title}</div><div className="m">{TYPE_LABELS[c.type]}{c.releaseYear ? ` · ${c.releaseYear}` : ''}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="form-group">
          <label>🎭 선호 장르</label>
          <div className="taste-chips">
            {GENRES.map(g => (
              <span key={g} className={`taste-chip selectable ${genres.includes(g) ? 'on' : ''}`} onClick={() => toggleGenre(g)}>{g}</span>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>🎥 좋아하는 감독·작가 <span className="opt">최대 {MAX_DIRECTORS}</span></label>
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
              placeholder="이름 입력 후 Enter (예: 봉준호)" />
            <button className="btn btn-secondary btn-small" onClick={addDirector}>추가</button>
          </div>
        </div>

        <div className="write-actions">
          <button className="btn btn-secondary" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}
