import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { Poster } from '@/components/content/Poster'
import { Avatar } from '@/components/profile/Avatar'
import { AvatarEditor } from '@/components/profile/AvatarEditor'
import { LevelTag } from '@/components/profile/LevelTag'
import { ExpertTag } from '@/components/profile/ExpertTag'
import { TasteEditModal, type TasteSection } from '@/components/profile/TasteProfile'
import { peopleOf, personPhotoUrl, ROLE_LABEL } from '@/utils/people'
import type { WatchedEntry } from '@/components/profile/WatchedShelf'
import { isExpertAuthor } from '@/utils/level'
import { scoreColor } from '@/utils/helpers'
import { clickable } from '@/utils/a11y'
import type { Content, FavoritePerson, User } from '@/types'

/**
 * 프로필 전시 — 인생작품 히어로 · 프로필 · 취향.
 *
 * 내 피드(/feed)와 남의 프로필(/u/:id)이 **같은 화면**을 쓴다. 본인이 꾸민 그대로
 * 남에게 보여야 꾸미는 뜻이 있고, 두 벌로 두면 한쪽만 고쳐지는 날이 온다.
 * 다른 점은 editable 하나다 — 편집 버튼·＋ 칩·공개 스위치가 붙느냐.
 *
 * 두 화면의 칸 차례 (2026-09-16 · 둘이 똑같아야 한다):
 *   여기(인생작품·프로필·취향) → 본 작품 → 찜한 작품 → 많이 본 장르(ProfileGenres) → 토론
 *
 * '매긴 별점' 목록은 없앴다. 본 작품 카드마다 ★ 점수가 이미 붙어 있고 별점순 정렬도
 * 되므로, 같은 값을 목록으로 한 번 더 늘어놓는 칸이었다. 프로필 위쪽 숫자(별점 N ·
 * 평균 점수)는 남는다 — 그건 목록이 아니라 요약이다.
 *
 * watched 를 밖에서 받는 이유: 남의 '본 작품'은 캐시에 없어서 화면이 따로 물어온다
 * (UserProfilePage 의 fetchUserWatched). 여기서 캐시를 읽으면 남의 것은 늘 0이 된다.
 */
export function ProfileShowcase({ user, watched, editable }: {
  user: User
  /** 이 사람이 본 작품들 (통계용, 목록에서 매긴 별점 포함) */
  watched: WatchedEntry[]
  /** 내 화면인가 — 편집 버튼과 공개 스위치가 붙는다 */
  editable: boolean
}) {
  const navigate = useNavigate()
  const updateProfile = useAuthStore(s => s.updateProfile)
  const toast = useToastStore(s => s.show)
  const [tasteOpen, setTasteOpen] = useState<TasteSection | null>(null)
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  const favWorks = (user.favoriteWorks ?? [])
    .map(id => DS.getContentById(id))
    .filter((c): c is Content => Boolean(c))
  const bio = user.tasteBio?.trim()
  const favGenres = user.favoriteGenres ?? []
  const favPeople = peopleOf(user)
  const favMakers = favPeople.filter(p => p.role === 'maker')
  const favActors = favPeople.filter(p => p.role === 'actor')

  /**
   * 프로필 숫자 칸에 쓸 별점 요약 — 몇 개 매겼나, 평균 몇 점인가.
   *
   * 1작품 1별점이라 작품당 한 번만 센다. 값은 두 군데서 온다:
   *   · 토론글에 단 별점   · 본 작품 목록에서 바로 매긴 별점
   * 같은 작품에 둘 다 있으면 **글 쪽이 이긴다** — 작품 평점을 낼 때와 같은 규칙이다
   * (api/discussions.ts 의 recomputeContentRating, supabase/migration_watched_rating.sql).
   *
   * 공개/비공개는 여기 안 본다. 감추는 건 '무엇을 봤나'(목록)지 '얼마나'(숫자)가 아니다.
   */
  const ratedIds = new Set<string>()
  const scores: number[] = []
  for (const p of DS.getDiscussionsByAuthor(user.id)) {
    // 자유방 글은 작품이 없다(contentId null) — 별점도 없다
    if (p.rating == null || !p.contentId || !DS.getContentById(p.contentId)) continue
    ratedIds.add(p.contentId)
    scores.push(p.rating)
  }
  for (const w of watched) {
    if (w.rating == null || ratedIds.has(w.content.id)) continue
    scores.push(w.rating)
  }
  const ratingCount = scores.length
  const avgRating = ratingCount
    ? Math.round((scores.reduce((s, n) => s + n, 0) / ratingCount) * 10) / 10
    : 0

  const openTaste = (section: TasteSection) => setTasteOpen(section)

  /**
   * 관심 — 이 사람의 새 별점·글을 관심 피드(/follows)에서 모아 본다.
   *
   * 목록은 내 것(profiles.follows)에만 남는다. **팔로워 수·명단은 어디에도 보여주지 않는다**
   * — 세는 순간 그게 점수가 된다.
   *
   * 담을 때 상대에게 알림은 보낸다(2026-09-13 결정). 그전까지는 담아도 상대가 몰라서
   * 관심 기능이 사실상 죽어 있었다(전체에 관심 관계 1건). "누가 날 지켜본다"는 감각이
   * 없으면 아무도 쓰지 않는다. 알림함에서 세어 보는 건 본인 알림함 안의 일이라
   * 공개 지표가 되지 않는다 — 화면에 숫자를 붙이지 않는 선은 그대로 지킨다.
   *
   * **알림 행은 여기서 만들지 않는다.** follows 가 바뀌면 서버 트리거가 만든다
   * (migration_follow_notify_server.sql). 처음엔 여기서 넣었는데, 홈 화면 PWA 로 쓰는
   * 사람은 서비스워커가 옛 자산을 캐시해 새 코드가 돌지 않아 알림이 조용히 빠졌다.
   * 뺄 때는 알리지 않는다 — 상대가 알 이유가 없는 일이다.
   */
  const me = useAuthStore(s => s.user)
  const isAccount = useAuthStore(s => s.isAccount)
  const canFollow = !editable && isAccount && !!me && DS.isAccountId(user.id)
  const following = (me?.follows ?? []).includes(user.id)
  const [followBusy, setFollowBusy] = useState(false)
  const toggleFollow = async () => {
    if (!me || followBusy) return
    setFollowBusy(true)
    const list = me.follows ?? []
    try {
      await updateProfile({ follows: following ? list.filter(id => id !== user.id) : [...list, user.id] })
      toast(following ? '관심에서 뺐어요.' : '관심에 담았어요. 관심 피드에서 모아 봐요.')
      rerender()
    } catch { toast('처리하지 못했어요.') }
    finally { setFollowBusy(false) }
  }

  return (
    <>
      {/* ── 히어로: 인생작품이 배경이 된다 ─────────────────────
          첫 화면이 '이 사람이 뭘 좋아하나'여야 한다.
          레벨은 여기 없다 — 닉네임 옆 아이콘 하나로 충분하다. */}
      <div className="feed-hero">
        <div className="feed-hero-label">
          인생작품
          {editable && favWorks.length > 0 && (
            <button className="feed-hero-edit" onClick={() => openTaste('works')}>편집</button>
          )}
        </div>
        {favWorks.length ? (
          <div className="feed-hero-works">
            {favWorks.map(c => (
              <div key={c.id} className="feed-hero-work" {...clickable(() => navigate(`/content/${c.id}`), c.title)}>
                <Poster content={c} showScore={false} />
              </div>
            ))}
          </div>
        ) : (
          <div className="feed-hero-empty">
            <p>{editable ? '인생작품을 고르면 여기 걸립니다.' : '아직 고른 인생작품이 없어요.'}</p>
            {editable && <button className="btn btn-primary btn-small" onClick={() => openTaste('works')}>작품 고르기</button>}
          </div>
        )}
      </div>

      {/* ── 프로필: 히어로 위로 걸친다 ───────────────────────── */}
      <div className="feed-profile">
        {/* 내 화면에서는 사진을 여기서 바로 바꾼다 — 사진을 고치자고 '내 정보'로 건너가지 않는다.
            남의 프로필에서는 그냥 그림이다(같은 자리·같은 크기). */}
        {editable
          ? <AvatarEditor size={72} onChanged={rerender} />
          : <Avatar src={user.avatarUrl} name={user.nickname} size={72} />}
        <div className="feed-profile-name">
          <span className="feed-profile-nick">{user.nickname}</span>
          {isExpertAuthor(user.id) ? <ExpertTag authorId={user.id} /> : <LevelTag authorId={user.id} />}
        </div>
        {/* 관심 — 그 사람 취향을 다 보고 나서 누르는 자리라 프로필 한가운데에 둔다.
            목록·댓글에 흩뿌리면 훑어보다 잘못 눌린다. 내 프로필에는 안 나온다. */}
        {canFollow && (
          <button className={`feed-follow ${following ? 'on' : ''}`} onClick={toggleFollow} disabled={followBusy}>
            {following ? '관심 중' : '+ 관심'}
          </button>
        )}
        {bio
          ? (
            <p className="feed-bio">
              {bio}
              {editable && <button className="feed-bio-edit" onClick={() => openTaste('bio')} aria-label="취향 한 줄 편집">편집</button>}
            </p>
          )
          : editable && <button className="feed-bio-add" onClick={() => openTaste('bio')}>취향 한 줄을 남겨보세요</button>}
        <div className="feed-stats">
          <div><b>{watched.length}</b><span>본 작품</span></div>
          <div><b>{ratingCount}</b><span>별점</span></div>
          <div>
            <b style={ratingCount ? { color: scoreColor(avgRating) } : undefined}>{ratingCount ? avgRating.toFixed(1) : '-'}</b>
            <span>평균 점수</span>
          </div>
        </div>
      </div>

      {/* ── 취향 칸 ───────────────────────────────────────────
          '취향' 이라는 묶음 제목은 두지 않는다 — 두 줄이 이미 제 말로 뭘 말하는지 밝히고 있다.
          비어 있어도 줄은 남긴다 — 내 화면에는 ＋(뭘 하면 되는지), 남의 화면에는
          '아직 등록 안 했어요'(칸이 아예 없으면 이 사람이 안 채운 건지도 알 수 없다). */}
      <section className="feed-taste">
        <div className="feed-taste-row">
          <span className="taste-label">이런 걸 봅니다</span>
          <div className="taste-chips">
            {favGenres.map(g => <span key={g} className="taste-chip on">{g}</span>)}
            {editable
              ? <button className="taste-chip add" onClick={() => openTaste('genres')} aria-label="선호 장르 편집">＋</button>
              : !favGenres.length && <span className="taste-blank">아직 등록 안 했어요</span>}
          </div>
        </div>
        <div className="feed-taste-row">
          <span className="taste-label">이 사람들 걸 봅니다</span>
          {/* 감독·작가와 배우는 **줄을 가른다** — 사진 칩이 되면서 한 줄에 섞이면 머리말이 칩 사이에 묻혔다.
              있는 쪽 줄만 그린다(빈 줄을 늘리지 않는다). ＋ 는 마지막 줄 끝에 하나만 */}
          {(() => {
            const addBtn = editable
              ? <button className="taste-chip add" onClick={() => openTaste('people')} aria-label="좋아하는 감독·작가·배우 편집">＋</button>
              : null
            const groups = [
              { role: 'maker' as const, list: favMakers },
              { role: 'actor' as const, list: favActors },
            ].filter(g => g.list.length > 0)
            if (!groups.length) {
              return <div className="taste-chips">{addBtn ?? <span className="taste-blank">아직 등록 안 했어요</span>}</div>
            }
            return groups.map((g, i) => (
              <div key={g.role} className="taste-chips taste-people-line">
                <span className="taste-sub">{ROLE_LABEL[g.role]}</span>
                {g.list.map(p => <PersonChip key={`${g.role}-${p.tmdbId ?? p.name}`} person={p} />)}
                {i === groups.length - 1 && addBtn}
              </div>
            ))
          })()}
        </div>
      </section>

      {tasteOpen && <TasteEditModal user={user} section={tasteOpen} onClose={() => { setTasteOpen(null); rerender() }} />}
    </>
  )
}

/** 사람 칩 — 사진이 있으면 사진, 없으면(이름만 적어 넣은 사람) 첫 글자 */
function PersonChip({ person }: { person: FavoritePerson }) {
  const photo = personPhotoUrl(person.profilePath)
  return (
    <span className="taste-chip person-chip">
      {photo ? <img src={photo} alt="" loading="lazy" /> : <i aria-hidden>{person.name.slice(0, 1)}</i>}
      {person.name}
    </span>
  )
}
