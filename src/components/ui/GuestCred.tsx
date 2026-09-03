/**
 * 유동닉(비로그인) 작성용 닉네임 + 비밀번호 입력.
 *
 * 왜 상자로 감싸나: 입력칸 두 개만 덩그러니 놓여 있으면 처음 온 사람은 이게 회원가입인지,
 * 왜 비밀번호를 또 정하라는 건지 알 수 없다. 이 칸은 '로그인 안 하고 쓰는 사람만' 채우는
 * 것이므로, 그 사실과 비밀번호의 용도를 칸 위아래에 붙여 둔다.
 */
export function GuestCred({ name, pw, onName, onPw, what = '글' }: {
  name: string; pw: string; onName: (v: string) => void; onPw: (v: string) => void
  /** 안내 문구에 들어갈 대상 — '글' 또는 '댓글' */
  what?: '글' | '댓글'
}) {
  return (
    <div className="guest-cred">
      <div className="guest-cred-head">
        <span className="guest-badge">비회원</span>
        <span>로그인 없이 쓰는 중이에요. 닉네임과 비밀번호를 정해주세요.</span>
      </div>
      <div className="form-row">
        <input className="form-input" placeholder="닉네임" maxLength={12} value={name} onChange={e => onName(e.target.value)} />
        <input className="form-input" type="password" placeholder="비밀번호" maxLength={20} value={pw} onChange={e => onPw(e.target.value)} />
      </div>
      <p className="guest-cred-note">
        이 비밀번호로 나중에 {what}을 고치거나 지울 수 있어요. 쉬운 비밀번호는 남이 지울 수도 있으니 피해주세요.
      </p>
    </div>
  )
}
