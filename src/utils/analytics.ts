/**
 * 방문 통계 기록 — 관리자 화면(통계 탭)이 읽는 원자료.
 *
 * 무엇을 남기고 무엇을 안 남기나:
 *   남긴다   경로(쿼리 제외) · 유입 **도메인만** · 사이트 안 검색어 ·
 *            하루짜리 세션 id · 로그인 계정 id
 *   안 남긴다 IP · User-Agent · 전체 referrer URL · 유동닉 신원
 * 개인을 따라다니지 않는 게 목적이라 세션 id 를 **날마다 새로** 만든다.
 *
 * ──────────────────────────────────────────────────────────────
 * ⚠️ "밖에서 뭘 검색해 들어왔나"는 **여기서 알 수 없다.** (2026-09-09 실측)
 *
 * 한때 네이버·다음의 referrer 에서 검색어(?query=...)를 뽑아 보려 했는데,
 * 요즘 브라우저 기본 정책(strict-origin-when-cross-origin)이 다른 사이트로
 * 넘어갈 때 **도메인만** 넘긴다. 실제로 네이버에서 넘어와 확인해 보면
 *     document.referrer === 'https://search.naver.com/'
 * 로, 검색어는 우리 코드가 보기도 전에 브라우저가 잘라낸다.
 * 구글은 그보다 앞서 2011년부터 검색어를 지웠다.
 *
 * 즉 검색엔진을 가리지 않고 사이트 쪽에서는 불가능하다. 유입 검색어는
 *   구글  → Google Search Console
 *   네이버 → 네이버 서치어드바이저
 * 에서 봐야 한다. 여기 q 에 담기는 건 **우리 사이트 검색창**에 친 말이다.
 * ──────────────────────────────────────────────────────────────
 */
import { supabase } from '@/lib/supabaseClient'

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

/** 유입 도메인만. 전체 URL 은 남기지 않는다(남의 사이트 사정이 딸려 온다). */
function referrerHost(): string | null {
  try {
    const r = document.referrer
    if (!r) return null
    const host = new URL(r).hostname.replace(/^www\./, '')
    if (host === location.hostname.replace(/^www\./, '')) return null   // 사이트 안 이동은 유입이 아니다
    return host
  } catch {
    return null
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

  void supabase.from('page_views').insert({
    path: path.slice(0, 300),
    ref: referrerHost(),
    q,
    sid: sessionId(),
    uid: opts.uid || null,
  }).then(({ error }) => {
    // 마이그레이션 전이면 테이블이 없다 — 그때는 조용히 아무 일도 안 한 셈이 된다
    if (error && error.code !== '42P01') console.debug('[analytics]', error.message)
  })
}
