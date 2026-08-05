import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { computeSeasonRanking, computeOverallRanking, type SeasonEntry } from '@/utils/level'
import { Seo } from '@/components/seo/Seo'

const MEDALS = ['🥇', '🥈', '🥉']

function RankRow({ e, i, me, unit, navigate }: {
  e: SeasonEntry; i: number; me?: string; unit: string; navigate: (to: string) => void
}) {
  return (
    <div className={`ranking-row linkable ${i < 3 ? 'top' : ''} ${me === e.userId ? 'me' : ''}`} onClick={() => navigate(`/u/${e.userId}`)}>
      <span className="ranking-rank">{i < 3 ? MEDALS[i] : i + 1}</span>
      <div className="ranking-main">
        <div className="ranking-name-row">
          <span className="ranking-name">{e.nickname}</span>
          {e.topBadge && <span className={`expert-tag rank-${e.topBadge.rank}`}>{e.topBadge.emoji} {e.topBadge.label}</span>}
        </div>
        <span className="ranking-tier">{e.level.tier.emoji} {e.level.tier.name} · Lv.{e.level.tierIndex + 1}</span>
      </div>
      <span className="ranking-score"><b>{e.score}</b><small>{unit}</small></span>
    </div>
  )
}

export function RankingPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const season = useMemo(() => computeSeasonRanking(30), [])
  const overall = useMemo(() => computeOverallRanking(30), [])

  return (
    <>
      <Seo title="방구석 레벨" noindex />
      <div className="feed-header">
        <h2 className="feed-title">🏅 방구석 레벨</h2>
      </div>

      {/* 이달의 랭킹 */}
      <div className="ranking-section-title">🔥 이달의 랭킹</div>
      <p className="ranking-sub">최근 {season.days}일간의 활동 점수예요. 매달 새로 겨뤄서 신규 회원에게도 기회가 열려 있어요.</p>
      {!season.entries.length ? (
        <div className="empty-state fade-in"><p>아직 이번 시즌 활동이 없어요.</p></div>
      ) : (
        <div className="ranking-list fade-in">
          {season.entries.map((e, i) => <RankRow key={e.userId} e={e} i={i} me={user?.id} unit="pt" navigate={navigate} />)}
        </div>
      )}

      {/* 전체 랭킹 */}
      <div className="ranking-section-title" style={{ marginTop: 28 }}>🏆 전체 랭킹</div>
      <p className="ranking-sub">누적 활동 XP 기준 영구 순위예요.</p>
      {!overall.entries.length ? (
        <div className="empty-state fade-in"><p>아직 활동 기록이 없어요.</p></div>
      ) : (
        <div className="ranking-list fade-in">
          {overall.entries.map((e, i) => <RankRow key={e.userId} e={e} i={i} me={user?.id} unit="XP" navigate={navigate} />)}
        </div>
      )}
    </>
  )
}
