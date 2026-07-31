import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { CONTENT_TYPES, GENRES, TYPE_LABELS, WEBTOON_PLATFORMS } from '@/utils/constants'
import { timeAgo, normalizeTitle } from '@/utils/helpers'
import { OTT_FILTERS } from '@/utils/ott'
import { smartSearchTmdb, tmdbEnabled, tmdbContentId, type TmdbResult } from '@/utils/tmdb'
import { PosterUploader } from '@/components/content/PosterUploader'
import { Seo } from '@/components/seo/Seo'
import type { Content, ContentType } from '@/types'

const REASON_LABELS: Record<string, string> = {
  spam: '스팸/광고', abuse: '욕설/인신공격', spoiler: '스포일러', false_info: '허위정보', inappropriate: '부적절', copyright: '저작권 침해', other: '기타',
}
const TARGET_LABELS: Record<string, string> = { review: '리뷰', comment: '댓글', content: '작품' }

export function AdminPage() {
  const { user } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const location = useLocation()
  const navState = location.state as { newContent?: boolean; editContentId?: string } | null
  // 캘린더의 '+ 신작 등록' 바로가기로 진입 → 등록 폼, '이 작품 정보 수정' → 해당 작품 편집 폼.
  const openNewContent = Boolean(navState?.newContent)
  const editContentId = navState?.editContentId
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
      <Seo title="관리자 대시보드" noindex />
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

      {tab === 'contents' && <ContentsTab rerender={rerender} openNew={openNewContent} editId={editContentId} />}

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
function ContentsTab({ rerender, openNew, editId }: { rerender: () => void; openNew?: boolean; editId?: string }) {
  const toast = useToastStore(s => s.show)
  const { user } = useAuthStore()
  const [editing, setEditing] = useState<Content | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showTmdb, setShowTmdb] = useState(false)
  const [showDedup, setShowDedup] = useState(false)
  const [query, setQuery] = useState('')
  const [onlyUnverified, setOnlyUnverified] = useState(false)

  // 캘린더 '+ 신작 등록' 바로가기로 들어오면 폼을 자동으로 연다.
  useEffect(() => { if (openNew) { setEditing(null); setShowForm(true) } }, [openNew])
  // 캘린더 '이 작품 정보 수정' 바로가기로 들어오면 해당 작품 편집 폼을 연다.
  useEffect(() => {
    if (!editId) return
    const c = DS.getContentById(editId)
    if (c) { setEditing(c); setShowForm(true) }
    else toast('해당 작품을 찾을 수 없어요.')
  }, [editId])

  const q = query.trim().toLowerCase()
  // 최신 개봉순(공개일 내림차순, 없으면 뒤로). 검색은 제목 기준.
  const contents = [...DS.getContents()]
    .filter(c => !q || c.title.toLowerCase().includes(q))
    .filter(c => !onlyUnverified || !c.verified)
    .sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''))
  const unverifiedCount = DS.getContents().filter(c => !c.verified).length

  const startNew = () => { setEditing(null); setShowForm(true) }
  const startEdit = (c: Content) => { setEditing(c); setShowForm(true) }

  const toggleVerify = (c: Content) => {
    DS.updateContent(c.id, { verified: !c.verified })
    toast(c.verified ? '인증을 취소했어요.' : '공식 인증했어요.')
    rerender()
  }

  const handleDelete = (c: Content) => {
    if (!confirm(`'${c.title}' 작품과 관련 리뷰를 모두 삭제하시겠습니까?`)) return
    DS.deleteContent(c.id); toast('작품이 삭제되었습니다.'); rerender()
  }

  // TMDB 검색 등록 결과 처리: 이미 있으면 수정으로, 새로면 등록 후 상세 채우기로.
  const onTmdbRegistered = (c: Content, existed: boolean) => {
    setShowTmdb(false)
    toast(existed
      ? `이미 등록된 작품이에요. 수정 화면을 엽니다.`
      : `'${c.title}' 등록 완료! 공개일·OTT를 채워주세요.`)
    setEditing(c); setShowForm(true)
    rerender()
  }

  const dupGroupCount = findDupGroups(DS.getContents()).length

  if (showForm) {
    return <ContentFormGate content={editing} authorId={user!.id} onDone={() => { setShowForm(false); rerender() }} onCancel={() => setShowForm(false)} />
  }
  if (showTmdb) {
    return <TmdbRegisterPanel onRegistered={onTmdbRegistered} onCancel={() => setShowTmdb(false)} />
  }
  if (showDedup) {
    return <DedupPanel onDone={() => { setShowDedup(false); rerender() }} />
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={startNew}>+ 새 작품 등록</button>
        {tmdbEnabled && <button className="btn btn-secondary" onClick={() => setShowTmdb(true)}>📥 TMDB 검색 등록</button>}
        <button className="btn btn-secondary" onClick={() => setShowDedup(true)}>
          🔁 중복 정리{dupGroupCount > 0 && <b style={{ color: 'var(--danger)', marginLeft: 4 }}>{dupGroupCount}</b>}
        </button>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: 180, maxWidth: 320, marginBottom: 0 }}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="작품 제목 검색…"
        />
        <span style={{ fontSize: 12, color: 'var(--subtext)' }}>{contents.length}편</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--subtext)', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyUnverified} onChange={e => setOnlyUnverified(e.target.checked)} />
          미인증만 보기 {unverifiedCount > 0 && <b style={{ color: 'var(--danger)' }}>({unverifiedCount})</b>}
        </label>
      </div>

      {contents.length === 0 && <p style={{ color: 'var(--subtext)', padding: '16px 0' }}>검색 결과가 없습니다.</p>}
      {contents.map(c => (
        <div key={c.id} className="admin-card fade-in">
          <div className="admin-card-body">
            <div className="value">
              <span className={`type-badge type-${c.type}`}>{TYPE_LABELS[c.type]}</span> {c.title}
              {c.verified
                ? <span className="admin-verified-tag ok" title="공식 인증됨">✓ 공식</span>
                : <span className="admin-verified-tag no" title="사용자 등록 · 미인증">미인증</span>}
            </div>
            <div className="label" style={{ marginTop: 2 }}>
              평점 {c.reviewCount ? c.avgRating.toFixed(1) : '-'} · 리뷰 {c.reviewCount} · {c.genres.join(', ') || '장르 없음'}
            </div>
          </div>
          <div className="admin-card-actions">
            <button className={`btn btn-small ${c.verified ? 'btn-secondary' : 'btn-primary'}`} onClick={() => toggleVerify(c)}>
              {c.verified ? '인증취소' : '인증'}
            </button>
            <button className="btn btn-secondary btn-small" onClick={() => startEdit(c)}>수정</button>
            <button className="btn btn-danger btn-small" onClick={() => handleDelete(c)}>삭제</button>
          </div>
        </div>
      ))}
    </>
  )
}

// ── 중복 작품 감지 / 정리 ────────────────────────────────────
// 같은 타입 + 정규화 제목이 같은 작품들을 한 그룹으로 본다("전지적 독자 시점" ↔ "전지적독자시점").
function findDupGroups(contents: Content[]): Content[][] {
  const map = new Map<string, Content[]>()
  for (const c of contents) {
    const norm = normalizeTitle(c.title)
    if (!norm) continue
    const key = `${c.type}|${norm}`
    const arr = map.get(key)
    if (arr) arr.push(c); else map.set(key, [c])
  }
  return [...map.values()].filter(g => g.length >= 2)
}
// 살아남을 작품(대표): 인증 > 리뷰 많은 것 > 먼저 만들어진 것
function pickSurvivor(group: Content[]): Content {
  return [...group].sort((a, b) =>
    (Number(!!b.verified) - Number(!!a.verified)) ||
    (b.reviewCount - a.reviewCount) ||
    ((a.createdAt || '').localeCompare(b.createdAt || ''))
  )[0]
}

function DedupPanel({ onDone }: { onDone: () => void }) {
  const toast = useToastStore(s => s.show)
  const [, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const groups = findDupGroups(DS.getContents())

  const mergeGroup = async (group: Content[]) => {
    const survivor = pickSurvivor(group)
    const dups = group.filter(c => c.id !== survivor.id)
    if (!confirm(`'${survivor.title}' 로 ${dups.length}개 중복을 합칩니다.\n(리뷰·수다방·본 작품 기록은 모두 대표 작품으로 이동)\n계속할까요?`)) return
    setBusy(true)
    try {
      for (const d of dups) await DS.mergeContent(d.id, survivor.id)
      toast(`'${survivor.title}' 로 ${dups.length}개를 병합했어요.`)
      setTick(t => t + 1)
    } catch (e: any) {
      toast(e?.message || '병합에 실패했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fade-in">
      <button className="btn-text btn-small" onClick={onDone} style={{ marginBottom: 8 }}>‹ 작품 관리로</button>
      <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>🔁 중복 작품 정리</h3>
      <p style={{ color: 'var(--subtext)', fontSize: 13, marginBottom: 14 }}>
        같은 작품이 여러 개로 등록된 그룹이에요. 병합하면 <b>대표 작품(★)</b>으로 합쳐지고 나머지는 삭제됩니다.
      </p>

      {groups.length === 0 && <p style={{ color: 'var(--subtext)', padding: '16px 0' }}>중복된 작품이 없어요. 👍</p>}

      {groups.map((group, gi) => {
        const survivor = pickSurvivor(group)
        return (
          <div key={gi} className="admin-card fade-in" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <b>{survivor.title} <span style={{ color: 'var(--subtext)', fontWeight: 500, fontSize: 12 }}>· {TYPE_LABELS[survivor.type]} · {group.length}개</span></b>
              <button className="btn btn-primary btn-small" disabled={busy} onClick={() => mergeGroup(group)}>병합</button>
            </div>
            {group.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: c.id === survivor.id ? 'var(--text)' : 'var(--subtext)' }}>
                <span>{c.id === survivor.id ? '★ 대표' : '↳ 합쳐짐'}</span>
                <span>{c.title}</span>
                {c.verified && <span className="admin-verified-tag ok">✓</span>}
                <span style={{ fontSize: 11 }}>리뷰 {c.reviewCount}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── TMDB 검색 등록 패널 (어드민) ─────────────────────────────
// 제목 검색 → 결과 클릭 → 동기화 스크립트와 동일한 id로 등록(중복 안전).
// source:'tmdb' + manualOverride:true 로 저장 → 자동 동기화의 stale 정리(숨김)에서 보호되고,
// 관리자가 채운 상세정보를 다음 동기화가 덮어쓰지 않는다.
const TMDB_TYPES: { code: ContentType; label: string; emoji: string }[] = [
  { code: 'movie', label: '영화', emoji: '\u{1F3AC}' },
  { code: 'drama', label: '드라마', emoji: '\u{1F4FA}' },
  { code: 'variety', label: '예능', emoji: '\u{1F3A4}' },
]

function TmdbRegisterPanel({ onRegistered, onCancel }: { onRegistered: (c: Content, existed: boolean) => void; onCancel: () => void }) {
  const toast = useToastStore(s => s.show)
  const [type, setType] = useState<ContentType>('movie')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TmdbResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const doSearch = async () => {
    if (!query.trim()) return
    setLoading(true); setSearched(true)
    try {
      setResults(await smartSearchTmdb(type === 'movie' ? 'movie' : 'tv', query))
    } catch (e: any) {
      toast(e?.message || 'TMDB 검색에 실패했어요.')
    } finally {
      setLoading(false)
    }
  }

  const pick = (r: TmdbResult) => {
    const id = tmdbContentId(type, r.tmdbId)
    const existing = DS.getContentById(id)
    if (existing) { onRegistered(existing, true); return }
    const created = DS.createContent({
      id, source: 'tmdb', manualOverride: true, type, verified: true,
      title: r.title,
      posterUrl: r.posterUrl,
      releaseYear: r.year,
      synopsis: r.overview,
      genres: [],
    })
    onRegistered(created, false)
  }

  return (
    <div className="settings-section" style={{ marginBottom: 16 }}>
      <h3>📥 TMDB 검색 등록</h3>
      <p style={{ fontSize: 12, color: 'var(--subtext)', margin: '2px 0 12px', lineHeight: 1.5 }}>
        제목으로 검색해 정식 TMDB id로 등록합니다(중복 안전). 등록 후 공개일·OTT를 이어서 채워주세요.
      </p>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>종류</label>
        <div className="tag-chips">
          {TMDB_TYPES.map(t => (
            <span key={t.code} className={`tag-chip ${type === t.code ? 'active' : ''}`}
              onClick={() => { setType(t.code); setResults([]); setSearched(false) }}>{t.emoji} {t.label}</span>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label>제목 검색</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input" autoFocus placeholder="작품 제목" value={query}
            style={{ flex: 1, marginBottom: 0 }}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
          />
          <button className="btn btn-primary" onClick={doSearch} disabled={loading || !query.trim()}>
            {loading ? '검색중' : '검색'}
          </button>
        </div>
      </div>

      {searched && !loading && results.length === 0 && (
        <p style={{ color: 'var(--subtext)', fontSize: 13, margin: '8px 0' }}>
          검색 결과가 없어요. 제목을 바꿔보세요. (웹툰/웹소설은 ‘+ 새 작품 등록’으로 수기 입력)
        </p>
      )}
      <div className="tmdb-results">
        {results.map(r => (
          <div key={r.tmdbId} className="tmdb-result" onClick={() => pick(r)}>
            {r.posterUrl
              ? <img src={r.posterUrl} alt={r.title} />
              : <div className="noimg">No Image</div>}
            <div>
              <div className="t">{r.title}</div>
              <div className="m">{r.year || '연도미상'}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="write-actions" style={{ marginTop: 12 }}>
        <button className="btn btn-secondary" onClick={onCancel}>닫기</button>
      </div>
    </div>
  )
}

type ContentFormProps = { content: Content | null; authorId: string; onDone: () => void; onCancel: () => void }

/**
 * 편집 폼은 출연진을 폼 입력값으로 통째 덮어쓴다. 그런데 castMembers 는 앱 시작 로드에서
 * 빠져 있어(용량 절감) 캐시에 없을 수 있고, 그 상태로 저장하면 출연진이 지워진다.
 * 그래서 기존 작품을 고칠 때는 상세 컬럼을 받아온 뒤에 폼을 띄운다. 새 등록은 받을 게 없어 바로 통과.
 */
function ContentFormGate(props: ContentFormProps) {
  const id = props.content?.id
  const [ready, setReady] = useState(!id)
  useEffect(() => {
    if (!id) { setReady(true); return }
    let alive = true
    DS.loadContentDetail(id).finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [id])
  if (!ready) return <div className="empty-state fade-in"><p>작품 정보를 불러오는 중…</p></div>
  return <ContentForm {...props} content={id ? DS.getContentById(id) ?? props.content : null} />
}

function ContentForm({ content, authorId, onDone, onCancel }: ContentFormProps) {
  const toast = useToastStore(s => s.show)
  const [type, setType] = useState<ContentType>(content?.type || 'movie')
  const [title, setTitle] = useState(content?.title || '')
  const [posterUrl, setPosterUrl] = useState(content?.posterUrl || '')
  const [platform, setPlatform] = useState(content?.platform || '')
  const [releaseYear, setReleaseYear] = useState(content?.releaseYear?.toString() || '')
  const [releaseDate, setReleaseDate] = useState(content?.releaseDate || '')
  const [status, setStatus] = useState<'upcoming' | 'ongoing' | 'completed' | ''>(content?.status || '')
  const [releasePattern, setReleasePattern] = useState(content?.releasePattern || '')
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
  const [ott, setOtt] = useState<string[]>((content?.providers || []).map(p => p.providerName))
  const [runtime, setRuntime] = useState(content?.runtime?.toString() || '')
  const [seasons, setSeasons] = useState(content?.numberOfSeasons?.toString() || '')
  const [episodes, setEpisodes] = useState(content?.numberOfEpisodes?.toString() || '')
  const isTmdb = content?.source === 'tmdb'
  const isBook = type === 'webtoon' || type === 'webnovel' // 웹툰/웹소설: 영상 전용 필드(출연·OTT·채널·러닝타임 등) 숨김
  // 새 등록 시 같은 작품(타입+정규화 제목 일치)이 이미 있는지 — 중복 방지
  const dupMatches = !content && title.trim()
    ? DS.getContents().filter(c => c.type === type && normalizeTitle(c.title) === normalizeTitle(title))
    : []

  const toggleGenre = (g: string) => setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  const toggleOtt = (name: string) => setOtt(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name])
  const nameToId = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }

  const submit = () => {
    if (!title.trim()) { toast('제목을 입력하세요.'); return }
    if (!content && dupMatches.length && !confirm(
      `이미 같은 작품이 있어요: "${dupMatches[0].title}"${dupMatches.length > 1 ? ` 외 ${dupMatches.length - 1}개` : ''}.\n중복으로 새로 등록하면 나중에 '중복 정리'에서 합쳐야 해요.\n그래도 새로 등록할까요?`
    )) return
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
    // OTT: 선택 칩 → providers. 기존 providerId/logoPath(넷플릭스 등 TMDB 로고)는 이름 같으면 유지.
    const prevProv = content?.providers || []
    const providers = ott.map(name => {
      const prev = prevProv.find(p => p.providerName === name)
      return {
        providerId: prev?.providerId ?? nameToId(name),
        providerName: name,
        logoPath: prev?.logoPath ?? null,
        monetizationType: 'flatrate' as const,
      }
    })
    const data: Partial<Content> = {
      type, title: title.trim(),
      posterUrl: posterUrl.trim() || null,
      platform: platform.trim() || null,
      releaseYear: releaseYear ? parseInt(releaseYear, 10) : null,
      releaseDate: releaseDate || null,
      status: status || null,
      releasePattern: releasePattern.trim() || null,
      creators: creators.split(',').map(s => s.trim()).filter(Boolean),
      genres,
      synopsis: synopsis.trim(),
      hidden,
      manualOverride,
      castMembers,
      networks: networkList,
      providers,
      runtime: runtime ? parseInt(runtime, 10) : null,
      numberOfSeasons: seasons ? parseInt(seasons, 10) : null,
      numberOfEpisodes: episodes ? parseInt(episodes, 10) : null,
      // 수동 고정이면 실제 공개일을 manualReleaseDate 로 박고 자동 동기화가 못 덮게 한다
      ...(manualOverride
        ? { manualReleaseDate: releaseDate || null, releaseDateSource: 'manual' as const }
        : {}),
    }
    if (content) { DS.updateContent(content.id, data); toast('작품이 수정되었습니다.') }
    else { DS.createContent({ ...data, createdBy: authorId, verified: true }); toast('작품이 등록되었습니다.') }
    onDone()
  }

  return (
    <div className="settings-section" style={{ marginBottom: 16 }}>
      <h3>{content ? '작품 수정' : '새 작품 등록'}</h3>
      <div className="form-row" style={{ marginBottom: 10 }}>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label>타입</label>
          <select className="form-input" value={type} onChange={e => {
            const t = e.target.value as ContentType
            setType(t)
            // 웹툰/웹소설은 대개 공개예정 신작을 넣으므로 상태 기본값을 잡아준다(비어있을 때만).
            if ((t === 'webtoon' || t === 'webnovel') && !status) setStatus('upcoming')
          }}>
            {CONTENT_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label>연도</label>
          <input className="form-input" type="number" value={releaseYear} onChange={e => setReleaseYear(e.target.value)} placeholder="2024" />
        </div>
      </div>
      <div className="form-group"><label>제목</label><input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="작품 제목" /></div>
      {dupMatches.length > 0 && (
        <div className="dup-warn">
          ⚠️ 같은 작품이 이미 있어요: <b>{dupMatches.map(c => c.title).join(', ')}</b>. 중복 등록 대신 기존 작품을 수정하거나, 등록 후 '중복 정리'로 합치세요.
        </div>
      )}
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
      {/* 웹툰/웹소설: 플랫폼 표기 흔들림 방지용 빠른 선택 칩 + 공개일 안내 */}
      {(type === 'webtoon' || type === 'webnovel') && (
        <div className="form-group">
          <div className="tag-chips" style={{ marginBottom: 6 }}>
            {WEBTOON_PLATFORMS.map(p => (
              <span key={p} className={`tag-chip ${platform === p ? 'active' : ''}`} onClick={() => setPlatform(p)}>{p}</span>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--subtext)', margin: 0, lineHeight: 1.5 }}>
            💡 연재 시작일을 아래 <b>‘공개일’</b>에 넣으면 캘린더에 신작으로 표시돼요.
          </p>
        </div>
      )}
      <div className="form-group">
        <label>공개일 (캘린더 표시 · 선택)</label>
        <input className="form-input" type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} />
      </div>
      <div className="form-group">
        <label>공개 패턴 (선택 · 입력하면 자동 유추보다 우선)</label>
        <input className="form-input" value={releasePattern} onChange={e => setReleasePattern(e.target.value)}
          placeholder="예: 매주 수·목 공개 / 한번에 공개 / 매주 목 2화씩" />
        <p style={{ fontSize: 12, color: 'var(--subtext)', margin: '4px 0 0', lineHeight: 1.5 }}>
          비워두면 TMDB 회차 데이터로 자동 표시돼요. 웹툰/웹소설·자동 유추 안 되는 작품은 직접 적어주세요.
        </p>
      </div>
      <div className="form-group" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {!isBook && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: 0 }}>
            <input type="checkbox" checked={manualOverride} onChange={e => setManualOverride(e.target.checked)} />
            정보 수동 고정 {isTmdb && <span style={{ color: 'var(--subtext)', fontSize: 12 }}>(자동 동기화가 이 작품 정보를 덮어쓰지 않음)</span>}
          </label>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: 0 }}>
          <input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} />
          캘린더에서 숨김
        </label>
      </div>
      <div className="form-group"><label>{type === 'movie' ? '감독 (쉼표 구분)' : isBook ? '작가 (쉼표 구분)' : '연출·제작 (쉼표 구분)'}</label><input className="form-input" value={creators} onChange={e => setCreators(e.target.value)} placeholder={isBook ? '작가명' : '봉준호, 송강호'} /></div>

      {/* ── 상세 정보 (영상 전용 · 캘린더 모달) — 웹툰/웹소설에는 숨김 ── */}
      {!isBook && (<>
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
        <div className="form-group">
          <label>OTT 제공 (아이콘 표시 · 캘린더/상세)</label>
          <div className="tag-chips">
            {OTT_FILTERS.map(o => (
              <span key={o.name} className={`tag-chip ${ott.includes(o.name) ? 'active' : ''}`} onClick={() => toggleOtt(o.name)}>{o.label}</span>
            ))}
          </div>
        </div>
        <div className="form-group"><label>채널·방영사 (쉼표 구분)</label><input className="form-input" value={networks} onChange={e => setNetworks(e.target.value)} placeholder="tvN, Netflix" /></div>
        <div className="form-row" style={{ marginBottom: 10 }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}><label>러닝타임(분)</label><input className="form-input" type="number" value={runtime} onChange={e => setRuntime(e.target.value)} placeholder="60" /></div>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}><label>시즌 수</label><input className="form-input" type="number" value={seasons} onChange={e => setSeasons(e.target.value)} placeholder="1" /></div>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}><label>총 회차</label><input className="form-input" type="number" value={episodes} onChange={e => setEpisodes(e.target.value)} placeholder="16" /></div>
        </div>
      </>)}

      <PosterUploader value={posterUrl} onChange={setPosterUrl} />
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
