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
  const contents = DS.getContents()

  const startNew = () => { setEditing(null); setShowForm(true) }
  const startEdit = (c: Content) => { setEditing(c); setShowForm(true) }

  const handleDelete = (c: Content) => {
    if (!confirm(`'${c.title}' 작품과 관련 리뷰를 모두 삭제하시겠습니까?`)) return
    DS.deleteContent(c.id); toast('작품이 삭제되었습니다.'); rerender()
  }

  return (
    <>
      {!showForm && <button className="btn btn-primary" style={{ marginBottom: 12 }} onClick={startNew}>+ 새 작품 등록</button>}
      {showForm && <ContentForm content={editing} authorId={user!.id} onDone={() => { setShowForm(false); rerender() }} onCancel={() => setShowForm(false)} />}

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
  const [status, setStatus] = useState<'ongoing' | 'completed' | ''>(content?.status || '')
  const [creators, setCreators] = useState(content?.creators.join(', ') || '')
  const [genres, setGenres] = useState<string[]>(content?.genres || [])
  const [synopsis, setSynopsis] = useState(content?.synopsis || '')

  const toggleGenre = (g: string) => setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  const submit = () => {
    if (!title.trim()) { toast('제목을 입력하세요.'); return }
    const data = {
      type, title: title.trim(),
      posterUrl: posterUrl.trim() || null,
      platform: platform.trim() || null,
      releaseYear: releaseYear ? parseInt(releaseYear, 10) : null,
      status: status || null,
      creators: creators.split(',').map(s => s.trim()).filter(Boolean),
      genres,
      synopsis: synopsis.trim(),
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
          <select className="form-input" value={status} onChange={e => setStatus(e.target.value as 'ongoing' | 'completed' | '')}>
            <option value="">해당없음</option>
            <option value="ongoing">연재/방영중</option>
            <option value="completed">완결</option>
          </select>
        </div>
      </div>
      <div className="form-group"><label>제작진 (쉼표 구분)</label><input className="form-input" value={creators} onChange={e => setCreators(e.target.value)} placeholder="봉준호, 송강호" /></div>
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
