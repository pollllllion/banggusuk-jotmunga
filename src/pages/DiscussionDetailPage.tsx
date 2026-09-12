import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useDataStore } from '@/stores/dataStore'
import { StillLoading } from '@/components/ui/StillLoading'
import { useUIStore } from '@/stores/uiStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { GuestCred } from '@/components/ui/GuestCred'
import { ExpertTag } from '@/components/profile/ExpertTag'
import { LevelTag } from '@/components/profile/LevelTag'
import { Avatar } from '@/components/profile/Avatar'
import { BackIcon, HeartIcon } from '@/components/ui/Icons'
import { fullDateTime, sha256hex, scoreColor, scoreLabel } from '@/utils/helpers'
import { sanitizeRichText } from '@/utils/richText'
import { Seo } from '@/components/seo/Seo'
import { LoginGateModal } from '@/components/auth/LoginGateModal'
import { ShareButton } from '@/components/ui/ShareButton'
import { markPostRead } from '@/utils/readPosts'
import { isExpertAuthor } from '@/utils/level'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import '@/styles/discussion.css'
import { clickable } from '@/utils/a11y'

/** 댓글 정렬 — 디시 모바일의 '등록순 / 최신순'. 원댓글에만 건다(답글은 늘 달린 차례대로) */
type CommentSort = 'old' | 'new'

/** 토론방 게시글 상세 — 전체 페이지 (디시 스타일 창 전환). 제목·본문 + 댓글. */
export function DiscussionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAccount, updateProfile } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const openReportModal = useUIStore(s => s.openReportModal)
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)
  const contentsComplete = useDataStore(s => s.contentsComplete)

  const [cbody, setCbody] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPw, setGuestPw] = useState('')
  const [revealSpoiler, setRevealSpoiler] = useState(false)
  // 댓글 입력칸의 '로그인' 버튼으로 여는 창. 글쓰기와 달리 저절로 뜨지 않는다 —
  // 글을 읽으러 온 사람 앞을 막지 않으려고. 눌러서 열고, 로그인하면 저절로 닫힌다.
  const [loginOpen, setLoginOpen] = useState(false)
  // 댓글 인라인 수정 — 고치는 중인 댓글 id / 입력값 / (유동닉이면) 확인된 비번
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [editingPw, setEditingPw] = useState('')
  // 좁은 화면 고정 헤더의 ⋮ 메뉴 (공유·수정·삭제·신고). 넓은 화면에선 쓰지 않는다.
  const [menuOpen, setMenuOpen] = useState(false)
  const [csort, setCsort] = useState<CommentSort>('old')
  // 하단 고정 '댓글 입력' 바 — 진짜 입력칸에 손이 가 있는 동안엔 가린다(둘이 겹쳐 보이지 않게)
  const [composerFocus, setComposerFocus] = useState(false)
  // 비회원으로 쓰기로 한 뒤에만 닉네임·비번 칸을 낸다. 그 전에는 입력칸을 누르는 순간
  // 로그인 창이 뜬다 — 댓글칸 위에 '로그인 / 비회원' 안내를 늘 띄워 두지 않으려고.
  const [guestMode, setGuestMode] = useState(false)
  // 답글 — 어느 원댓글 밑에 입력칸이 열려 있나 / 그 입력칸 내용
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [rbody, setRbody] = useState('')
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEscapeKey(menuOpen, () => setMenuOpen(false))

  // 조회수 +1 (인기글 점수 재료). ref 가드 — StrictMode 이중 실행/리렌더로 두 번 세지 않게.
  // 읽은 글 표시도 여기서 남긴다 — 목록을 거치지 않고 링크로 바로 들어온 경우까지 잡으려고.
  const counted = useRef<string | null>(null)
  useEffect(() => {
    if (!id || counted.current === id) return
    counted.current = id
    markPostRead(id)
    void DS.incrementDiscussionViews(id)
  }, [id])

  // 글이 바뀌면(이전글/다음글로 이동) 열려 있던 메뉴·수정칸을 닫는다 — 같은 화면이 재활용되므로
  useEffect(() => { setMenuOpen(false); setEditingId(null); setReplyTo(null); setRbody('') }, [id])

  /** 하단 바를 누르면 진짜 입력칸으로 데려가 커서를 놓는다 */
  const focusComposer = () => {
    const el = composerRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
  }

  const post = DS.getDiscussions().find(d => d.id === id)
  // 자유방 글은 작품이 없다 — content 가 없다고 튕기면 그 글은 아예 못 연다.
  // 작품이 있어야 하는 건 토론방 글뿐이고, 그건 DB 제약이 지킨다.
  const content = post ? DS.getContentById(post.contentId) : undefined
  const isFree = (post?.board || 'talk') === 'relay'
  // 글 자체는 1단계에 다 들어온다. 작품만 2단계를 기다릴 수 있다.
  if (!isFree && post && !content && !contentsComplete) return <StillLoading />
  if (!post || (!isFree && !content)) { navigate('/talk'); return null }
  /** 목록으로 돌아갈 곳 */
  const boardPath = isFree ? '/board/relay' : '/talk'

  const isGuest = !!post.guestName
  const author = isGuest ? post.guestName : (DS.getUserById(post.authorId || '')?.nickname || '탈퇴한 사용자')
  // 고정닉(계정)만 강조·프로필 링크 — 유동닉/레거시 방문객과 구분
  const isAccountAuthor = DS.isAccountId(post.authorId)
  const liked = user ? post.likes.includes(user.id) : false
  const canDeleteAccount = !!user && isAccount && !isGuest && (user.id === post.authorId || user.role === 'admin')
  // 수정은 글쓴이만 (관리자라도 남의 글 내용은 고치지 않는다 — 삭제만)
  const canEdit = (!!user && isAccount && !isGuest && user.id === post.authorId) || isGuest
  const comments = DS.getDiscussionCommentsByPost(post.id)
  /** 정렬은 원댓글에만 건다 — 답글까지 최신순으로 뒤집으면 주고받은 차례가 뒤엉킨다 */
  const rootComments = comments.filter(c => !c.parentId).sort((a, b) => {
    const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return csort === 'old' ? d : -d
  })
  /** 답글은 언제나 달린 차례대로 (getDiscussionCommentsByPost 가 이미 오름차순이다) */
  const repliesOf = (parentId: string) => comments.filter(c => c.parentId === parentId && !c.deleted)
  /** 세는 건 읽을 수 있는 댓글만 — 삭제 표시만 남은 자리는 뺀다 */
  const commentCount = comments.filter(c => !c.deleted).length

  // 이전글 / 다음글 — 목록과 같은 차례(최신이 위)를 그대로 쓴다.
  // '이전글'은 목록에서 한 칸 위(더 최신), '다음글'은 한 칸 아래(더 오래된 글)다.
  // 목록 화면과 같은 거르개를 써야 없는 글로 넘어가지 않는다: 차단한 사람 글 제외,
  // 토론방은 작품이 붙어 있는 글만(작품이 아직 안 실린 글은 목록에도 안 나온다).
  const blockedIds = user ? DS.getBlockedIds(user.id) : []
  const siblings = DS.getDiscussionsByBoard(isFree ? 'relay' : 'talk')
    .filter(p => !blockedIds.includes(p.authorId || ''))
    .filter(p => isFree || !!DS.getContentById(p.contentId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const myIdx = siblings.findIndex(p => p.id === post.id)
  const prevPost = myIdx > 0 ? siblings[myIdx - 1] : undefined
  const nextPost = myIdx >= 0 && myIdx < siblings.length - 1 ? siblings[myIdx + 1] : undefined

  /**
   * 내 토론 — 내가 고른 내 글 모음(프로필의 pinnedPosts). 내 피드 맨 아래에 걸린다.
   * 새로 걸면 기본은 비공개다 — 모아 두려고 건 글이 본인 모르게 남에게 뜨면 안 된다.
   * 공개로 바꾸는 건 내 피드에서 한 줄씩 고른다.
   */
  const isMyPost = !!user && isAccount && !isGuest && user.id === post.authorId
  const pinned = (user?.pinnedPosts ?? []).some(p => p.id === post.id)
  const togglePin = async () => {
    if (!user) return
    const list = user.pinnedPosts ?? []
    const next = pinned ? list.filter(p => p.id !== post.id) : [{ id: post.id, public: false }, ...list]
    try {
      await updateProfile({ pinnedPosts: next })
      toast(pinned ? '내 토론에서 뺐어요.' : '내 토론에 저장했어요. (비공개로 담겼어요)')
      rerender()
    } catch { toast('처리하지 못했어요.') }
  }

  const likePost = () => {
    if (!user) { toast('로그인 후 이용해주세요.'); return }
    if (!isAccount) { toast('공감은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    DS.toggleDiscussionLike(post.id, user.id); rerender()
  }

  /** 신고 — 접수 주체를 남겨야 하므로 로그인(고정닉) 필요. 같은 대상은 한 번만. */
  const reportTarget = (targetType: 'discussion' | 'discussion_comment', targetId: string) => {
    if (!user || !isAccount) { toast('신고는 로그인(고정닉) 후 이용할 수 있어요.'); return }
    if (DS.hasReported(user.id, targetType, targetId)) { toast('이미 신고한 글이에요.'); return }
    openReportModal(targetType, targetId)
  }

  /** 수정 — 계정 글은 바로, 유동닉 글은 비번을 먼저 확인하고 그 비번을 들고 넘어간다 */
  const editPost = async () => {
    if (isGuest) {
      const pw = prompt('글 작성 시 입력한 비밀번호를 입력하세요.')
      if (!pw) return
      const ok = await DS.verifyGuestPost('discussions', post.id, pw)
      if (!ok) { toast('비밀번호가 일치하지 않습니다.'); return }
      navigate(`/talk/write?edit=${post.id}`, { state: { guestPw: pw } })
      return
    }
    navigate(`/talk/write?edit=${post.id}`)
  }

  /** 서버까지 저장이 못 간 경우. api 계층이 캐시를 이미 되돌렸으므로 알리기만 하면 된다. */
  const failToast = (e: unknown) => toast(e instanceof Error ? e.message : '처리하지 못했어요. 잠시 후 다시 시도해주세요.')

  const removePost = async () => {
    if (canDeleteAccount) {
      if (!confirm('이 글을 삭제할까요? 댓글도 함께 삭제됩니다.')) return
      try { await DS.deleteDiscussion(post.id) } catch (e) { failToast(e); return }
      toast('삭제했습니다.'); navigate('/talk')
    } else if (isGuest) {
      // 유동닉은 계정이 없어 비번이 곧 신원 확인이다. 그 창 하나가 '정말 지울까요' 까지 겸하도록
      // 문구에 삭제라고 못박는다 — 확인창을 따로 띄우면 팝업이 연달아 두 번 뜬다.
      const pw = prompt('이 글을 삭제할까요?\n\n작성 시 입력한 비밀번호를 넣으면 삭제됩니다.')
      if (pw === null) return
      const ok = await DS.deleteGuestPost('discussions', post.id, pw)
      toast(ok ? '삭제했습니다.' : '비밀번호가 일치하지 않습니다.')
      // RPC 가 서버에서 이미 지웠다 — 여기서는 딸린 댓글까지 캐시를 맞추는 뒷정리다
      if (ok) { await DS.deleteDiscussion(post.id).catch(() => {}); navigate('/talk') }
    }
  }

  const submitComment = async () => {
    // 입력칸을 거치지 않고 등록을 누른 경우(붙여넣기·자동완성 등)에도 한 번 묻는다
    if (!isAccount && !guestMode) { setLoginOpen(true); return }
    const text = cbody.trim()
    if (!text) { toast('댓글을 입력하세요.'); return }
    if (text.length > 1000) { toast('댓글은 1000자 이내로 입력해주세요.'); return }

    let payload: Parameters<typeof DS.createDiscussionComment>[0]
    if (isAccount && user) {
      payload = { discussionId: post.id, authorId: user.id, body: text }
    } else {
      if (!guestName.trim()) { toast('닉네임을 입력하세요.'); return }
      if (guestPw.length < 4) { toast('비밀번호를 4자 이상 입력하세요. (삭제 시 필요)'); return }
      const hash = await sha256hex(guestPw)
      payload = { discussionId: post.id, authorId: null, guestName: guestName.trim(), guestPwHash: hash, body: text }
    }
    // 저장이 서버까지 간 걸 확인한 뒤에 입력칸을 비운다 — 실패했는데 쓴 글이 사라지면 안 된다
    try { await DS.createDiscussionComment(payload) } catch (e) { failToast(e); return }
    setGuestPw(''); setCbody(''); rerender()
  }

  /**
   * 답글 등록. 원댓글 밑에만 달린다(깊이 1단계) — 답글의 답글도 같은 원댓글에 붙인다.
   * 스레드가 계단처럼 깊어지면 폰 화면에서 오른쪽이 남아나지 않는다.
   *
   * 알림은 원댓글과 같은 길을 탄다(createDiscussionComment → notifyDiscussionComment):
   * 글쓴이 + 이미 그 글에 댓글을 단 사람들. 답글 받은 사람도 그 안에 들어 있다.
   */
  const submitReply = async (parentId: string) => {
    if (!isAccount && !guestMode) { setLoginOpen(true); return }
    const text = rbody.trim()
    if (!text) { toast('답글을 입력하세요.'); return }
    if (text.length > 1000) { toast('답글은 1000자 이내로 입력해주세요.'); return }

    let payload: Parameters<typeof DS.createDiscussionComment>[0]
    if (isAccount && user) {
      payload = { discussionId: post.id, parentId, authorId: user.id, body: text }
    } else {
      if (!guestName.trim()) { toast('닉네임을 입력하세요.'); return }
      if (guestPw.length < 4) { toast('비밀번호를 4자 이상 입력하세요. (삭제 시 필요)'); return }
      const hash = await sha256hex(guestPw)
      payload = { discussionId: post.id, parentId, authorId: null, guestName: guestName.trim(), guestPwHash: hash, body: text }
    }
    try { await DS.createDiscussionComment(payload) } catch (e) { failToast(e); return }
    setGuestPw(''); setRbody(''); setReplyTo(null); rerender()
  }

  const likeComment = (cid: string) => {
    if (!user) { toast('로그인 후 이용해주세요.'); return }
    if (!isAccount) { toast('공감은 로그인(고정닉) 후 이용할 수 있어요.'); return }
    DS.toggleDiscussionCommentLike(cid, user.id); rerender()
  }

  /** 댓글 수정 — 계정 댓글은 바로, 유동닉 댓글은 비번을 먼저 확인하고 그 비번으로 저장 */
  const startEditComment = async (c: { id: string; body: string; guestName?: string | null }) => {
    if (c.guestName) {
      const pw = prompt('댓글 작성 시 입력한 비밀번호를 입력하세요.')
      if (!pw) return
      const ok = await DS.verifyGuestPost('discussion_comments', c.id, pw)
      if (!ok) { toast('비밀번호가 일치하지 않습니다.'); return }
      setEditingPw(pw)
    }
    setEditingId(c.id); setEditingBody(c.body)
  }

  const saveComment = async (c: { id: string; guestName?: string | null }) => {
    const text = editingBody.trim()
    if (!text) { toast('댓글을 입력하세요.'); return }
    if (text.length > 1000) { toast('댓글은 1000자 이내로 입력해주세요.'); return }
    if (c.guestName) {
      const ok = await DS.updateGuestDiscussionComment(c.id, editingPw, text)
      if (!ok) { toast('비밀번호가 일치하지 않습니다.'); return }
    } else {
      try { await DS.updateDiscussionComment(c.id, text) } catch (e) { failToast(e); return }
    }
    setEditingId(null); setEditingPw(''); toast('댓글을 고쳤어요!'); rerender()
  }

  const removeComment = async (c: { id: string; guestName?: string | null; authorId: string | null }) => {
    const cGuest = !!c.guestName
    if (user && isAccount && !cGuest && (user.id === c.authorId || user.role === 'admin')) {
      if (!confirm('이 댓글을 삭제할까요?')) return
      try { await DS.deleteDiscussionComment(c.id) } catch (e) { failToast(e); return }
      toast('삭제했습니다.'); rerender()
    } else if (cGuest) {
      // 글 삭제와 같은 방식 — 비번 창 하나가 '정말 지울까요' 까지 겸한다
      const pw = prompt('이 댓글을 삭제할까요?\n\n작성 시 입력한 비밀번호를 넣으면 삭제됩니다.')
      if (pw === null) return
      // 답글이 달려 있으면 자리를 남긴다(고정닉 쪽과 같은 규칙 · deleteDiscussionComment 참고)
      const ok = DS.hasReplies(c.id)
        ? await DS.softDeleteGuestDiscussionComment(c.id, pw)
        : await DS.deleteGuestPost('discussion_comments', c.id, pw)
      toast(ok ? '삭제했습니다.' : '비밀번호가 일치하지 않습니다.')
      // RPC 가 서버에서 이미 처리했고 캐시도 맞춰 놨다 — 화면만 다시 그리면 된다
      if (ok) rerender()
    }
  }

  /** 댓글 한 덩이. 원댓글과 답글이 같은 생김새를 쓴다 — 다른 건 왼쪽 들여쓰기와
   *  '답글쓰기' 유무뿐이다(답글에는 안 붙는다 · 1단계까지만 쓰므로). */
  const renderComment = (c: typeof comments[number], isReply: boolean) => {
    // 답글이 달린 채로 지워진 자리. 답글이 제 부모 아래 그대로 있게 하려고 남긴 껍데기라
    // 닉네임·아바타·추천·관리 버튼을 전부 뺀다 — 누가 썼는지는 이제 남의 일이 아니다.
    if (c.deleted) {
      return <div key={c.id} className={`disc-comment is-tomb ${isReply ? 'is-reply' : ''}`}>삭제된 댓글입니다.</div>
    }
    const cg = !!c.guestName
    const cName = cg ? c.guestName : (DS.getUserById(c.authorId || '')?.nickname || '탈퇴한 사용자')
    const cLiked = user ? c.likes.includes(user.id) : false
    const cCanDel = (!!user && isAccount && !cg && (user.id === c.authorId || user.role === 'admin')) || cg
    const cCanEdit = (!!user && isAccount && !cg && user.id === c.authorId) || cg
    const cEditing = editingId === c.id
    const cIsAccount = DS.isAccountId(c.authorId)
    // 유동닉은 닉네임이 겹칠 수 있어 글쓴이인지 확인할 방법이 없다 → 고정닉만 표시한다
    const cIsPostAuthor = cIsAccount && !!post.authorId && c.authorId === post.authorId
    const goProfile = cIsAccount ? () => navigate(`/u/${c.authorId}`) : undefined

    return (
      <div key={c.id} className={`disc-comment ${isReply ? 'is-reply' : ''}`}>
        <Avatar src={DS.getUserById(c.authorId || '')?.avatarUrl} name={cName} size={isReply ? 26 : 30} onClick={goProfile} />
        <div className="disc-comment-main">
          <div className="disc-comment-head">
            {cIsAccount
              ? <span
                  className="disc-author linkable"
                  {...clickable(() => navigate(`/u/${c.authorId}`), `${cName} 프로필 보기`)}
                >{cName}</span>
              : <span className="disc-author guest">{cName}</span>}
            <LevelTag authorId={c.authorId} />
            {/* 글쓴이가 자기 글에 단 댓글 — 대화를 읽을 때 제일 먼저 알아야 하는 것 */}
            {cIsPostAuthor && <span className="disc-op-tag">작성자</span>}
          </div>
          {cEditing ? (
            <div className="disc-comment-edit">
              <textarea className="disc-input" style={{ minHeight: 54 }} maxLength={1000}
                value={editingBody} onChange={e => setEditingBody(e.target.value)} autoFocus />
              <div className="disc-composer-foot">
                <span className="disc-count">{editingBody.length}/1000</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-small" onClick={() => { setEditingId(null); setEditingPw('') }}>취소</button>
                  <button className="btn btn-primary btn-small" onClick={() => saveComment(c)} disabled={!editingBody.trim()}>저장</button>
                </span>
              </div>
            </div>
          ) : (
            <p className="disc-comment-body">{c.body}</p>
          )}
          <div className="disc-comment-foot">
            <span className="disc-time">{fullDateTime(c.createdAt)}{c.updatedAt ? ' · 수정됨' : ''}</span>
            {!isReply && (
              <button className="disc-del" onClick={() => {
                setReplyTo(replyTo === c.id ? null : c.id); setRbody('')
              }}>답글쓰기</button>
            )}
            {cCanEdit && !cEditing && <button className="disc-del" onClick={() => startEditComment(c)}>수정</button>}
            {cCanDel && !cEditing && <button className="disc-del" onClick={() => removeComment(c)}>삭제</button>}
            {c.authorId !== user?.id && (
              <button className="disc-del" onClick={() => reportTarget('discussion_comment', c.id)}>신고</button>
            )}
          </div>
        </div>
        <button className={`disc-clike ${cLiked ? 'on' : ''}`} onClick={() => likeComment(c.id)} aria-label="이 댓글 추천">
          <HeartIcon filled={cLiked} size={15} />
          <span>{c.likes.length || 0}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="disc-page fade-in">
      <Seo
        path={`/talk/${post.id}`}
        title={content ? `${post.title || '(제목 없음)'} - ${content.title}` : (post.title || '(제목 없음)')}
        description={post.body}
        image={(!post.spoiler && post.images?.[0]) || content?.posterUrl}
        type="article"
      />
      {/* 좁은 화면 고정 헤더 (디시 모바일) — 스크롤해도 붙어 있어서 긴 글 한가운데서도
          뒤로 가거나 메뉴를 열 수 있다. 넓은 화면에서는 CSS 로 숨기고 아래 '목록으로'를 쓴다.
          사이트 헤더(52px) 아래에 sticky 로 물린다 — 헤더를 가리면 검색·알림이 사라진다. */}
      <div className="disc-topbar">
        <button className="disc-topbar-btn" onClick={() => navigate(boardPath)} aria-label="목록으로">
          <BackIcon />
        </button>
        <span className="disc-topbar-title">{post.title || '(제목 없음)'}</span>
        <button
          className="disc-topbar-btn"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="글 메뉴"
          aria-expanded={menuOpen}
        >⋮</button>
        {menuOpen && (
          <>
            {/* 바깥을 눌러 닫는다. 메뉴보다 아래에 깔린 투명 판 */}
            <div className="disc-menu-scrim" onClick={() => setMenuOpen(false)} />
            {/* 공유·신고는 본문 위 조회 줄에 늘 보이므로 여기 또 넣지 않는다 */}
            <div className="disc-menu" role="menu">
              {isMyPost && (
                <button className="disc-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); void togglePin() }}>
                  {pinned ? '내 토론에서 빼기' : '내 토론에 저장'}
                </button>
              )}
              {canEdit && <button className="disc-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); void editPost() }}>수정</button>}
              {(canDeleteAccount || isGuest) && (
                <button className="disc-menu-item danger" role="menuitem" onClick={() => { setMenuOpen(false); void removePost() }}>삭제</button>
              )}
              <button className="disc-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); navigate(boardPath) }}>목록으로</button>
            </div>
          </>
        )}
      </div>

      <div className="back-btn" {...clickable(() => navigate(boardPath))}><BackIcon /> 목록으로</div>

      <div className="disc-detail-titlerow">
        {post.rating != null && (
          <span className="disc-rating-pill" style={{ background: scoreColor(post.rating) }} title={scoreLabel(post.rating)}>★ {post.rating}</span>
        )}
        <h1 className="disc-detail-title">{post.title || '(제목 없음)'}</h1>
        {post.spoiler && <span className="disc-spoiler-tag">스포일러</span>}
      </div>
      {/* 프로필 사진 · 닉네임 · 레벨 아이콘 — 댓글 줄과 같은 차례로 읽힌다.
          좋문가는 아이콘 대신 '👑 좋문가' 배지가 나간다. 둘 다 그리면 왕관이 두 번 뜬다
          (LevelTag 도 좋문가면 👑 를 그린다). 여기서만 이름표를 다는 이유는 글쓴이라서다 —
          댓글마다 붙이면 목록이 배지밭이 된다. */}
      <div className="disc-detail-meta">
        <Avatar src={DS.getUserById(post.authorId || '')?.avatarUrl} name={author} size={30} onClick={isAccountAuthor ? () => navigate(`/u/${post.authorId}`) : undefined} />
        <span
          className={`disc-author ${isAccountAuthor ? 'linkable' : 'guest'}`}
          onClick={() => { if (isAccountAuthor) navigate(`/u/${post.authorId}`) }}
        >{author}</span>
        {isExpertAuthor(post.authorId)
          ? <ExpertTag authorId={post.authorId} />
          : <LevelTag authorId={post.authorId} />}
        {/* 수정·삭제만 여기 남는다(공유·신고는 아래 조회 줄로 갔다).
            좁은 화면에서는 이 줄을 접는다 — 같은 항목이 위 고정 헤더의 ⋮ 메뉴에 들어 있다 */}
        <span className="disc-detail-acts">
          {/* 내 글만 — 남의 글을 내 피드에 걸 수는 없다(그건 '스크랩'이고 다른 기능이다) */}
          {isMyPost && (
            <button className="disc-del" onClick={togglePin} title="내 피드의 '내 토론' 칸에 걸어 둡니다">
              {pinned ? '내 토론에서 빼기' : '내 토론에 저장'}
            </button>
          )}
          {canEdit && <button className="disc-del" onClick={editPost}>수정</button>}
          {(canDeleteAccount || isGuest) && <button className="disc-del" onClick={removePost}>삭제</button>}
        </span>
      </div>

      {/* 조회 · 정확한 작성 시각 ……… 공유 · 신고.
          목록은 '15:00', '09.09' 처럼 짧게 줄여 두었으므로(boardDate) 연·월·일·시·분이
          다 필요한 사람은 여기서 본다. 시:분까지만 쓴다 — 초는 아무도 안 본다.

          공유·신고는 누구에게나 보이므로 이 줄에 둔다. 수정·삭제는 글쓴이(와 관리자)만
          쓰는 것이라 위 글쓴이 줄에 남겨 두었다 — 남의 글에서는 아예 안 나온다. */}
      <div className="disc-detail-stats">
        <span>조회 {post.views || 0}</span>
        <span title={new Date(post.createdAt).toLocaleString('ko-KR')}>
          {fullDateTime(post.createdAt)}{post.updatedAt ? ' · 수정됨' : ''}
        </span>
        <span className="disc-detail-stats-acts">
          <ShareButton
            className="disc-del"
            path={`/talk/${post.id}`}
            title={post.title || '오티티칼'}
            text={content ? `${content.title} — ${post.title || ''}` : (post.title || '')}
            label="이 글 공유하기">
            공유
          </ShareButton>
          {/* 내 글은 신고할 일이 없다 */}
          {post.authorId !== user?.id && (
            <button className="disc-del" onClick={() => reportTarget('discussion', post.id)}>신고</button>
          )}
        </span>
      </div>

      {post.spoiler && !revealSpoiler && !canDeleteAccount ? (
        <div className="spoiler-cover" {...clickable(() => setRevealSpoiler(true), '스포일러 보기')}>
          ⚠️ 스포일러가 포함된 글입니다<small>클릭하면 내용을 표시합니다</small>
        </div>
      ) : (
        <div className="disc-detail-body">
          {/* 서식 있는 글은 HTML 로, 옛 글은 평문 그대로. 그릴 때 한 번 더 정화한다 */}
          {post.bodyHtml
            ? <div className="disc-detail-text rich" dangerouslySetInnerHTML={{ __html: sanitizeRichText(post.bodyHtml) }} />
            : <p className="disc-detail-text">{post.body}</p>}
          {/* 짤은 본문 안에 낀다. 본문 밖에 따로 붙이던 시절의 글만 아래에 이어서 보여준다 */}
          {!post.bodyHtml?.includes('<img') && post.images?.length ? (
            <div className="disc-detail-media">
              {post.images.map(url => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt="첨부 이미지" loading="lazy" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* 작품방 링크가 먼저, 공감이 뒤. 공감은 '다 읽고 나서' 누르는 것이라
          댓글 바로 위에 붙여 둔다 — 본문과 댓글 사이의 마지막 칸이다. */}
      <div className="disc-detail-foot">
        {content && (
          <span
            className="disc-detail-work"
            onClick={() => navigate(`/content/${content.id}?tab=talk`)}
            title="이 작품방으로 이동">
            {content.title} <span className="disc-detail-work-go">작품방 ›</span>
          </span>
        )}
        <button className={`disc-like ${liked ? 'on' : ''}`} onClick={likePost}>
          <HeartIcon filled={liked} size={14} /> 공감 {post.likes.length || 0}
        </button>
      </div>

      <div className="disc-comments">
        <div className="disc-comments-title">댓글 {commentCount}</div>

        {/* 댓글 정렬 (디시 모바일의 등록순/최신순). 댓글이 한 개뿐이면 고를 게 없어 숨긴다 */}
        {commentCount > 1 && (
          <div className="disc-csort" role="group" aria-label="댓글 정렬">
            <button className={csort === 'old' ? 'on' : ''} aria-pressed={csort === 'old'} onClick={() => setCsort('old')}>등록순</button>
            <button className={csort === 'new' ? 'on' : ''} aria-pressed={csort === 'new'} onClick={() => setCsort('new')}>최신순</button>
          </div>
        )}

        {/* 원댓글 하나 + 그 답글들 + (열려 있으면) 답글 입력칸을 한 덩이로 묶는다.
            묶어 놔야 정렬을 '최신순'으로 바꿔도 답글이 제 부모를 따라 움직인다. */}
        {rootComments.map(c => {
          const replies = repliesOf(c.id)
          // 남은 답글이 하나도 없는 삭제 자리는 아예 안 그린다 — 껍데기를 남긴 이유가
          // 답글을 붙들어 두기 위해서였는데, 그 답글마저 지워졌으면 남길 까닭이 없다.
          if (c.deleted && !replies.length) return null
          return (
          <div key={c.id} className="disc-comment-group">
            {renderComment(c, false)}
            {replies.map(r => renderComment(r, true))}
            {replyTo === c.id && (
              <div className="disc-reply-composer">
                {!isAccount && guestMode && <GuestCred name={guestName} pw={guestPw} onName={setGuestName} onPw={setGuestPw} what="댓글" />}
                <textarea
                  className="disc-input" style={{ minHeight: 48 }} maxLength={1000} autoFocus
                  placeholder="답글을 남겨보세요"
                  value={rbody} onChange={e => setRbody(e.target.value)}
                  onFocus={() => { if (!isAccount && !guestMode) { setLoginOpen(true); } }}
                />
                <div className="disc-composer-foot">
                  <span className="disc-count">{rbody.length}/1000</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-small" onClick={() => { setReplyTo(null); setRbody('') }}>취소</button>
                    <button className="btn btn-primary btn-small" onClick={() => submitReply(c.id)} disabled={!rbody.trim()}>답글 등록</button>
                  </span>
                </div>
              </div>
            )}
          </div>
          )
        })}

        <div className="disc-comment-composer">
          {/* 닉네임·비번 칸은 '비회원으로 쓰기'를 고른 뒤에만 나온다.
              늘 띄워 두면 글을 읽으러 온 사람에게 아직 하지도 않은 선택을 먼저 묻는 꼴이다. */}
          {!isAccount && guestMode && <GuestCred name={guestName} pw={guestPw} onName={setGuestName} onPw={setGuestPw} what="댓글" />}
          <textarea
            ref={composerRef}
            className="disc-input" style={{ minHeight: 54, marginTop: !isAccount && guestMode ? 8 : 0 }}
            placeholder="댓글을 남겨보세요" maxLength={1000}
            value={cbody} onChange={e => setCbody(e.target.value)}
            onFocus={() => {
              setComposerFocus(true)
              // 아직 고정닉도 비회원도 아니면 여기서 한 번 묻는다. 커서는 거둔다 —
              // 폰에서는 키보드가 올라온 채로 창이 떠서 둘이 화면을 나눠 갖는다.
              if (!isAccount && !guestMode) { setLoginOpen(true); composerRef.current?.blur() }
            }}
            onBlur={() => setComposerFocus(false)}
          />
          <div className="disc-composer-foot">
            <span className="disc-count">{cbody.length}/1000 {!isAccount && guestMode && <span style={{ color: 'var(--subtext)' }}>· 유동닉</span>}</span>
            <button className="btn btn-primary btn-small" onClick={submitComment} disabled={!cbody.trim()}>댓글 등록</button>
          </div>
        </div>
      </div>

      {/* 이전글 / 다음글 — 목록으로 되돌아갔다 다시 들어오지 않고 옆 글로 건너뛴다.
          제목까지 보여줘야 넘어갈지 말지 정할 수 있다(디시도 제목을 같이 보여준다). */}
      {(prevPost || nextPost) && (
        <nav className="disc-siblings" aria-label="이전 글 · 다음 글">
          {prevPost && (
            <div className="disc-sibling" {...clickable(() => navigate(`/talk/${prevPost.id}`))}>
              <span className="disc-sibling-label">이전글</span>
              <span className="disc-sibling-title">{prevPost.title || prevPost.body.slice(0, 40)}</span>
            </div>
          )}
          {nextPost && (
            <div className="disc-sibling" {...clickable(() => navigate(`/talk/${nextPost.id}`))}>
              <span className="disc-sibling-label">다음글</span>
              <span className="disc-sibling-title">{nextPost.title || nextPost.body.slice(0, 40)}</span>
            </div>
          )}
        </nav>
      )}

      {/* 좁은 화면 하단 고정 바. 긴 글을 읽다가 끝까지 스크롤하지 않아도 댓글을 달 수 있다.
          진짜 입력칸은 위에 하나뿐이고 이 바는 거기로 데려가는 손잡이다 —
          유동닉 닉네임·비번 칸까지 두 벌로 두면 어느 쪽에 쓴 건지 헷갈린다.
          입력칸에 커서가 가 있는 동안엔 숨긴다(키보드 위에 두 겹으로 뜨지 않게). */}
      {!composerFocus && (
        <div className="disc-cbar">
          <button className="disc-cbar-input" onClick={focusComposer}>댓글 입력</button>
          <button className="disc-cbar-count" onClick={focusComposer} aria-label={`댓글 ${commentCount}개`}>
            💬 {commentCount}
          </button>
        </div>
      )}

      {/* 로그인에 성공하면 isAccount 가 켜져 이 창을 띄운 조건 자체가 풀린다 — 따로 닫지 않는다 */}
      {loginOpen && !isAccount && (
        <LoginGateModal
          kind="comment"
          next={`/talk/${post.id}`}
          onGuest={() => {
            setLoginOpen(false); setGuestMode(true)
            // 창이 사라진 자리에서 곧바로 이어 쓸 수 있게 커서를 되돌려 준다
            setTimeout(() => composerRef.current?.focus(), 0)
          }}
          onCancel={() => setLoginOpen(false)}
        />
      )}
    </div>
  )
}
