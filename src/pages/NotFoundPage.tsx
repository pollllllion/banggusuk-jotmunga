import { useLocation, useNavigate } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { clickable } from '@/utils/a11y'

/**
 * 없는 주소 · 지워진 글/작품.
 *
 * 예전에는 `<Route path="*" element={<Navigate to="/" replace />} />` 로 홈에 던졌다.
 * 사람에게도 불친절하지만(왜 홈으로 왔는지 모른다) 검색엔진에는 더 나쁘다 —
 * 없는 주소가 **200 + 정상 페이지**로 응답하는 걸 구글은 soft 404 로 보고,
 * 그런 주소가 쌓이면 크롤링 예산을 거기에 쓰고 사이트 전체 평가도 깎인다.
 *
 * ⚠️ 여기서 진짜 404 **상태 코드**는 못 준다. Cloudflare 정적 자산 설정이
 *    `not_found_handling: 'single-page-application'` 이라 매칭 안 되는 경로에는
 *    index.html 을 200 으로 내려 준다(wrangler.jsonc). 그 설정을 '404-page' 로 바꾸면
 *    프리렌더가 없는 진짜 라우트(/me·/settings·/search·/auth…)까지 404 가 돼 앱이 깨진다.
 *    서버 코드 없이 정적 자산만 서빙하는 구조라 상태 코드를 라우트별로 가를 수가 없다.
 *
 *    그래서 구글이 "404 를 못 주는 경우"에 안내하는 방법을 쓴다 — **noindex**.
 *    색인에서 빠지므로 soft 404 로 잡히지 않는다. nofollow 는 걸지 않는다:
 *    아래 링크를 타고 멀쩡한 페이지로 크롤러가 건너가는 편이 낫다.
 */
/** 받침이 있으면 '이', 없으면 '가'. '작품가 없어요' 같은 말이 안 나오게. */
function subjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1)
  const isHangul = code >= 0xAC00 && code <= 0xD7A3
  return isHangul && (code - 0xAC00) % 28 !== 0 ? '이' : '가'
}

export function NotFoundPage({ what = '페이지' }: { what?: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // 한글 주소는 %EC%9D%B4… 로 들어온다 — 자기가 뭘 눌렀는지 알아볼 수 있게 되돌린다.
  // 망가진 인코딩이면 decodeURIComponent 가 던지므로 원문 그대로 둔다.
  const shown = (() => { try { return decodeURIComponent(pathname) } catch { return pathname } })()

  return (
    <>
      <Seo
        title={`찾는 ${what}${subjectParticle(what)} 없습니다`}
        description="주소가 바뀌었거나 삭제된 페이지입니다."
        noindex
        nofollow={false} />
      <div className="notfound">
        <h1>찾는 {what}{subjectParticle(what)} 없어요</h1>
        <p className="notfound-sub">
          주소가 바뀌었거나 삭제된 것 같습니다.
          <br />
          <code>{shown}</code>
        </p>
        <div className="notfound-links">
          <button className="btn-primary" onClick={() => navigate('/')}>개봉·공개 캘린더</button>
          <button className="btn-secondary" onClick={() => navigate('/browse')}>작품 둘러보기</button>
          <button className="btn-secondary" onClick={() => navigate('/talk')}>방구석 토론방</button>
        </div>
        <p className="notfound-back" {...clickable(() => navigate(-1))}>← 이전 페이지로</p>
      </div>
    </>
  )
}
