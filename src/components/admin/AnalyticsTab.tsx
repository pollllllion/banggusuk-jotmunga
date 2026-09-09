import { useEffect, useState } from 'react'
import * as DS from '@/api/dataService'
import type { AnalyticsSummary } from '@/api/social'

const RANGES = [
  { days: 1, label: '오늘' },
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
]

/** 막대 하나 — 값이 0이어도 자리는 남겨 목록이 들쭉날쭉해지지 않게 */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return <span className="stat-bar"><span className="stat-bar-fill" style={{ width: `${pct}%` }} /></span>
}

function Table({ title, rows, empty, note }: {
  title: string
  rows: { label: string; value: number; sub?: string }[]
  empty: string
  note?: string
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  return (
    <div className="settings-section">
      <h3>{title}</h3>
      {note && <p className="settings-desc">{note}</p>}
      {!rows.length ? (
        <p className="settings-note">{empty}</p>
      ) : (
        <div className="stat-list">
          {rows.map(r => (
            <div key={r.label} className="stat-row">
              <span className="stat-label" title={r.label}>{r.label}</span>
              <Bar value={r.value} max={max} />
              <span className="stat-value">
                {r.value.toLocaleString()}
                {r.sub && <small>{r.sub}</small>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 방문 통계 — 방문자·페이지뷰·유입 경로·사이트 안 검색어.
 *
 * ⚠️ **구글에서 뭘 검색해 들어왔는지는 여기 없다.** 구글이 리퍼러에서 검색어를
 *    지운 지 오래라 유입 경로에는 'google.com' 만 남는다. 그건 Search Console 몫이고,
 *    아래 안내에 연결 방법을 적어 뒀다.
 *    '사이트 안 검색어'는 우리 검색창에 친 말이라 성격이 다르다 —
 *    "사람들이 여기서 뭘 찾다가 못 찾았나"를 보는 데 쓴다.
 */
export function AnalyticsTab() {
  const [days, setDays] = useState(7)
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    setState('loading')
    DS.fetchAnalytics(days).then(d => {
      if (!alive) return
      if (!d) { setState('error'); return }
      setData(d); setState('ready')
    })
    return () => { alive = false }
  }, [days])

  const dailyMax = data?.daily.reduce((m, d) => Math.max(m, d.views), 0) ?? 0

  return (
    <>
      <div className="admin-range">
        {RANGES.map(r => (
          <button
            key={r.days}
            className={days === r.days ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setDays(r.days)}>
            {r.label}
          </button>
        ))}
      </div>

      {state === 'loading' && <p className="settings-note" style={{ padding: '20px 0' }}>불러오는 중...</p>}

      {state === 'error' && (
        <div className="settings-section">
          <h3>통계를 불러오지 못했어요</h3>
          <p className="settings-desc">
            아직 <b>migration_analytics.sql</b> 을 적용하지 않았을 수 있어요.
            Supabase SQL Editor 에서 실행하면 그때부터 쌓이기 시작합니다.
          </p>
        </div>
      )}

      {state === 'ready' && data && (
        <>
          <div className="stat-cards">
            <div className="stat-card">
              <span className="stat-card-label">방문자</span>
              <b>{data.totals.visitors.toLocaleString()}</b>
              <small>기기·브라우저 기준</small>
            </div>
            <div className="stat-card">
              <span className="stat-card-label">페이지뷰</span>
              <b>{data.totals.views.toLocaleString()}</b>
              <small>화면을 연 횟수</small>
            </div>
            <div className="stat-card">
              <span className="stat-card-label">로그인 회원</span>
              <b>{data.totals.members.toLocaleString()}</b>
              <small>이 기간에 들른 계정</small>
            </div>
          </div>

          <div className="settings-section">
            <h3>일자별</h3>
            {!data.daily.length ? (
              <p className="settings-note">아직 기록이 없어요.</p>
            ) : (
              <div className="stat-list">
                {[...data.daily].reverse().map(d => (
                  <div key={d.day} className="stat-row">
                    <span className="stat-label">{d.day.slice(5).replace('-', '. ')}</span>
                    <Bar value={d.views} max={dailyMax} />
                    <span className="stat-value">{d.views.toLocaleString()}<small>방문 {d.visitors}</small></span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Table
            title="많이 본 화면"
            rows={data.topPaths.map(p => ({ label: p.path, value: p.views, sub: `방문 ${p.visitors}` }))}
            empty="아직 기록이 없어요."
          />

          <Table
            title="유입 경로"
            note="어디서 눌러 들어왔는지(도메인만). 구글·네이버에서 무엇을 검색했는지는 검색엔진이 알려주지 않아요 — 아래 안내 참고."
            rows={data.topRefs.map(r => ({ label: r.ref, value: r.views }))}
            empty="아직 기록이 없어요."
          />

          <Table
            title="사이트 안 검색어"
            note="우리 검색창에 친 말이에요. 결과가 없던 말이 자주 보이면 그 작품을 등록할 때입니다."
            rows={data.topQueries.map(q => ({ label: q.q, value: q.count }))}
            empty="아직 검색 기록이 없어요."
          />

          <div className="settings-section">
            <h3>구글 검색어를 보려면</h3>
            <p className="settings-desc">
              구글은 2011년부터 리퍼러에서 검색어를 지웁니다. 사이트가 아무리 열심히 기록해도
              <b> ‘google.com 에서 왔다’ 까지만</b> 알 수 있어요. 실제 검색어·노출수·순위는
              <b> Google Search Console</b> 에서만 볼 수 있습니다.
            </p>
            <ol className="settings-desc" style={{ paddingLeft: 18, lineHeight: 2 }}>
              <li>search.google.com/search-console 에서 속성 추가 → <b>ottcal.com</b></li>
              <li>소유 확인은 <b>HTML 태그</b> 방식이 제일 쉬워요 (메타 태그 한 줄)</li>
              <li>확인되면 사이트맵 <b>https://ottcal.com/sitemap.xml</b> 제출</li>
            </ol>
            <p className="settings-note">
              메타 태그를 받으면 알려주세요 — index.html 에 넣어 배포해 드릴게요.
              네이버는 <b>서치어드바이저</b>가 같은 역할을 합니다.
            </p>
          </div>
        </>
      )}
    </>
  )
}
