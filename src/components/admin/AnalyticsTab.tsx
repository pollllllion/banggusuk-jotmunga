import { useEffect, useState } from 'react'
import * as DS from '@/api/dataService'
import { isInternalDevice, setInternalDevice } from '@/utils/analytics'
import { SearchQueriesSection } from './SearchQueriesSection'
import type { AnalyticsSummary } from '@/api/social'

/** 요일 — 주말에 누가 오는지 보려면 날짜만으로는 매번 달력을 봐야 한다 */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

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
 * 이 기기를 통계에서 뺄지. 관리자로 로그인하면 자동으로 켜지지만,
 * 남의 기기에서 잠깐 로그인한 경우엔 손으로 끌 수 있어야 한다.
 */
function DeviceToggle() {
  const [on, setOn] = useState(isInternalDevice)
  return (
    <div className="settings-section">
      <h3>이 기기</h3>
      <div className="notif-pref-row">
        <div className="notif-pref-text">
          <span className="notif-pref-label">이 기기의 방문을 통계에서 빼기</span>
          <span className="notif-pref-hint">
            관리자로 로그인하면 자동으로 켜집니다. 로그아웃하고 둘러봐도 계속 빠져요.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="이 기기의 방문을 통계에서 빼기"
          className={on ? 'switch on' : 'switch'}
          onClick={() => { setInternalDevice(!on); setOn(!on) }}>
          <span className="switch-knob" />
        </button>
      </div>
    </div>
  )
}

/**
 * 방문 통계 — 방문자·페이지뷰·유입 경로·유입 검색어·사이트 안 검색어.
 *
 * 검색어가 두 종류라 헷갈리기 쉽다. 성격이 아예 다르다.
 *   **유입 검색어**   밖에서 뭘 검색해 들어왔나. 우리 기록으로는 절대 알 수 없다 —
 *                    브라우저가 referrer 에서 검색어를 지우고 도메인만 넘긴다
 *                    (2026-09-09 실측 — 네이버도 'https://search.naver.com/' 만 온다).
 *                    그래서 검색엔진 쪽에서 받아 온다(SearchQueriesSection).
 *   **사이트 안 검색어** 들어와서 우리 검색창에 친 말. "뭘 찾다가 못 찾았나"를 본다.
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

  // "이만큼 뺐다"를 한 줄로. 없는 항목은 아예 말하지 않는다
  const excluded = [
    data?.totals.internalViews ? `우리 ${data.totals.internalViews.toLocaleString()}뷰` : '',
    data?.totals.botViews ? `크롤러 ${data.totals.botViews.toLocaleString()}뷰` : '',
  ].filter(Boolean).join(' · ')

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
              <small>우리 기기 제외</small>
            </div>
            <div className="stat-card">
              <span className="stat-card-label">검색으로 들어온 사람</span>
              <b>{(data.totals.searchVisitors ?? 0).toLocaleString()}</b>
              <small>네이버·구글 등에서</small>
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
            <div className="stat-card">
              <span className="stat-card-label">크롤러</span>
              <b>{(data.totals.botViews ?? 0).toLocaleString()}</b>
              <small>사람 수에는 안 들어감</small>
            </div>
          </div>

          {/* 숫자에서 무엇을 뺐는지 화면에 밝힌다 — 안 밝히면 "왜 줄었지"가 된다 */}
          <p className="settings-note" style={{ marginBottom: 16 }}>
            <b>방문자</b>는 사람만 센 수예요 — 우리(관리자) 기기와 크롤러를 뺐습니다{excluded && ` (${excluded})`}.
            그중 <b>검색으로 들어온 사람</b>이 밖에서 우리를 찾아온 방문자에 가장 가까운 숫자예요.
          </p>


          <div className="settings-section">
            <h3>일자별</h3>
            {!data.daily.length ? (
              <p className="settings-note">아직 기록이 없어요.</p>
            ) : (
              // 유입 검색어 표와 같은 모양을 쓴다 — 한 화면에 표가 여럿인데 모양이 제각각이면
              // 볼 때마다 어느 숫자가 무엇인지 다시 익혀야 한다
              <div className="qtable">
                <div className="qtable-head">
                  <span />
                  <span>날짜</span>
                  <span className="num">방문자</span>
                  <span className="num">페이지뷰</span>
                  <span className="num">1인당</span>
                </div>
                {[...data.daily].reverse().map((d, i) => (
                  <div key={d.day} className="qtable-row">
                    <span className="qtable-rank">{i === 0 ? '●' : ''}</span>
                    <span className="qtable-query">
                      {d.day.slice(5).replace('-', '. ')} ({WEEKDAYS[new Date(d.day + 'T00:00:00+09:00').getDay()]})
                      <span className="qtable-bar">
                        <span style={{ width: `${dailyMax ? Math.max(2, Math.round((d.views / dailyMax) * 100)) : 0}%` }} />
                      </span>
                    </span>
                    <span className="num strong">{d.visitors.toLocaleString()}</span>
                    <span className="num">{d.views.toLocaleString()}</span>
                    <span className="num dim">{d.visitors ? (d.views / d.visitors).toFixed(1) : '-'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 밖에서 뭘 검색해 들어왔나 — 검색엔진에서 받아 온 값이라 아래 '사이트 안 검색어'와 다르다 */}
          <SearchQueriesSection days={days} />

          <Table
            title="크롤러가 긁어간 양"
            note="검색엔진이 우리 페이지를 얼마나 읽고 갔나. 사람 숫자에는 안 들어갑니다. 색인이 도는 속도를 여기서 봅니다."
            rows={(data.bots ?? []).map(b => ({
              label: b.name, value: b.views, sub: `${b.paths.toLocaleString()}개 화면`,
            }))}
            empty="아직 크롤러 기록이 없어요."
          />

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

          {/* 설정이라 맨 아래 — 숫자를 보러 온 화면이지 스위치를 만지러 온 화면이 아니다 */}
          <DeviceToggle />
        </>
      )}
    </>
  )
}
