import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { DiscussionRow, DiscussionRowHead } from '@/components/content/DiscussionRow'
import { pickTrending } from '@/utils/trending'
import { Seo } from '@/components/seo/Seo'
import { Pager, usePageParam } from '@/components/ui/Pager'
import { BoardTopbar } from '@/components/content/BoardTopbar'
import '@/styles/discussion.css'

/** 세부 탭 — 글의 작품 타입으로 필터 */
const SUBS: { key: string; label: string }[] = [
  { key: 'all',      label: '전체' },
  { key: 'movie',    label: '영화' },
  { key: 'drama',    label: '드라마' },
  { key: 'variety',  label: '예능' },
  { key: 'webtoon',  label: '웹툰' },
  { key: 'webnovel', label: '웹소설' },
  { key: 'other',    label: '기타' },
]
const KNOWN_TYPES = ['movie', 'drama', 'variety', 'webtoon', 'webnovel']

/** 글이 이보다 적으면 인기글 섹션을 숨긴다 (아래 목록과 중복이라 자리만 먹음) */
const TRENDING_MIN_POSTS = 8
/** 인기글 노출 개수 */
const TRENDING_LIMIT = 10
/** 한 페이지에 보여줄 글 수 (디시 50 · 클리앙 30 — 방좋은 글이 길어서 30) */
const PER_PAGE = 30
/** 페이지 번호 버튼을 한 번에 몇 개까지 (1 … 4 5 [6] 7 8 … 20) */


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
  const rows = DS.getDiscussionsByBoard('talk')
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

  // 페이지 나누기 — 쪽 번호는 URL(?p=)에 둔다. 글을 읽고 뒤로 와도 보던 쪽이 유지된다.
  // 검색으로 결과가 줄면 현재 쪽이 범위를 넘을 수 있어 clamp 한다(빈 화면 방지).
  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const { page, goPage } = usePageParam(searchParams, setSearchParams, totalPages)
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // 인기글 — 필터·검색과 무관하게 게시판 전체에서 뽑는다(상단 고정 섹션).
  // 글이 몇 개 없을 땐 아래 최신순 목록과 똑같아 보이므로 숨긴다.
  const allRows = DS.getDiscussionsByBoard('talk')
    .filter(p => !blockedIds.includes(p.authorId || ''))
    .map(p => ({ post: p, content: DS.getContentById(p.contentId) }))
    .filter((x): x is { post: typeof x.post; content: NonNullable<typeof x.content> } => Boolean(x.content))
  // 필터·검색 중에는 숨긴다 — 지금 보고 있는 목록과 무관한 글이 위에 남아 있으면 헷갈린다
  const trending = (sub === 'all' && !query && allRows.length >= TRENDING_MIN_POSTS)
    ? pickTrending(allRows, p => DS.countDiscussionComments(p.id), TRENDING_LIMIT)
    : []

  /**
   * 고정 머리에 지금 보고 있는 칸 이름을 띄운다.
   * '전체 글' 머리가 고정 바(사이트 헤더 52 + 바 46 = 98px) 밑으로 들어가는 순간 바뀐다 —
   * 화면 한가운데를 기준으로 삼으면 두 칸 경계에서 이름이 깜빡인다.
   * 뜨는 글 칸이 없을 땐 칸이 하나뿐이라 이름을 아예 안 띄운다.
   */
  const trendingRef = useRef<HTMLElement>(null)
  const allRef = useRef<HTMLElement>(null)
  const [atAll, setAtAll] = useState(false)
  useEffect(() => {
    const onScroll = () => {
      const top = allRef.current?.getBoundingClientRect().top
      setAtAll(top != null && top <= 98)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
      {/* 좁은 화면에서 스크롤해도 위에 붙는 머리 — 어느 게시판인지, 어느 칸으로 갈지 */}
      <BoardTopbar
        title="토론방"
        section={trending.length > 0 ? (atAll ? '전체 글' : '지금 뜨는 글') : undefined}
        action={<button className="btn btn-primary btn-small" onClick={openWrite}>토론하기</button>}
      />
      <div className="feed-header">
        <h2 className="feed-title">토론방</h2>
        {/* 좁은 화면에서는 고정 바에 같은 버튼이 있어 접는다(CSS). 넓은 화면에는 고정 바가
            없으므로 여기가 유일한 진입점이다 — 지우면 데스크톱에서 글을 못 쓴다. */}
        <button className="btn btn-primary btn-small feed-header-write" onClick={openWrite}>토론하기</button>
      </div>

      {trending.length > 0 && (
        <section className="disc-trending fade-in" ref={trendingRef}>
          <h3 className="disc-trending-head">지금 뜨는 글</h3>
          {/* 아래 '전체 글'과 같은 생김새를 쓴다. 무엇이 뜨는 글인지는 섹션 제목이 말해 주므로
              순위 숫자는 달지 않는다 — 댓글 수로 뽑은 차례라 1위·2위의 차이가 크지도 않다. */}
          <div className="disc-board">
            <DiscussionRowHead showContent />
            {trending.map(({ post, content }) => (
              <DiscussionRow
                key={post.id}
                post={post}
                content={content}
                showContent
                onOpen={() => navigate(`/talk/${post.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      <div className="feed-typefilter">
        {SUBS.map(s => (
          <button key={s.key} className={sub === s.key ? 'active' : ''} onClick={() => setSub(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="disc-searchbar">
        <input className="form-input" value={q} onChange={e => setQ(e.target.value)} placeholder="제목·내용·작품 검색" />
        <span className="disc-searchbar-count">{rows.length}건</span>
      </div>

      {!rows.length ? (
        <div className="empty-state fade-in">
          <p>{query ? '검색 결과가 없어요.' : '아직 글이 없어요. 첫 글을 남겨보세요!'}</p>
          {!query && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openWrite}>토론하기</button>}
        </div>
      ) : (
        <section className="disc-all" ref={allRef}>
          <h3 className="disc-trending-head">전체 글</h3>
          <div className="disc-board fade-in">
            <DiscussionRowHead showContent />
            {pageRows.map(({ post, content }) => (
              <DiscussionRow key={post.id} post={post} content={content} showContent onOpen={() => navigate(`/talk/${post.id}`)} />
            ))}
          </div>
          <Pager page={page} total={totalPages} onGo={goPage} />
        </section>
      )}
    </>
  )
}
