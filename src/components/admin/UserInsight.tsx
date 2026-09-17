import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import * as DS from '@/api/dataService'
import { timeAgo } from '@/utils/helpers'
import { TYPE_LABELS } from '@/utils/constants'
import { Table } from './AnalyticsTab'
import type { MembersOverview, UserInsight } from '@/api/social'

/**
 * 회원 분석 — 사용자 탭에 붙는 두 조각 (migration_user_insight.sql).
 *   MembersOverviewPanel  회원 전체: 뭘 기다리고(공개알림) 뭘 찾고(검색) 어디서 떨어져 나가나
 *   UserInsightPanel      한 사람: 공개알림·찜·검색·본 작품·발자취
 *
 * 원본 표(page_views·user_events)는 클라이언트가 못 읽는다. 관리자 전용 함수가 주는 것만 그린다.
 * 에디터(페르소나)·관리자는 '전체' 쪽에서 서버가 뺀다 — 우리가 누른 것이 회원 취향처럼 보이면 안 된다.
 */

const RANGES = [
  { days: 1, label: '오늘' },
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
  { days: 180, label: '180일' },
]

const EVENT_LABELS: Record<string, string> = {
  alert_on: '공개알림 켬', alert_off: '공개알림 끔',
  bookmark_on: '찜', bookmark_off: '찜 해제',
  push_on: '이 기기 알림 켬', push_off: '이 기기 알림 끔',
}

const SECTION_LABELS: Record<string, string> = {
  '/': '홈(캘린더)', '/content': '작품 상세', '/talk': '토론방', '/board': '게시판', '/browse': '작품 찾기',
  '/search': '통합검색', '/u': '남의 프로필', '/me': '마이페이지', '/feed': '내 피드', '/follows': '관심 피드',
  '/bookmarks': '찜 목록', '/settings': '설정', '/ranking': '랭킹', '/curation': '큐레이션',
  '/admin': '관리자', '/auth': '로그인·가입',
}
const sectionLabel = (s: string) => SECTION_LABELS[s] ? `${SECTION_LABELS[s]} ${s === '/' ? '' : s}`.trim() : s

const MIGRATION_NOTE = (
  <p className="settings-note">
    불러오지 못했어요. <b>migration_user_insight.sql</b> 을 Supabase SQL Editor 에서 실행하면 표시됩니다.
  </p>
)

const workLabel = (w: { title: string | null; contentId?: string | null; type?: string | null }) =>
  (w.title || w.contentId || '(지워진 작품)') + (w.type && TYPE_LABELS[w.type] ? ` · ${TYPE_LABELS[w.type]}` : '')

/** 0~23시 막대 — 몇 시에 오는 사람(들)인가 */
function Hours({ hours }: { hours: { hour: number; views: number }[] }) {
  const byHour = new Map(hours.map(h => [h.hour, h.views]))
  const max = Math.max(1, ...hours.map(h => h.views))
  return (
    <div className="insight-hours" role="img" aria-label="시간대별 이용">
      {Array.from({ length: 24 }, (_, h) => {
        const v = byHour.get(h) || 0
        return (
          <span key={h} className="insight-hour" title={`${h}시 · ${v}뷰`}>
            <span className="insight-hour-fill" style={{ height: `${v ? Math.max(6, Math.round((v / max) * 100)) : 0}%` }} />
            {h % 6 === 0 && <small>{h}</small>}
          </span>
        )
      })}
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="settings-section">
      <h3>{title}</h3>
      {note && <p className="settings-desc">{note}</p>}
      {children}
    </div>
  )
}

// ── 회원 전체 ───────────────────────────────────────────────
export function MembersOverviewPanel() {
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState(30)
  const [data, setData] = useState<MembersOverview | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!open) return
    let alive = true
    setState('loading')
    void DS.fetchMembersOverview(days).then(d => {
      if (!alive) return
      if (!d) { setState('error'); return }
      setData(d); setState('ready')
    })
    return () => { alive = false }
  }, [open, days])

  const f = data?.funnel
  const pct = (n: number) => (f && f.members ? ` · ${Math.round((n / f.members) * 100)}%` : '')

  return (
    <div className="insight-overview">
      <button type="button" className="insight-overview-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        📊 회원 종합 분석 {open ? '▴' : '▾'}
        <small>공개알림·검색어·많이 본 작품 — 에디터·관리자 제외</small>
      </button>

      {open && (
        <div className="insight-body">
          <div className="admin-range">
            {RANGES.map(r => (
              <button key={r.days} className={days === r.days ? 'filter-btn active' : 'filter-btn'} onClick={() => setDays(r.days)}>
                {r.label}
              </button>
            ))}
          </div>

          {state === 'loading' && <p className="settings-note">불러오는 중...</p>}
          {state === 'error' && MIGRATION_NOTE}

          {state === 'ready' && data && f && (
            <>
              <div className="stat-cards">
                <div className="stat-card"><span className="stat-card-label">회원</span><b>{f.members}</b><small>이 기간 가입 {f.newInDays}</small></div>
                <div className="stat-card"><span className="stat-card-label">최근 7일 접속</span><b>{f.active7}</b><small>{data.days === 1 ? '오늘' : `${data.days}일 안`} {f.activeInDays}명</small></div>
                <div className="stat-card"><span className="stat-card-label">공개알림 건 회원</span><b>{f.alerted}</b><small>기기 알림 켬 {f.pushOn}</small></div>
                <div className="stat-card"><span className="stat-card-label">글 쓴 회원</span><b>{f.wrote}</b><small>댓글 {f.commented}</small></div>
                <div className="stat-card"><span className="stat-card-label">앱으로 연 회원</span><b>{f.appUsers}</b><small>홈 화면 설치</small></div>
              </div>

              <Table
                title="가입한 뒤 어디까지 쓰나"
                note="가입만 하고 끝나는지, 어느 기능에서 붙는지. 기간과 무관한 누적이다."
                empty=""
                rows={[
                  { label: '가입', value: f.members },
                  { label: data.days === 1 ? '오늘 접속' : `${data.days}일 안에 접속`, value: f.activeInDays, sub: pct(f.activeInDays) },
                  { label: '본 작품 등록', value: f.watched, sub: pct(f.watched) },
                  { label: '찜', value: f.bookmarked, sub: pct(f.bookmarked) },
                  { label: '공개알림', value: f.alerted, sub: pct(f.alerted) },
                  { label: '기기 알림(푸시) 켬', value: f.pushOn, sub: pct(f.pushOn) },
                  { label: '댓글', value: f.commented, sub: pct(f.commented) },
                  { label: '글', value: f.wrote, sub: pct(f.wrote) },
                ]}
              />

              <Table
                title="공개알림이 많이 걸린 작품"
                note="회원들이 지금 기다리는 작품. 큐레이션·시드 주제를 고를 때 본다."
                empty="아직 공개알림을 건 회원이 없어요."
                rows={data.topAlerts.map(a => ({
                  label: workLabel(a) + (a.releaseDate ? ` · ${a.releaseDate}` : ''), value: a.count, sub: '명',
                }))}
              />
              <Table title="찜이 많은 작품" empty="아직 없어요."
                rows={data.topBookmarks.map(a => ({ label: workLabel(a), value: a.count, sub: '명' }))} />
              <Table
                title="회원이 검색한 말"
                note="헤더 통합검색·작품 찾기·검색 제안에서 고른 것까지. 자주 나오는데 작품이 없으면 등록 후보다."
                empty="이 기간에 회원이 검색한 기록이 없어요."
                rows={data.topQueries.map(q => ({ label: q.q, value: q.count, sub: ` · ${q.members}명` }))}
              />
              <Table
                title="회원이 많이 들여다본 작품"
                empty="기록이 없어요."
                rows={data.topContents.map(c => ({ label: workLabel(c), value: c.members, sub: `명 · ${c.views}뷰` }))}
              />
              <Table
                title="알림·찜을 끈 작품"
                note="기대가 식은 작품. 이 기능을 넣은 뒤부터 쌓인다."
                empty="아직 기록이 없어요."
                rows={data.topDropped.map(d => ({
                  label: `${d.title || d.contentId || '(지워진 작품)'} · ${EVENT_LABELS[d.name] || d.name}`, value: d.count,
                }))}
              />
              <Table title="어느 메뉴를 쓰나" empty="기록이 없어요."
                rows={data.sections.map(s => ({ label: sectionLabel(s.section), value: s.views, sub: ` · ${s.members}명` }))} />

              <Section title="몇 시에 오나" note="한국 시간. 글·알림을 올릴 시간대를 고를 때 본다.">
                <Hours hours={data.hours} />
              </Section>

              <Table
                title="날짜별 접속 회원"
                empty="기록이 없어요."
                rows={[...data.daily].reverse().slice(0, 30).map(d => ({
                  label: d.day, value: d.active, sub: d.signups ? ` · 가입 ${d.signups}` : undefined,
                }))}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── 회원 한 명 ──────────────────────────────────────────────
export function UserInsightPanel({ userId }: { userId: string }) {
  const [data, setData] = useState<UserInsight | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [trailOpen, setTrailOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void DS.fetchUserInsight(userId).then(d => {
      if (!alive) return
      if (!d) { setState('error'); return }
      setData(d); setState('ready')
    })
    return () => { alive = false }
  }, [userId])

  if (state === 'loading') return <div className="user-activity"><p className="settings-note">불러오는 중...</p></div>
  if (state === 'error' || !data) return <div className="user-activity">{MIGRATION_NOTE}</div>

  const t = data.totals
  const perDay = t.activeDays ? Math.round(t.views / t.activeDays) : 0

  return (
    <div className="user-activity insight-body">
      <div className="stat-cards">
        <div className="stat-card"><span className="stat-card-label">접속한 날</span><b>{t.activeDays}</b><small>하루 평균 {perDay}뷰 · 최근 180일</small></div>
        <div className="stat-card"><span className="stat-card-label">공개알림</span><b>{data.alerts.length}</b>
          <small>{data.push.devices ? `알림 기기 ${data.push.devices}대${data.push.failing ? ` (실패 ${data.push.failing})` : ''}` : '기기 알림 꺼짐 — 알림이 안 간다'}</small></div>
        <div className="stat-card"><span className="stat-card-label">찜 · 본 작품</span><b>{data.bookmarkCount} · {data.watchedCount}</b>
          <small>{data.watchedTypes.slice(0, 3).map(w => `${TYPE_LABELS[w.type] || w.type} ${w.count}`).join(' · ') || '없음'}</small></div>
        <div className="stat-card"><span className="stat-card-label">관계</span><b>{data.social.followers} · {data.social.following}</b>
          <small>관심 받음 · 관심 등록 · 준 추천 {data.social.likesGiven}</small></div>
        <div className="stat-card"><span className="stat-card-label">신고</span><b>{data.social.reportsReceived} · {data.social.reportsFiled}</b><small>받음 · 함</small></div>
      </div>

      <Section title={`공개알림 건 작품 ${data.alerts.length}`}>
        {!data.alerts.length ? <p className="settings-note">없어요.</p> : (
          <div className="insight-chips">
            {data.alerts.map(a => (
              <Link key={a.contentId} to={`/content/${a.contentId}`} className="insight-chip" title={`${timeAgo(a.createdAt!)}에 켬`}>
                {a.title || a.contentId}{a.releaseDate && <small> {a.releaseDate}</small>}
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title={`검색 ${data.searches.length}`} note="→ 뒤는 검색 제안에서 바로 고른 작품·글.">
        {!data.searches.length ? <p className="settings-note">검색 기록이 없어요.</p> : (
          <div className="insight-rows">
            {data.searches.map((s, i) => (
              <div key={i} className="user-activity-row">
                <span className="user-activity-text">“{s.q || '(빈 검색)'}”{s.picked && <span style={{ color: 'var(--subtext)' }}> → {s.picked}</span>}</span>
                <span className="user-activity-sub">{timeAgo(s.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Table title="많이 들여다본 작품" empty="작품 상세를 본 기록이 없어요."
        rows={data.topContents.map(c => ({ label: c.title || c.contentId, value: c.views, sub: ` · ${timeAgo(c.lastAt)}` }))} />

      {!!data.bookmarks.length && (
        <Section title={`찜 ${data.bookmarkCount}`}>
          <div className="insight-chips">
            {data.bookmarks.map(b => <Link key={b.contentId} to={`/content/${b.contentId}`} className="insight-chip">{b.title || b.contentId}</Link>)}
          </div>
        </Section>
      )}

      {!!data.watched.length && (
        <Section title={`본 작품 ${data.watchedCount}`} note="최근 등록 30개.">
          <div className="insight-chips">
            {data.watched.map(w => (
              <Link key={w.contentId} to={`/content/${w.contentId}`} className="insight-chip">
                {w.title || w.contentId}{w.rating != null && <small> ★{w.rating}</small>}
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Table title="어느 메뉴를 쓰나" empty="기록이 없어요."
        rows={data.sections.map(s => ({ label: sectionLabel(s.section), value: s.views }))} />

      <Section title="몇 시에 오나"><Hours hours={data.hours} /></Section>

      {!!data.refs.length && (
        <Table title="어디서 들어오나" empty="" rows={data.refs.map(r => ({ label: r.ref, value: r.views }))} />
      )}

      {!!data.events.length && (
        <Section title="켜고 끈 기록">
          <div className="insight-rows">
            {data.events.map((e, i) => (
              <div key={i} className="user-activity-row">
                <span className="user-activity-kind" style={{ width: 'auto' }}>{EVENT_LABELS[e.name] || e.name}</span>
                <span className="user-activity-text">{e.title || e.target || ''}</span>
                <span className="user-activity-sub">{timeAgo(e.at)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="최근 발자취">
        <button type="button" className="user-activity-toggle" onClick={() => setTrailOpen(v => !v)} aria-expanded={trailOpen}>
          최근 화면 이동 {data.trail.length}개 {trailOpen ? '▴' : '▾'}
        </button>
        {trailOpen && (
          <div className="insight-rows">
            {data.trail.map((p, i) => (
              <Link key={i} to={p.path} className="user-activity-row">
                <span className="user-activity-text">{p.title || sectionLabel(p.path)}{p.q && ` — “${p.q}”`}</span>
                <span className="user-activity-sub">{p.title ? p.path.split('/')[1] + ' · ' : ''}{timeAgo(p.at)}</span>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
