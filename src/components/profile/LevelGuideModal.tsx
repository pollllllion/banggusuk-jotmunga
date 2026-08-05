import { LEVEL_TIERS, XP_RULE, EXPERT_RULE, ANTIABUSE, QUALITY_CURVE } from '@/utils/level'

/** 방좋 레벨 시스템 안내 — 티어 목록 + XP 획득 + 좋문가 자격 조건. */
export function LevelGuideModal({ currentTierIndex, onClose }: { currentTierIndex?: number; onClose: () => void }) {
  const overlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() }
  const curve = QUALITY_CURVE.filter(([n]) => [1, 5, 10, 50, 100].includes(n))

  return (
    <div className="modal-overlay show" onClick={overlayClick}>
      <div className="modal level-guide" style={{ maxWidth: 480, width: '94vw' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>🏅 방좋 레벨 시스템</h3>
        <p className="lg-sub">
          <b>활동 레벨</b>(재미)과 <b>좋문가 자격</b>(권위)은 분리돼요.
          많이 하는 사람보다 <b>다른 사람에게 가치 있는 활동</b>을 꾸준히 하는 사람이 높이 올라갑니다.
        </p>

        {/* 활동 레벨 티어 */}
        <div className="lg-sec-title">활동 레벨 · 총 {LEVEL_TIERS.length}단계</div>
        <div className="lg-tiers">
          {LEVEL_TIERS.map((t, i) => (
            <div key={t.name} className={`lg-tier ${i === currentTierIndex ? 'cur' : ''}`}>
              <span className="lg-tier-emoji">{t.emoji}</span>
              <span className="lg-tier-lv">Lv.{i + 1}</span>
              <span className="lg-tier-name">{t.name}</span>
              <span className="lg-tier-xp">{t.min.toLocaleString()} XP</span>
              {i === currentTierIndex && <span className="lg-tier-here">현재</span>}
            </div>
          ))}
        </div>

        {/* XP 획득 */}
        <div className="lg-sec-title">XP 어떻게 오르나</div>
        <ul className="lg-list">
          <li>토론글 작성 — 장문(200자+) <b>+{XP_RULE.postLong}</b> / 단문 <b>+{XP_RULE.postShort}</b></li>
          <li>받은 추천 — 많을수록 <b>증가폭이 줄어드는</b> 품질 점수:
            <span className="lg-curve">{curve.map(([n, xp]) => <span key={n}>{n}개→{xp}</span>)}</span>
          </li>
          <li>시청 등록 <b>+{XP_RULE.watchedEach}</b> (상한 {XP_RULE.watchedCap}) · 유효 댓글 <b>+{XP_RULE.commentEach}</b> (상한 {XP_RULE.commentCap})</li>
          <li>출석 <b>+{XP_RULE.attendanceEach}</b>/일 (상한 {XP_RULE.attendanceCap})</li>
        </ul>
        <p className="lg-note">
          ⚖️ 공정성: 추천은 <b>추천자당 최대 {ANTIABUSE.perLikerCap}</b>까지만 인정되고,
          서로 반복 추천(품앗이)하면 크게 깎여요. 글이 삭제되면 XP도 자동 회수됩니다.
        </p>

        {/* 좋문가 자격 */}
        <div className="lg-sec-title">🛋️ 좋문가 자격 (분야별 · 별도 권위)</div>
        <p className="lg-note">XP만으로는 못 돼요. 아래를 <b>동시에</b> 충족해야 그 분야 좋문가가 됩니다.</p>
        <ul className="lg-list">
          <li>가입 <b>{EXPERT_RULE.minAgeDays}일+</b></li>
          <li>그 분야 평가(별점 단 글) <b>{EXPERT_RULE.minRated}개+</b></li>
          <li>그 분야 장문글({EXPERT_RULE.expertLongMin}자+) <b>{EXPERT_RULE.minLong}개+</b></li>
          <li>그 분야에서 받은 추천 <b>{EXPERT_RULE.minNetLikes}+</b></li>
        </ul>
        <p className="lg-note">
          단계: 🔰 예비 → 🛋️ 인증 → 👑 수석
          (수석: 평가 {EXPERT_RULE.seniorRated}·장문 {EXPERT_RULE.seniorLong}·추천 {EXPERT_RULE.seniorNetLikes}).
          좋문가의 평은 작품·리뷰에서 배지로 강조되고, 별점은 <b>좋문가 평점</b>으로 따로 집계돼요.
        </p>
      </div>
    </div>
  )
}
