import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { isRemember } from '@/lib/authStorage'

/** 글이냐 댓글이냐에 따라 문구만 바뀐다 — 동작은 같다 */
const COPY = {
  post: {
    title: '✍️ 글쓰기',
    desc: '내 글 관리·알림·레벨이 쌓여요.',
    guest: '비회원으로 글쓰기',
    note: '닉네임과 비밀번호만 정하면 돼요. 그 비밀번호로 나중에 글을 고치거나 지울 수 있어요.',
  },
  comment: {
    title: '💬 댓글 남기기',
    desc: '내 댓글 관리·알림·레벨이 쌓여요.',
    guest: '비회원으로 댓글 쓰기',
    note: '닉네임과 비밀번호만 정하면 돼요. 그 비밀번호로 나중에 댓글을 고치거나 지울 수 있어요.',
  },
}

/**
 * 글쓰기에 들어올 때, 그리고 댓글 입력칸의 '로그인' 버튼으로 띄우는 로그인 창.
 *
 * 왜 막지 않고 창만 띄우나: 이 게시판은 유동닉 글쓰기가 기본 기능이다(guest_posts).
 * 로그인을 강제하면 글이 줄고, 안 띄우면 고정닉의 이점(내 글 관리·알림·레벨)을
 * 아무도 모른 채 계속 유동닉으로만 쓴다. 그래서 한 번 보여주고 '비회원으로 글쓰기'로
 * 언제든 빠져나갈 수 있게 둔다.
 *
 * 로그인에 성공하면 isAccount 가 true 로 바뀌어 이 창을 띄운 조건 자체가 풀린다 —
 * 여기서 따로 닫지 않는다. 쓰던 화면 위에 떠 있으므로 페이지 이동도 없다.
 */
export function LoginGateModal({ onGuest, onCancel, next, kind = 'post' }: {
  /** '비회원으로 쓰기' — 유동닉으로 계속 쓴다 */
  onGuest: () => void
  /** ✕ · 바깥 클릭 — 그만둔다 */
  onCancel: () => void
  /** 로그인/가입 페이지로 나갔다가 돌아올 경로 */
  next?: string
  /** 문구를 글용/댓글용 중 무엇으로 쓸지 */
  kind?: 'post' | 'comment'
}) {
  const copy = COPY[kind]
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [remember, setRemember] = useState(isRemember())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleLogin = async () => {
    setError('')
    if (!email || !pw) { setError('이메일과 비밀번호를 입력하세요.'); return }
    setBusy(true)
    const result = await login(email, pw, remember)
    setBusy(false)
    if (!result.ok) setError(result.error || '로그인 실패')
  }

  // 비밀번호 재설정처럼 화면이 큰 것은 원래 페이지로 보낸다. 돌아올 곳(next)을 들려 보낸다.
  const goAuth = (mode: 'register' | 'reset') => {
    const q = new URLSearchParams({ mode })
    if (next) q.set('next', next)
    navigate(`/auth?${q.toString()}`)
  }

  const overlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onCancel() }

  return (
    <div className="modal-overlay show" onClick={overlayClick}>
      <div className="modal login-gate">
        <button className="modal-close" onClick={onCancel} aria-label="닫기">✕</button>
        <h3>{copy.title}</h3>
        <p className="login-gate-desc">
          고정닉으로 로그인하면 {copy.desc}<br />
          로그인 없이 <b>유동닉</b>으로도 바로 쓸 수 있어요.
        </p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={e => { e.preventDefault(); handleLogin() }}>
          <div className="form-group">
            <label>이메일</label>
            <input type="email" className="form-input" placeholder="example@email.com"
              autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>비밀번호</label>
            <input type="password" className="form-input" placeholder="비밀번호를 입력하세요"
              autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} />
          </div>
          <label className="auth-remember">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
            <span>로그인 상태 유지</span>
          </label>
          <button type="submit" className="auth-btn" disabled={busy}>{busy ? '처리 중...' : '로그인'}</button>
        </form>

        <div className="auth-switch">
          계정이 없으신가요? <a onClick={() => goAuth('register')}>회원가입</a>
        </div>
        <div className="auth-switch" style={{ marginTop: 8 }}>
          <a onClick={() => goAuth('reset')}>비밀번호를 잊으셨나요?</a>
        </div>

        <div className="login-gate-or">또는</div>

        {/* 로그인만큼 눈에 띄게 둔다 — 유동닉 글쓰기는 곁다리가 아니라 이 게시판의 기본 기능이다 */}
        <button type="button" className="auth-btn login-gate-guest" onClick={onGuest}>
          {copy.guest}
        </button>
        <p className="login-gate-note">
          {copy.note}
        </p>
      </div>
    </div>
  )
}
