import { useState } from 'react'
import { SearchIcon } from '@/components/ui/Icons'
import { useEscapeKey } from '@/hooks/useEscapeKey'

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
 * 넓은 화면에는 안 붙인다 — 상단 메뉴가 이미 어느 게시판인지 말하고 있고, 화면이 넓어
 * 목록 머리가 화면 밖으로 밀려나도 길을 잃지 않는다(글 상세도 같은 이유로 좁은 화면 전용이다).
 *
 * ── 검색 (2026-09-16) ──────────────────────────────────────
 * 좁은 화면에서는 검색창을 늘 펼쳐 두지 않는다. 늘 있는 것은 **돋보기 한 칸**이고,
 * 누르면 바 아래로 검색창이 펼쳐진다. 게시판에 들어와서 제일 먼저 하는 일은 검색이 아니라
 * 목록 훑기다 — 늘 펼쳐 두면 첫 글이 한 줄만큼 화면 밖으로 밀린다.
 * 넓은 화면에는 이 바 자체가 없고, 거기서는 검색창이 제목 줄에 늘 나와 있다.
 */
export function BoardTopbar({ title, section, action, search }: {
  title: string
  /** 지금 보고 있는 칸 이름. 스크롤을 따라 바뀐다. 칸이 하나뿐인 게시판은 넘기지 않는다 */
  section?: string
  /** 오른쪽에 붙일 버튼 (토론하기·글쓰기) */
  action?: React.ReactNode
  /** 돋보기로 펼치는 검색창. 안 넘기면 돋보기 자체가 없다 */
  search?: {
    value: string
    onChange: (v: string) => void
    placeholder: string
    /** 지금 목록에 걸린 글 수 — 검색 중에 몇 건인지가 바로 옆에 있어야 한다 */
    count: number
  }
}) {
  const [open, setOpen] = useState(false)

  /** 닫을 때는 검색어도 비운다 — 창이 사라졌는데 목록만 걸러진 채로 남으면
   *  "왜 글이 몇 개 없지"가 된다. 닫기는 곧 '검색 그만두기'다. */
  const close = () => { setOpen(false); search?.onChange('') }
  useEscapeKey(open, close)

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
        <span className="board-topbar-right">
          {search && (
            <button
              className={`board-topbar-find ${open ? 'on' : ''}`}
              onClick={() => (open ? close() : setOpen(true))}
              aria-label={open ? '검색 닫기' : '이 게시판에서 검색'}
              aria-expanded={open}
            >
              <SearchIcon size={17} />
            </button>
          )}
          {action}
        </span>
      </div>

      {search && open && (
        <div className="board-topbar-search">
          <input
            className="form-input"
            autoFocus
            value={search.value}
            onChange={e => search.onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') close() }}
            placeholder={search.placeholder}
          />
          <span className="disc-searchbar-count">{search.count}건</span>
        </div>
      )}

      {/* 고정이라 자리를 안 차지한다 — 그만큼을 여기서 밀어 준다.
          검색창이 펼쳐지면 그 높이까지 같이 밀어야 첫 글이 안 가린다. */}
      <div className={`board-topbar-gap ${search && open ? 'with-search' : ''}`} aria-hidden />
    </>
  )
}
