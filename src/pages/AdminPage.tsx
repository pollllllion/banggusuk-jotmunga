import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { CONTENT_TYPES, GENRES, TYPE_LABELS } from '@/utils/constants'
import { timeAgo } from '@/utils/helpers'
import type { Content, ContentType } from '@/types'

const REASON_LABELS: Record<string, string> = {
  spam: '스팸/광고', abuse: '욕설/인신공격', spoiler: '스포일러', false_info: '허위정보', inappropriate: '부적절', copyright: '저작권 침해', other: '기타',
}
const TARGET_LABELS: Record<string, string> = { review: '리뷰', comment: '댓글', content: '작품' }

export function AdminPage() {
  const { user } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [tab, setTab] = useState<'contents' | 'reports' | 'users' | 'announce'>('contents')
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)
  if (!user || user.role !== 'admin') return null

  const users = DS.getUsers()
  const contents = DS.getContents()
  const reviews = DS.getReviews()
  const reports = DS.getReports()
  const announcements = DS.getAnnouncements()
  const pendingReports = reports.filter(r => r.status === 'pending')

  return (
    <>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--dark)', marginBottom: 20 }}>관리자 대시보드</h2>
      <div className="admin-stat">
        <div className="admin-stat-item"><div className="admin-stat-num">{contents.length}</div><div className="admin-stat-label">작품</div></div>
        <div className="admin-stat-item"><div className="admin-stat-num">{reviews.length}</div><div className="admin-stat-label">리뷰</div></div>
        <div className="admin-stat-item"><div className="admin-stat-num">{users.length}</div><div className="admin-stat-label">사용자</div></div>
        <div className="admin-stat-item"><div className="admin-stat-num">{pendingReports.length}</div><div className="admin-stat-label">미처리 신고</div></div>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'contents' ? 'active' : ''}`} onClick={() => setTab('contents')}>작품 관리</button>
        <button className={`admin-tab ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>신고 관리</button>
        <button className={`admin-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>사용자</button>
        <button className={`admin-tab ${tab === 'announce' ? 'active' : ''}`} onClick={() => setTab('announce')}>공지</button>
      </div>

      {tab === 'contents' && <ContentsTab rerender={rerender} />}

      {tab === 'reports' && (!reports.length ? <p style={{ color: 'var(--subtext)', padding: '20px 0' }}>신고 내역이 없습니다.</p> :
        [...reports].sort((a, b) => (a.status === 'pending' ? -1 : 1)).map(r => (
          <div key={r.id} className="admin-card fade-in">
            <div className="admin-card-body">
              <div className="label">{TARGET_LABELS[r.targetType]} 신고 · {REASON_LABELS[r.reason] || r.reason} · {timeAgo(r.createdAt)}</div>
              <div className="value">{r.detail || '(상세 내용 없음)'}</div>
              <div className="label" style={{ marginTop: 4 }}>상태: {r.status === 'pending' ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>대기중</span> : r.status === 'resolved' ? <span style={{ color: 'var(--success)' }}>처리됨</span> : <span style={{ color: 'var(--subtext)' }}>기각</span>}</div>
            </div>
            {r.status === 'pending' && <div className="admin-card-actions">
              <button className="btn btn-primary btn-small" onClick={() => { DS.updateReport(r.id, { status: 'resolved' }); toast('신고가 처리되었습니다.'); rerender() }}>처리</button>
              <button className="btn btn-secondary btn-small" onClick={() => { DS.updateReport(r.id, { status: 'dismissed' }); toast('신고가 기각되었습니다.'); rerender() }}>기각</button>
            </div>}
          </div>
        ))
      )}

      {tab === 'users' && users.filter(u => u.role !== 'admin').map(u => (
        <div key={u.id} className="admin-card fade-in">
          <div className="admin-card-body">
            <div className="value">{u.nickname} <span style={{ color: 'var(--subtext)', fontSize: 12 }}>{u.email}</span></div>
            <div className="label">가입일: {new Date(u.createdAt).toLocaleDateString('ko-KR')} {u.banned && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>· 정지됨</span>}</div>
          </div>
          <div className="admin-card-actions">
            {u.banned ? <button className="btn btn-primary btn-small" onClick={() => { DS.updateUser(u.id, { banned: false }); toast('정지가 해제되었습니다.'); rerender() }}>정지 해제</button> :
              <button className="btn btn-danger-solid btn-small" onClick={() => { if (!confirm('이 사용자를 정지하시겠습니까?')) return; DS.updateUser(u.id, { banned: true }); toast('사용자가 정지되었습니다.'); rerender() }}>정지</button>}
          </div>
        </div>
      ))}

      {tab === 'announce' && <AnnounceTab rerender={rerender} />}
    </>
  )
}

// ── 작품 관리 탭 ─────────────────────────────────────────────
function ContentsTab({ rerender }: { rerender: () => void }) {
  const toast = useToastStore(s => s.show)
  const { user } = useAuthStore()
  const [editing, setEditing] = useState<Content | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  // 최신 개봉순(공개일 내림차순, 없으면 뒤로). 검색은 제목 기준.
  const contents = [...DS.getContents()]
    .filter(c => !q || c.title.toLowerCase().includes(q))
    .sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''))

  const startNew = () => { setEditing(null); setShowForm(true) }
  const startEdit = (c: Content) => { setEditing(c); setShowForm(true) }

  const handleDelete = (c: Content) => {
    if (!confirm(`'${c.title}' 작품과 관련 리뷰를 모두 삭제하시겠습니까?`)) return
    DS.deleteContent(c.id); toast('작품이 삭제되었습니다.'); rerender()
  }

  return (
    <>
      {!showForm && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={startNew}>+ 새 작품 등록</button>
          <input
            className="form-input"
            style={{ flex: 1, minWidth: 180, maxWidth: 320, marginBottom: 0 }}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="작품 제목 검색…"
          />
          <span style={{ fontSize: 12, color: 'var(--subtext)' }}>{contents.length}편</span>
        </div>
      )}
      {showForm && <ContentForm content={editing} authorId={user!.id} onDone={() => { setShowForm(false); rerender() }} onCancel={() => setShowForm(false)} />}

      {!showForm && contents.length === 0 && <p style={{ color: 'var(--subtext)', padding: '16px 0' }}>검색 결과가 없습니다.</p>}
      {contents.map(c => (
        <div key={c.id} className="admin-card fade-in">
          <div className="admin-card-body">
            <div className="value">
              <span className={`type-badge type-${c.type}`}>{TYPE_LABELS[c.type]}</span> {c.title}
            </div>
            <div className="label" style={{ marginTop: 2 }}>
              평점 {c.reviewCount ? c.avgRating.toFixed(1) : '-'} · 리뷰 {c.reviewCount} · {c.genres.join(', ') || '장르 없음'}
            </div>
          </div>
          <div className="admin-card-actions">
            <button className="btn btn-secondary btn-small" onClick={() => startEdit(c)}>수정</button>
            <button className="btn btn-danger btn-small" onClick={() => handleDelete(c)}>삭제</button>
          </div>
        </div>
      ))}
    </>
  )
}

function ContentForm({ content, authorId, onDone, onCancel }: { content: Content | null; authorId: string; onDone: () => void; onCancel: () => void }) {
  const toast = useToastStore(s => s.show)
  const [type, setType] = useState<ContentType>(content?.type || 'movie')
  const [title, setTitle] = useState(content?.title || '')
  const [posterUrl, setPosterUrl] = useState(content?.posterUrl || '')
  const [platform, setPlatform] = useState(content?.platform || '')
  const [releaseYear, setReleaseYear] = useState(content?.releaseYear?.toString() || '')
  const [releaseDate, setReleaseDate] = useState(content?.releaseDate || '')
  const [status, setStatus] = useState<'upcoming' | 'ongoing' | 'completed' | ''>(content?.status || '')
  const [creators, setCreators] = useState(content?.creators.join(', ') || '')
  const [genres, setGenres] = useState<string[]>(content?.genres || [])
  const [synopsis, setSynopsis] = useState(content?.synopsis || '')
  const [hidden, setHidden] = useState(content?.hidden || false)
  const [manualOverride, setManualOverride] = useState(content?.manualOverride || false)
  // 상세 정보 (캘린더 모달)
  const [cast, setCast] = useState(
    (content?.castMembers || []).map(c => (c.character ? `${c.name}, ${c.character}` : c.name)).join('\n'),
  )
  const [networks, setNetworks] = useState((content?.networks || []).map(n => n.name).join(', '))
  const [runtime, setRuntime] = useState(content?.runtime?.toString() || '')
  const [seasons, setSeasons] = useState(content?.numberOfSeasons?.toString() || '')
  const [episodes, setEpisodes] = useState(content?.numberOfEpisodes?.toString() || '')
  const isTmdb = content?.source === 'tmdb'

  const toggleGenre = (g: string) => setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  const submit = () => {
    if (!title.trim()) { toast('제목을 입력하세요.'); return }
    // 출연진: "이름, 배역" 한 줄씩. 기존 프로필 사진(profilePath)은 이름이 같으면 유지.
    const prevCast = content?.castMembers || []
    const castMembers = cast.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const i = line.indexOf(',')
      const name = (i >= 0 ? line.slice(0, i) : line).trim()
      const character = i >= 0 ? (line.slice(i + 1).trim() || null) : null
      return { name, character, profilePath: prevCast.find(p => p.name === name)?.profilePath ?? null }
    })
    // 채널: 쉼표 구분. 기존 로고(logoPath)는 이름이 같으면 유지.
    const prevNets = content?.networks || []
    const networkList = networks.split(',').map(s => s.trim()).filter(Boolean).map(name => ({
      name, logoPath: prevNets.find(p => p.name === name)?.logoPath ?? null,
    }))
    const data: Partial<Content> = {
      type, title: title.trim(),
      posterUrl: posterUrl.trim() || null,
      platform: platform.trim() || null,
      releaseYear: releaseYear ? parseInt(releaseYear, 10) : null,
      releaseDate: releaseDate || null,
      status: status || null,
      creators: creators.split(',').map(s => s.trim()).filter(Boolean),
      genres,
      synopsis: synopsis.trim(),
      hidden,
      manualOverride,
      castMembers,
      networks: networkList,
      runtime: runtime ? parseInt(runtime, 10) : null,
      numberOfSeasons: seasons ? parseInt(seasons, 10) : null,
      numberOfEpisodes: episodes ? parseInt(episodes, 10) : null,
      // 수동 고정이면 실제 공개일을 manualReleaseDate 로 박고 자동 동기화가 못 덮게 한다
      ...(manualOverride
        ? { manualReleaseDate: releaseDate || null, releaseDateSource: 'manual' as const }
        : {}),
    }
    if (content) { DS.updateContent(content.id, data); toast('작품이 수정되었습니다.') }
    else { DS.createContent({ ...data, createdBy: authorId }); toast('작품이 등록되었습니다.') }
    onDone()
  }

  return (
    <div className="settings-section" style={{ marginBottom: 16 }}>
      <h3>{content ? '작품 수정' : '새 작품 등록'}</h3>
      <div className="form-row" style={{ marginBottom: 10 }}>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label>타입</label>
          <select className="form-input" value={type} onChange={e => setType(e.target.value as ContentType)}>
            {CONTENT_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label>연도</label>
          <input className="form-input" type="number" value={releaseYear} onChange={e => setReleaseYear(e.target.value)} placeholder="2024" />
        </div>
      </div>
      <div className="form-group"><label>제목</label><input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="작품 제목" /></div>
      <div className="form-row" style={{ marginBottom: 10 }}>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}><label>플랫폼</label><input className="form-input" value={platform} onChange={e => setPlatform(e.target.value)} placeholder="넷플릭스 / 네이버웹툰 ..." /></div>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label>상태</label>
          <select className="form-input" value={status} onChange={e => setStatus(e.target.value as 'upcoming' | 'ongoing' | 'completed' | '')}>
            <option value="">해당없음</option>
            <option value="upcoming">공개예정</option>
            <option value="ongoing">연재/방영중</option>
            <option value="completed">완결</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>공개일 (캘린더 표시 · 선택)</label>
        <input className="form-input" type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} />
      </div>
      <div className="form-group" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: 0 }}>
          <input type="checkbox" checked={manualOverride} onChange={e => setManualOverride(e.target.checked)} />
          정보 수동 고정 {isTmdb && <span style={{ color: 'var(--subtext)', fontSize: 12 }}>(자동 동기화가 이 작품 정보를 덮어쓰지 않음)</span>}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: 0 }}>
          <input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} />
          캘린더에서 숨김
        </label>
      </div>
      <div className="form-group"><label>{type === 'movie' ? '감독 (쉼표 구분)' : '연출·제작 (쉼표 구분)'}</label><input className="form-input" value={creators} onChange={e => setCreators(e.target.value)} placeholder="봉준호, 송강호" /></div>

      {/* ── 상세 정보 (캘린더 모달) ── */}
      {isTmdb && !manualOverride && (
        <p style={{ fontSize: 12, color: 'var(--danger)', margin: '2px 0 10px', lineHeight: 1.5 }}>
          ⚠️ TMDB 자동 수집 작품입니다. 아래 정보를 직접 고치려면 <b>‘정보 수동 고정’</b>을 켜세요. 안 켜면 다음 자동 동기화 때 되돌아갈 수 있어요.
        </p>
      )}
      <div className="form-group">
        <label>출연진 (한 줄에 한 명 · “이름, 배역”)</label>
        <textarea className="form-input" value={cast} onChange={e => setCast(e.target.value)}
          style={{ minHeight: 72, resize: 'vertical' }} placeholder={'남주혁, 구천\n노윤서, 생강'} />
      </div>
      <div className="form-group"><label>채널·방영사 (쉼표 구분)</label><input className="form-input" value={networks} onChange={e => setNetworks(e.target.value)} placeholder="tvN, Netflix" /></div>
      <div className="form-row" style={{ marginBottom: 10 }}>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}><label>러닝타임(분)</label><input className="form-input" type="number" value={runtime} onChange={e => setRuntime(e.target.value)} placeholder="60" /></div>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}><label>시즌 수</label><input className="form-input" type="number" value={seasons} onChange={e => setSeasons(e.target.value)} placeholder="1" /></div>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}><label>총 회차</label><input className="form-input" type="number" value={episodes} onChange={e => setEpisodes(e.target.value)} placeholder="16" /></div>
      </div>

      <div className="form-group"><label>포스터 이미지 URL (선택)</label><input className="form-input" value={posterUrl} onChange={e => setPosterUrl(e.target.value)} placeholder="https://..." /></div>
      <div className="form-group">
        <label>장르</label>
        <div className="tag-chips">
          {GENRES.map(g => <span key={g} className={`tag-chip ${genres.includes(g) ? 'active' : ''}`} onClick={() => toggleGenre(g)}>{g}</span>)}
        </div>
      </div>
      <div className="form-group"><label>줄거리</label><textarea className="form-input" value={synopsis} onChange={e => setSynopsis(e.target.value)} style={{ minHeight: 80, resize: 'vertical' }} /></div>
      <div className="write-actions">
        <button className="btn btn-secondary" onClick={onCancel}>취소</button>
        <button className="btn btn-primary" onClick={submit}>{content ? '수정' : '등록'}</button>
      </div>
    </div>
  )
}

// ── 공지 탭 ─────────────────────────────────────────────────
function AnnounceTab({ rerender }: { rerender: () => void }) {
  const { user } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [annTitle, setAnnTitle] = useState('')
  const [annContent, setAnnContent] = useState('')
  const announcements = DS.getAnnouncements()

  const submit = () => {
    if (!annTitle.trim() || !annContent.trim()) { toast('제목과 내용을 입력하세요.'); return }
    DS.createAnnouncementItem({ authorId: user!.id, title: annTitle.trim(), content: annContent.trim() })
    toast('공지가 등록되었습니다.'); setAnnTitle(''); setAnnContent(''); rerender()
  }

  return (
    <>
      <div className="settings-section" style={{ marginBottom: 16 }}>
        <div className="form-group"><label>공지 제목</label><input type="text" className="form-input" value={annTitle} onChange={e => setAnnTitle(e.target.value)} placeholder="공지 제목" /></div>
        <div className="form-group"><label>공지 내용</label><textarea className="form-input" value={annContent} onChange={e => setAnnContent(e.target.value)} placeholder="공지 내용" style={{ minHeight: 80, resize: 'vertical' }} /></div>
        <button className="btn btn-primary btn-small" onClick={submit}>공지 등록</button>
      </div>
      {announcements.map(a => (
        <div key={a.id} className="admin-card fade-in">
          <div className="admin-card-body">
            <div className="value" style={{ fontWeight: 700 }}>{a.title}</div>
            <div className="label" style={{ marginTop: 4 }}>{a.content.substring(0, 80)}{a.content.length > 80 ? '...' : ''}</div>
            <div className="label">{timeAgo(a.createdAt)}</div>
          </div>
          <div className="admin-card-actions"><button className="btn btn-danger btn-small" onClick={() => { if (!confirm('공지를 삭제하시겠습니까?')) return; DS.deleteAnnouncementItem(a.id); toast('공지가 삭제되었습니다.'); rerender() }}>삭제</button></div>
        </div>
      ))}
    </>
  )
}
