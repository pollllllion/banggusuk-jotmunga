import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { computeSeasonRanking, computeOverallRanking, EXPERT_TIER, type SeasonEntry } from '@/utils/level'
import { LevelMark } from '@/components/profile/LevelMark'
import { Seo } from '@/components/seo/Seo'
import { clickable } from '@/utils/a11y'

const MEDALS = ['🥇', '🥈', '🥉']

function RankRow({ e, i, me, unit, navigate }: {
  e: SeasonEntry; i: number; me?: string; unit: string; navigate: (to: string) => void
}) {
  return (
    <div className={`ranking-row linkable ${i < 3 ? 'top' : ''} ${me === e.userId ? 'me' : ''}`} {...clickable(() => navigate(`/u/${e.userId}`), `${e.nickname} 프로필`)}>
      <span className="ranking-rank">{i < 3 ? MEDALS[i] : i + 1}</span>
      <div className="ranking-main">
        <div className="ranking-name-row">
          <span className="ranking-name">{e.nickname}</span>
          {/* 좋문가는 아래 알약이 왕관을 이미 그린다 — 마크까지 붙이면 왕관이 두 번 나온다 */}
          {e.expert
            ? <span className="expert-tag rank-senior">{EXPERT_TIER.emoji} {EXPERT_TIER.name}</span>
            : <LevelMark level={e.level.level} title={`Lv.${e.level.level} ${e.level.tier.name}`} />}
        </div>
        {/* 아래 줄은 글로만 적는다 — 마크는 바로 위 이름 옆에 있다(2px 아래에 또 그리면 겹쳐 보인다) */}
        <span className="ranking-tier">
          {e.expert
            ? <>{EXPERT_TIER.emoji} {EXPERT_TIER.name}</>
            : <>{e.level.tier.name} · Lv.{e.level.level}</>}
        </span>
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
      <Seo title="레벨" noindex />
      <div className="feed-header">
        <h2 className="feed-title">레벨</h2>
      </div>

      {/* 이달의 랭킹 */}
      <div className="ranking-section-title">이달의 랭킹</div>
      <p className="ranking-sub">최근 {season.days}일간의 활동 점수예요. 매달 새로 겨뤄서 신규 회원에게도 기회가 열려 있어요.</p>
      {!season.entries.length ? (
        <div className="empty-state fade-in"><p>아직 이번 시즌 활동이 없어요.</p></div>
      ) : (
        <div className="ranking-list fade-in">
          {season.entries.map((e, i) => <RankRow key={e.userId} e={e} i={i} me={user?.id} unit="pt" navigate={navigate} />)}
        </div>
      )}

      {/* 전체 랭킹 */}
      <div className="ranking-section-title" style={{ marginTop: 28 }}>전체 랭킹</div>
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
