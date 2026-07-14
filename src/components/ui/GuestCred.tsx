/** 유동닉(비로그인) 작성용 닉네임 + 비밀번호 입력 */
export function GuestCred({ name, pw, onName, onPw }: {
  name: string; pw: string; onName: (v: string) => void; onPw: (v: string) => void
}) {
  return (
    <div className="form-row" style={{ marginBottom: 8 }}>
      <input className="form-input" placeholder="닉네임" maxLength={12} value={name} onChange={e => onName(e.target.value)} />
      <input className="form-input" type="password" placeholder="비밀번호 (삭제용)" maxLength={20} value={pw} onChange={e => onPw(e.target.value)} />
    </div>
  )
}
