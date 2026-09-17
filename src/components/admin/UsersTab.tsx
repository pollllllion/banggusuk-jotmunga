import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { useToastStore } from '@/components/ui/Toast'
import { LevelTag } from '@/components/profile/LevelTag'
import { timeAgo } from '@/utils/helpers'
import type { AdminUserExtra } from '@/api/social'
import type { User } from '@/types'

type SortKey = 'joined-new' | 'joined-old' | 'active' | 'posts'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'joined-new', label: '최근 가입순' },
  { key: 'joined-old', label: '오래된 가입순' },
  { key: 'active', label: '최근 활동순' },
  { key: 'posts', label: '글 많은 순' },
]

type Kind = 'all' | 'real' | 'persona' | 'app' | 'banned'

const DEVICE_LABELS: Record<string, string> = { ios: '아이폰', android: '안드로이드', desktop: 'PC' }

/** 글·댓글 목록을 펼쳤을 때 한 번에 보여줄 줄 수 */
const ACTIVITY_LIMIT = 30

/**
 * 사용자 탭 — 검색 · 정렬 · 구분(일반/에디터/앱) · 사람별 글·댓글.
 *
 * 값이 두 군데서 온다.
 *   profiles(캐시)        닉네임·가입일·출석·앱으로 연 기기(appInstalledOn) — 누구나 읽는 표
 *   admin_user_list(RPC)  이메일·에디터 여부·마지막 로그인·알림 구독 — 관리자만
 * RPC 가 실패해도(마이그레이션 전) 앞쪽만으로 화면은 굴러간다 — 그 칸들만 빈다.
 *
 * '앱 사용'은 **앱(홈 화면)으로 연 적이 있나**다. 지금 쓰고 있는지는 알 수 없다 —
 * appInstalledOn 은 설치 권유를 멈추려고 한 번 적어 두는 값이라 지운 뒤에도 남는다.
 */
export function UsersTab({ rerender }: { rerender: () => void }) {
  const toast = useToastStore(s => s.show)
  const [extra, setExtra] = useState<Map<string, AdminUserExtra> | null>(null)
  const [extraFailed, setExtraFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('joined-new')
  const [kind, setKind] = useState<Kind>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void DS.fetchAdminUserList().then(list => {
      if (!alive) return
      if (!list) { setExtraFailed(true); return }
      setExtra(new Map(list.map(x => [x.id, x])))
    })
    return () => { alive = false }
  }, [])

  const users = DS.getAccounts()
  const posts = DS.getDiscussions()
  const comments = DS.getDiscussionComments()

  /** 사람별 글·댓글 수와 마지막으로 쓴 시각 — 매 렌더마다 전체를 다시 훑지 않게 한 번에 센다 */
  const stats = useMemo(() => {
    const m = new Map<string, { posts: number; comments: number; lastAt: string }>()
    const bump = (id: string | null | undefined, field: 'posts' | 'comments', at: string) => {
      if (!id) return
      const s = m.get(id) || { posts: 0, comments: 0, lastAt: '' }
      s[field]++
      if (at > s.lastAt) s.lastAt = at
      m.set(id, s)
    }
    for (const p of posts) bump(p.authorId, 'posts', p.createdAt)
    for (const c of comments) if (!c.deleted) bump(c.authorId, 'comments', c.createdAt)
    return m
  }, [posts, comments])

  const isPersona = (u: User) => extra?.get(u.id)?.persona === true
  const usesApp = (u: User) => !!u.appInstalledOn?.length
  /** 최근 활동 — 마지막 로그인·마지막 출석·마지막 글 중 가장 늦은 것 */
  const lastActive = (u: User): string => {
    const cands = [extra?.get(u.id)?.lastSignInAt || '', u.lastVisit || '', stats.get(u.id)?.lastAt || '']
    return cands.sort().pop() || ''
  }

  /** 계정 권한 변경(좋문가·정지) — 서버까지 간 걸 확인한 뒤에 성공을 알린다.
   *  RLS 거부는 throw 하지 않고 { error } 로 오므로, 확인하지 않으면 조용히 실패한다. */
  const setAccount = async (u: User, patch: Partial<User>, done: string) => {
    try { await DS.updateProfileRow(u.id, patch); toast(done) }
    catch (e) { toast(e instanceof Error ? e.message : '처리하지 못했어요.') }
    rerender()
  }

  const counts = {
    all: users.length,
    real: extra ? users.filter(u => !isPersona(u)).length : null,
    persona: extra ? users.filter(isPersona).length : null,
    app: users.filter(usesApp).length,
    banned: users.filter(u => u.banned).length,
  }
  const KINDS: { key: Kind; label: string; n: number | null; needsExtra?: boolean }[] = [
    { key: 'all', label: '전체', n: counts.all },
    { key: 'real', label: '일반 회원', n: counts.real, needsExtra: true },
    { key: 'persona', label: '에디터(페르소나)', n: counts.persona, needsExtra: true },
    { key: 'app', label: '앱 사용', n: counts.app },
    { key: 'banned', label: '정지', n: counts.banned },
  ]

  const q = query.trim().toLowerCase()
  const shown = users
    .filter(u => {
      if (kind === 'real') return !isPersona(u)
      if (kind === 'persona') return isPersona(u)
      if (kind === 'app') return usesApp(u)
      if (kind === 'banned') return !!u.banned
      return true
    })
    .filter(u => !q
      || u.nickname.toLowerCase().includes(q)
      || (extra?.get(u.id)?.email || '').toLowerCase().includes(q))
    .sort((a, b) => {
      if (sort === 'joined-old') return a.createdAt.localeCompare(b.createdAt)
      if (sort === 'active') return lastActive(b).localeCompare(lastActive(a))
      if (sort === 'posts') {
        const sa = stats.get(a.id), sb = stats.get(b.id)
        return ((sb?.posts || 0) + (sb?.comments || 0)) - ((sa?.posts || 0) + (sa?.comments || 0))
      }
      return b.createdAt.localeCompare(a.createdAt)
    })

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: 180, maxWidth: 320, marginBottom: 0 }}
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoComplete="off" placeholder="닉네임·이메일 검색…"
        />
        <select className="form-input" style={{ width: 'auto', marginBottom: 0 }} value={sort}
          aria-label="정렬" onChange={e => setSort(e.target.value as SortKey)}>
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--subtext)' }}>{shown.length}명</span>
      </div>

      <div className="admin-range" style={{ flexWrap: 'wrap' }}>
        {KINDS.map(k => (
          <button key={k.key}
            className={kind === k.key ? 'filter-btn active' : 'filter-btn'}
            disabled={k.needsExtra && !extra}
            onClick={() => setKind(k.key)}>
            {k.label}{k.n != null && ` ${k.n}`}
          </button>
        ))}
      </div>

      {extraFailed && (
        <p className="settings-note" style={{ marginBottom: 12 }}>
          이메일·에디터 구분·마지막 로그인을 불러오지 못했어요. <b>migration_admin_user_list.sql</b> 을
          Supabase SQL Editor 에서 실행하면 표시됩니다.
        </p>
      )}

      {!shown.length && <p style={{ color: 'var(--subtext)', padding: '16px 0' }}>해당하는 사용자가 없습니다.</p>}

      {shown.map(u => {
        const x = extra?.get(u.id)
        const s = stats.get(u.id)
        const active = lastActive(u)
        const open = openId === u.id
        return (
          <div key={u.id} className="admin-card fade-in" style={{ flexWrap: 'wrap' }}>
            <div className="admin-card-body">
              <div className="value" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Link to={`/u/${u.id}`} title="이 사람의 피드 보기" style={{ color: 'var(--text)', fontWeight: 600 }}>{u.nickname}</Link>
                <LevelTag authorId={u.id} />
                {u.role === 'admin' && <span className="user-badge admin">관리자</span>}
                {x && (x.persona
                  ? <span className="user-badge persona">에디터</span>
                  : <span className="user-badge real">일반</span>)}
                {usesApp(u) && (
                  <span className="user-badge app" title="앱(홈 화면)으로 연 적이 있는 기기">
                    앱 · {u.appInstalledOn!.map(d => DEVICE_LABELS[d] || d).join('·')}
                  </span>
                )}
                {!!x?.pushCount && <span className="user-badge" title={`공개 알림(웹푸시)을 켠 기기 ${x.pushCount}대`}>🔔 알림 켬</span>}
                {x?.email && <span style={{ color: 'var(--subtext)', fontSize: 12, fontWeight: 400 }}>{x.email}</span>}
              </div>
              <div className="label" style={{ marginTop: 4 }}>
                가입 {new Date(u.createdAt).toLocaleDateString('ko-KR')}
                {' · '}최근 활동 {active ? timeAgo(active.length === 10 ? active + 'T00:00:00+09:00' : active) : '없음'}
                {' · '}방문 {u.visitDays || 0}일
                {u.expert && <span style={{ color: 'var(--primary)', fontWeight: 600 }}> · 👑 좋문가</span>}
                {u.banned && <span style={{ color: 'var(--danger)', fontWeight: 600 }}> · 정지됨</span>}
              </div>
              <div className="label">
                <button type="button" className="user-activity-toggle" onClick={() => setOpenId(open ? null : u.id)}
                  disabled={!s} aria-expanded={open}>
                  글 {s?.posts || 0} · 댓글 {s?.comments || 0}{s ? (open ? ' ▴' : ' ▾') : ''}
                </button>
              </div>
            </div>

            {u.role !== 'admin' && (
              <div className="admin-card-actions">
                {/* 좋문가는 XP 로 못 오르는 마지막 칸 — 여기서만 준다 (migration_level_simplify.sql) */}
                {u.expert
                  ? <button className="btn btn-secondary btn-small" onClick={() => void setAccount(u, { expert: false }, `'${u.nickname}' 좋문가를 해제했습니다.`)}>좋문가 해제</button>
                  : <button className="btn btn-secondary btn-small" onClick={() => { if (!confirm(`'${u.nickname}' 님을 좋문가로 지정할까요?`)) return; void setAccount(u, { expert: true }, `'${u.nickname}' 님이 좋문가가 되었습니다.`) }}>좋문가 지정</button>}
                {u.banned
                  ? <button className="btn btn-primary btn-small" onClick={() => void setAccount(u, { banned: false }, '정지가 해제되었습니다.')}>정지 해제</button>
                  : <button className="btn btn-danger-solid btn-small" onClick={() => { if (!confirm('이 사용자를 정지하시겠습니까?')) return; void setAccount(u, { banned: true }, '사용자가 정지되었습니다.') }}>정지</button>}
              </div>
            )}

            {open && <UserActivity userId={u.id} />}
          </div>
        )
      })}
    </>
  )
}

/**
 * 한 사람이 쓴 글·댓글 — 최신순으로 섞어서. 프로필의 공개 설정과 무관하게 전부 보인다
 * (신고 처리·정지 판단에 필요하다). 누르면 그 글로 간다.
 */
function UserActivity({ userId }: { userId: string }) {
  const [limit, setLimit] = useState(ACTIVITY_LIMIT)
  const posts = DS.getDiscussions()
  const rows = [
    ...posts.filter(p => p.authorId === userId).map(p => ({
      key: 'p' + p.id, kind: '글', to: `/talk/${p.id}`, at: p.createdAt,
      text: p.title || p.body.slice(0, 80),
      sub: DS.getContentById(p.contentId)?.title || '자유방',
    })),
    ...DS.getDiscussionComments().filter(c => c.authorId === userId && !c.deleted).map(c => ({
      key: 'c' + c.id, kind: '댓글', to: `/talk/${c.discussionId}`, at: c.createdAt,
      text: c.body.slice(0, 80),
      sub: posts.find(p => p.id === c.discussionId)?.title || '(제목 없음)',
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="user-activity">
      {rows.slice(0, limit).map(r => (
        <Link key={r.key} to={r.to} className="user-activity-row">
          <span className={`user-activity-kind ${r.kind === '글' ? 'post' : ''}`}>{r.kind}</span>
          <span className="user-activity-text">{r.text}</span>
          <span className="user-activity-sub">{r.sub} · {timeAgo(r.at)}</span>
        </Link>
      ))}
      {rows.length > limit && (
        <button type="button" className="user-activity-toggle" onClick={() => setLimit(l => l + ACTIVITY_LIMIT)}>
          더 보기 ({rows.length - limit}개 남음)
        </button>
      )}
    </div>
  )
}
