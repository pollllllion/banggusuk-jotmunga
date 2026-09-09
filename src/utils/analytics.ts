/**
 * 방문 통계 기록 — 관리자 화면(통계 탭)이 읽는 원자료.
 *
 * 무엇을 남기고 무엇을 안 남기나:
 *   남긴다   경로(쿼리 제외) · 유입 도메인 · **유입 검색어**(검색엔진이 넘겨줄 때만) ·
 *            사이트 안 검색어 · 하루짜리 세션 id · 로그인 계정 id
 *   안 남긴다 IP · User-Agent · 전체 referrer URL · 유동닉 신원
 * 개인을 따라다니지 않는 게 목적이라 세션 id 를 **날마다 새로** 만든다.
 *
 * 검색어 칸이 둘이라 헷갈리지 말 것:
 *   refq  **밖에서** 검색해 들어온 말 — 네이버·다음은 referrer 에 남긴다.
 *         구글은 2011년부터 지우므로 **구글 검색어는 여기 영원히 안 잡힌다**(Search Console 몫).
 *   q     **우리 사이트** 검색창에 친 말.
 */
import { supabase } from '@/lib/supabaseClient'
import { referrerHost, searchQueryFromReferrer } from '@/utils/searchReferrer'

const SID_KEY = 'bangjot_sid'

/** 한국 시간 기준 오늘 (통계도 KST 로 끊는다) */
function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

/**
 * 그날치 세션 id. 날짜가 바뀌면 새로 만든다 —
 * 며칠에 걸쳐 한 사람을 이어 붙이는 게 애초에 불가능하도록.
 */
function sessionId(): string {
  const today = todayKst()
  try {
    const raw = localStorage.getItem(SID_KEY)
    if (raw) {
      const [day, id] = raw.split('|')
      if (day === today && id) return id
    }
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(SID_KEY, `${today}|${id}`)
    return id
  } catch {
    // 사생활 보호 모드 — 이번 화면만 쓰고 버린다
    return 'nostore-' + Math.random().toString(36).slice(2)
  }
}

/** 유입 도메인 + 유입 검색어. 전체 URL 은 남기지 않는다(남의 사이트 사정이 딸려 온다). */
function referrerInfo(): { ref: string | null; refq: string | null } {
  try {
    const r = document.referrer
    return {
      ref: referrerHost(r, location.hostname),
      refq: searchQueryFromReferrer(r),
    }
  } catch {
    return { ref: null, refq: null }
  }
}

/** 같은 경로를 연속으로 세지 않기 위한 직전 기록 (뒤로가기·리렌더 중복 방지) */
let lastKey = ''
let lastAt = 0
const DEDUPE_MS = 1500

/**
 * 한 번 기록한다. 실패는 조용히 넘어간다 — 통계 때문에 화면이 멈추면 안 된다.
 * @param path  쿼리스트링을 뺀 경로
 * @param q     사이트 안 검색어 (검색 결과 화면일 때만)
 * @param uid   로그인 계정 id (유동닉이면 넘기지 않는다)
 */
export function trackPageView(path: string, opts: { q?: string | null; uid?: string | null } = {}) {
  const q = (opts.q || '').trim().slice(0, 100) || null
  const key = path + '|' + (q || '')
  const now = Date.now()
  if (key === lastKey && now - lastAt < DEDUPE_MS) return
  lastKey = key; lastAt = now

  const { ref, refq } = referrerInfo()
  void supabase.from('page_views').insert({
    path: path.slice(0, 300),
    ref,
    refq,
    q,
    sid: sessionId(),
    uid: opts.uid || null,
  }).then(({ error }) => {
    // 마이그레이션 전이면 테이블·컬럼이 없다 — 그때는 조용히 아무 일도 안 한 셈이 된다
    if (error && error.code !== '42P01') console.debug('[analytics]', error.message)
  })
}
