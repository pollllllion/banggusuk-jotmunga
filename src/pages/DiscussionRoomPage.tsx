import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { DiscussionRow, DiscussionRowHead } from '@/components/content/DiscussionRow'
import { promoteTrending } from '@/utils/trending'
import { Seo } from '@/components/seo/Seo'
import { Pager, usePageParam } from '@/components/ui/Pager'
import { BoardTopbar } from '@/components/content/BoardTopbar'
import { TALK_LABEL, BOARD_PER_PAGE, TRENDING_LIMIT, TRENDING_MIN_POSTS } from '@/utils/constants'
import '@/styles/discussion.css'

/** 세부 탭 — 글의 작품 타입으로 필터 */
const SUBS: { key: string; label: string }[] = [
  { key: 'all',      label: '전체' },
  { key: 'movie',    label: '영화' },
  { key: 'drama',    label: '드라마' },
  { key: 'variety',  label: '예능' },
  { key: 'shortform', label: '숏폼' },
  { key: 'webtoon',  label: '웹툰' },
  { key: 'webnovel', label: '웹소설' },
  { key: 'other',    label: '기타' },
]
const KNOWN_TYPES = ['movie', 'drama', 'variety', 'shortform', 'webtoon', 'webnovel']

/* 쪽 수·인기글 기준은 utils/constants 에 있다 — 토론방·자유방·작품방이 같은 값을 쓴다 */

export function DiscussionRoomPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const sub = searchParams.get('sub') || 'all'
  const [q, setQ] = useState('')

  const setSub = (key: string) => {
    const next = new URLSearchParams(searchParams)
    if (key === 'all') next.delete('sub'); else next.set('sub', key)
    next.delete('p')   // 탭을 바꾸면 목록이 통째로 달라진다 → 1쪽부터
    setSearchParams(next)
  }

  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  const query = q.trim().toLowerCase()
  // 작품명으로 거를 땐 통합검색과 같은 매칭을 쓴다 — "유퀴즈"로도 '유 퀴즈 온 더 블럭' 글이 나오게.
  // 글 제목·본문은 쓴 그대로 찾아야 하므로 원문 substring 을 유지한다.
  const matchedContentIds = query
    ? new Set(DS.searchContents(q.trim(), Infinity).map(c => c.id))
    : null

  // 전체 작품 글(discussions) + 작품 정보 결합 → 타입/검색 필터 → 최신순
  // getDiscussionsByBoard 로 자유방 글을 걸러낸다. 작품이 없어 아래 content 결합에서도
  // 어차피 빠지지만, 목록의 뜻을 코드에 남겨 둔다.
  const sorted = DS.getDiscussionsByBoard('talk')
    .filter(p => !blockedIds.includes(p.authorId || ''))
    .map(p => ({ post: p, content: DS.getContentById(p.contentId) }))
    .filter((x): x is { post: typeof x.post; content: NonNullable<typeof x.content> } => Boolean(x.content))
    .filter(({ content }) => {
      if (sub === 'other') return !KNOWN_TYPES.includes(content.type)
      if (KNOWN_TYPES.includes(sub)) return content.type === sub
      return true
    })
    .filter(({ post, content }) => !query ||
      (post.title || '').toLowerCase().includes(query) ||
      post.body.toLowerCase().includes(query) ||
      matchedContentIds!.has(content.id))
    .sort((a, b) => new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime())

  /**
   * 인기글을 목록 **위로 끌어올린다** — 따로 떼어 놓지 않는다 (2026-09-16).
   *
   * 예전에는 '지금 뜨는 글' 칸과 '전체 글' 칸이 따로 있었고, 인기글은 두 곳에
   * 똑같이 두 번 나왔다. 훑는 사람은 같은 글을 두 번 지나치고, 칸이 둘이라
   * 어디까지 봤는지도 헷갈렸다. 이제 목록은 하나고 앞 10개가 인기글이다.
   *
   * 거르개·검색 중에는 안 올린다 — 지금 고른 조건과 무관한 차례로 섞이면
   * "왜 최신순이 아니지"가 된다. 글이 몇 개 없을 때도 안 올린다.
   */
  const rows = (sub === 'all' && !query && sorted.length >= TRENDING_MIN_POSTS)
    ? promoteTrending(sorted, p => DS.countDiscussionComments(p.id), TRENDING_LIMIT)
    : sorted.map(x => ({ ...x, hot: false }))

  // 페이지 나누기 — 쪽 번호는 URL(?p=)에 둔다. 글을 읽고 뒤로 와도 보던 쪽이 유지된다.
  // 검색으로 결과가 줄면 현재 쪽이 범위를 넘을 수 있어 clamp 한다(빈 화면 방지).
  const totalPages = Math.max(1, Math.ceil(rows.length / BOARD_PER_PAGE))
  const { page, goPage } = usePageParam(searchParams, setSearchParams, totalPages)
  const pageRows = rows.slice((page - 1) * BOARD_PER_PAGE, page * BOARD_PER_PAGE)

  const openWrite = () => {
    if (!user) { toast('로그인 후 이용해주세요.'); return }
    navigate('/talk/write')
  }

  return (
    <>
      <Seo
        path="/talk"
        title="토론방"
        description="영화·드라마·예능·웹툰·웹소설 이야기를 나누는 게시판. 공개 전 기대평부터 방금 본 작품 잡담까지, 눈치 안 보고 떠드는 토론방."
      />
      {/* 좁은 화면에서 스크롤해도 위에 붙는 머리.
          칸 이름은 이제 안 띄운다 — 목록이 하나뿐이라 알려 줄 '어느 칸'이 없다. */}
      <BoardTopbar
        title={TALK_LABEL}
        action={<button className="btn btn-primary btn-small" onClick={openWrite}>토론하기</button>}
        search={{ value: q, onChange: setQ, placeholder: '제목·내용·작품 검색', count: rows.length }}
      />
      {/* 게시판 머리 — 제목 · 검색창 · 글쓰기 · 타입 칩이 **한 상자**에 들어 있다.
          한 상자여야 화면 폭에 따라 CSS 가 차례와 보임을 바꿀 수 있다(styles/discussion.css):
            넓은 화면 — [제목 ........ 검색창 N건 토론하기] / [타입 칩]
            좁은 화면 — [타입 칩] 한 줄뿐. 게시판 이름은 위 고정 바가 말하고,
                        검색은 그 바의 돋보기가 맡으므로 여기서는 둘 다 접는다 */}
      <div className="disc-head">
        <h2 className="feed-title">{TALK_LABEL}</h2>
        <div className="disc-searchbar">
          <input className="form-input" value={q} onChange={e => setQ(e.target.value)} placeholder="제목·내용·작품 검색" />
          <span className="disc-searchbar-count">{rows.length}건</span>
        </div>
        {/* 좁은 화면에서는 고정 바에 같은 버튼이 있어 접는다(CSS). 넓은 화면에는 고정 바가
            없으므로 여기가 유일한 진입점이다 — 지우면 데스크톱에서 글을 못 쓴다. */}
        <button className="btn btn-primary btn-small feed-header-write" onClick={openWrite}>토론하기</button>
        <div className="feed-typefilter">
          {SUBS.map(s => (
            <button key={s.key} className={sub === s.key ? 'active' : ''} onClick={() => setSub(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!rows.length ? (
        <div className="empty-state fade-in">
          <p>{query ? '검색 결과가 없어요.' : '아직 글이 없어요. 첫 글을 남겨보세요!'}</p>
          {!query && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openWrite}>토론하기</button>}
        </div>
      ) : (
        <>
          <div className="disc-board fade-in">
            <DiscussionRowHead showContent />
            {pageRows.map(({ post, content, hot }) => (
              <DiscussionRow key={post.id} post={post} content={content} hot={hot} showContent onOpen={() => navigate(`/talk/${post.id}`)} />
            ))}
          </div>
          <Pager page={page} total={totalPages} onGo={goPage} />
        </>
      )}
    </>
  )
}
