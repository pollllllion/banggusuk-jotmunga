import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToastStore } from '@/components/ui/Toast'
import { parseNaverKeywords } from '@/shared/naverKeywords.mjs'

type Row = { query: string; clicks: number; impressions: number; position?: number }
type Summary = { days: number; google: Row[]; naver: Row[]; updatedAt: string | null }

/**
 * 유입 검색어 — 밖에서 뭘 검색해 들어왔나.
 *
 * 이 값은 **우리 사이트에서 알 수 없다.** 브라우저가 referrer 에서 검색어를 지우고
 * 도메인만 넘기기 때문이다(src/utils/analytics.ts 주석). 그래서 검색엔진 쪽에서 받는다.
 *   구글  Search Console API 로 매일 자동 (scripts/fetch-gsc.mjs)
 *   네이버 공식 API 가 없다 — 서치어드바이저 화면에서 복사해 아래에 붙여넣는다.
 *         그쪽은 상위 30개·90일치만 보관하므로, 붙여넣어 두면 그 뒤로도 우리 DB 에 남는다.
 */
export function SearchQueriesSection({ days }: { days: number }) {
  const [data, setData] = useState<Summary | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const toast = useToastStore(s => s.show)

  const load = () => {
    setState('loading')
    void supabase.rpc('search_queries_summary', { p_days: days }).then(({ data: d, error }) => {
      if (error) { console.error('[search_queries_summary]', error.message); setState('error'); return }
      setData(d as Summary); setState('ready')
    })
  }
  useEffect(load, [days])

  if (state === 'loading') return <p className="settings-note" style={{ padding: '12px 0' }}>검색어 불러오는 중...</p>

  if (state === 'error') {
    return (
      <div className="settings-section">
        <h3>유입 검색어</h3>
        <p className="settings-desc">
          아직 <b>migration_search_queries.sql</b> 을 적용하지 않았어요. Supabase SQL Editor 에서 실행하면 여기에 표시됩니다.
        </p>
      </div>
    )
  }

  return (
    <>
      <QueryTable
        title="구글에서 검색해 들어온 말"
        note="Search Console 이 준 값이라 우리 기록과 무관하게 정확해요. 매일 새벽 자동으로 받아옵니다."
        rows={data?.google ?? []}
        empty="아직 받아온 검색어가 없어요. GSC_SERVICE_ACCOUNT_JSON 시크릿을 넣으면 다음 새벽부터 쌓입니다."
      />
      <QueryTable
        title="네이버에서 검색해 들어온 말"
        note="네이버는 API 가 없어서 손으로 옮겨요. 서치어드바이저는 상위 30개·90일치만 보관하니, 붙여넣어 두면 그 뒤로도 남습니다. 평균 순위는 네이버가 주지 않아 빈칸입니다."
        rows={data?.naver ?? []}
        empty="아직 붙여넣은 검색어가 없어요."
      />
      <NaverPaste onSaved={() => { toast('네이버 검색어를 저장했어요.'); load() }} />
    </>
  )
}

function QueryTable({ title, note, rows, empty }: {
  title: string; note: string; rows: Row[]; empty: string
}) {
  // 클릭 많은 순. 서버도 같은 순서로 주지만 여기서 한 번 더 세운다 —
  // 순위 번호를 붙인 표라서 순서가 흔들리면 번호가 거짓말이 된다.
  const sorted = [...rows].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
  const maxClicks = sorted.reduce((m, r) => Math.max(m, r.clicks), 0)
  const totalClicks = sorted.reduce((n, r) => n + r.clicks, 0)
  const totalImpressions = sorted.reduce((n, r) => n + r.impressions, 0)

  return (
    <div className="settings-section">
      <h3>{title}</h3>
      <p className="settings-desc">{note}</p>
      {!sorted.length ? <p className="settings-note">{empty}</p> : (
        <>
          <p className="qtable-total">
            검색어 <b>{sorted.length}</b>개 · 클릭 <b>{totalClicks.toLocaleString()}</b> · 노출 <b>{totalImpressions.toLocaleString()}</b>
          </p>
          {/* 숫자마다 이름을 달아 준다 — '18 327' 만 있으면 무엇이 무엇인지 매번 헤아리게 된다.
              머리글을 한 번 달아 두면 아래 줄들은 숫자만 읽으면 된다. */}
          {/* 구글·네이버가 같은 칸 구성을 쓴다. 네이버는 순위를 주지 않아 '-' 로 남는데,
              칸을 아예 없애면 두 표가 달라 보여 같은 것을 비교하는 중이라는 느낌이 깨진다 */}
          <div className="qtable cols-4">
            <div className="qtable-head">
              <span />
              <span>검색어</span>
              <span className="num">클릭</span>
              <span className="num">노출</span>
              <span className="num">CTR</span>
              <span className="num">평균 순위</span>
            </div>
            {sorted.map((r, i) => (
              <div key={r.query} className="qtable-row">
                <span className="qtable-rank">{i + 1}</span>
                <span className="qtable-query" title={r.query}>
                  {r.query}
                  {/* 막대는 클릭 기준 — 줄을 세운 기준과 같아야 눈이 헷갈리지 않는다 */}
                  <span className="qtable-bar">
                    <span style={{ width: `${maxClicks ? Math.max(2, Math.round((r.clicks / maxClicks) * 100)) : 0}%` }} />
                  </span>
                </span>
                <span className="num strong">{r.clicks.toLocaleString()}</span>
                <span className="num">{r.impressions.toLocaleString()}</span>
                <span className="num dim">{r.impressions ? `${((r.clicks / r.impressions) * 100).toFixed(1)}%` : '-'}</span>
                <span className="num dim">{r.position ? r.position.toFixed(1) : '-'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * 네이버 서치어드바이저 → 붙여넣기.
 * 표를 그대로 긁어 붙이면 되도록, 줄마다 "검색어 … 숫자 숫자" 형태를 알아서 읽는다
 * (규칙은 src/shared/naverKeywords.mjs — 테스트가 붙어 있다).
 */
function NaverPaste({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState('')
  const [day, setDay] = useState(() => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const toast = useToastStore(s => s.show)
  const parsed = parseNaverKeywords(text) as Row[]

  const save = async () => {
    if (!parsed.length || busy) return
    setBusy(true)
    const { error } = await supabase.from('search_queries').upsert(
      parsed.map(r => ({
        source: 'naver', day, query: r.query.slice(0, 200),
        clicks: r.clicks, impressions: r.impressions, position: null,
      })),
      { onConflict: 'source,day,query' },
    )
    setBusy(false)
    if (error) { toast('저장하지 못했어요: ' + error.message); return }
    setText('')
    onSaved()
  }

  return (
    <div className="settings-section">
      <h3>네이버 검색어 붙여넣기</h3>
      <p className="settings-desc">
        서치어드바이저 → <b>검색어 통계(유입 검색어)</b> 표를 긁어서 그대로 붙여넣으세요.
        줄마다 검색어와 숫자를 알아서 읽습니다. 같은 날짜에 다시 붙여넣으면 덮어씁니다.
      </p>
      <div className="settings-row" style={{ gap: 10 }}>
        <label>기준 날짜</label>
        <input className="form-input" type="date" value={day} max={new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)}
          onChange={e => setDay(e.target.value)} style={{ maxWidth: 180 }} />
      </div>
      <textarea
        className="form-input"
        rows={6}
        placeholder={'1\t방구석좆문가\t12\t340\n2\t넷플릭스 공개일\t8\t210'}
        value={text}
        onChange={e => setText(e.target.value)}
        style={{ width: '100%', marginTop: 8, fontFamily: 'monospace', fontSize: 13 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <button className="btn btn-primary" disabled={!parsed.length || busy} onClick={() => void save()}>
          {busy ? '저장 중...' : `${parsed.length}개 저장`}
        </button>
        {!!text.trim() && !parsed.length && (
          <span className="settings-note">읽을 수 있는 줄이 없어요. 검색어와 숫자가 같은 줄에 있어야 합니다.</span>
        )}
      </div>
      {!!parsed.length && (
        <p className="settings-note" style={{ marginTop: 8 }}>
          미리보기: {parsed.slice(0, 5).map(r => `${r.query}(${r.clicks})`).join(' · ')}
          {parsed.length > 5 && ` 외 ${parsed.length - 5}개`}
        </p>
      )}
    </div>
  )
}
