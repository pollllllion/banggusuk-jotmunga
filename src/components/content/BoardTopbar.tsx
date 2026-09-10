/**
 * 게시판 목록 화면의 고정 머리 — 좁은 화면에서 스크롤해도 위에 붙어 있다.
 *
 * 글 상세의 고정 헤더(.disc-topbar)와 같은 자리·같은 키를 쓴다. 목록을 한참 내리다 보면
 * 여기가 어느 게시판인지, 지금 보는 게 '지금 뜨는 글'인지 '전체 글'인지 잊는다.
 *
 * 칸 이름은 **읽기**고 오른쪽 버튼은 **하기**다. 예전엔 이 자리에 '뜨는 글로 가기 /
 * 전체 글로 가기' 두 버튼을 뒀는데, 두 칸이 같은 생김새라 눌러도 어디로 갔는지 알기 어려웠다.
 * 지금 어느 칸인지를 글자로 말해 주는 편이 그 일을 대신한다.
 *
 * 넓은 화면에는 안 붙인다 — 사이드바가 이미 어느 게시판인지 말하고 있고, 화면이 넓어
 * 목록 머리가 화면 밖으로 밀려나도 길을 잃지 않는다(글 상세도 같은 이유로 좁은 화면 전용이다).
 */
export function BoardTopbar({ title, section, action }: {
  title: string
  /** 지금 보고 있는 칸 이름. 스크롤을 따라 바뀐다. 칸이 하나뿐인 게시판은 넘기지 않는다 */
  section?: string
  /** 오른쪽에 붙일 버튼 (토론하기·글쓰기) */
  action?: React.ReactNode
}) {
  return (
    <>
      <div className="board-topbar">
        <span className="board-topbar-title">{title}</span>
        {section && (
          <>
            <span className="board-topbar-sep" aria-hidden>·</span>
            <span className="board-topbar-section">{section}</span>
          </>
        )}
        {action && <span className="board-topbar-action">{action}</span>}
      </div>
      {/* 고정이라 자리를 안 차지한다 — 그만큼을 여기서 밀어 준다 */}
      <div className="board-topbar-gap" aria-hidden />
    </>
  )
}
