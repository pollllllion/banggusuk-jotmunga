import type { Content } from '@/types'

/** 제작국 구분 — 지금은 둘뿐이다(한국 / 그 밖) */
export type Origin = 'kr' | 'foreign'

const HANGUL = /[가-힣]/

/** 한국 작품으로 치는 제작국 코드 */
const KR = 'KR'
/** 한국 작품으로 치는 원어 코드 (TMDB original_language, ISO 639-1) */
const KO = 'ko'

/**
 * 이 작품이 한국 작품인가.
 *
 * ── 기준 (2026-09-16) ──────────────────────────────────────
 *   ① 제작국이 있으면 — **KR 이 들어 있으면 한국.** (공동제작도 한국으로 친다)
 *   ② 제작국이 없으면 — **원어가 한국어면 한국.**
 *   ③ 둘 다 없으면    — 예전처럼 제목의 한글로.
 *
 * 제작국이 **먼저**다. 원어는 제작국이 비어 있을 때만 본다:
 *   · 제작국은 "누가 만들었나"라는 사실이고, 영어로 찍은 한국 작품도 여기 걸린다
 *   · 원어는 TMDB 가 자주 틀린다. 실측에서 아틀라스 마리아(제작국 AR·NL)와
 *     밤이 내릴 때(JP·CN)가 original_language='ko' 로 들어와 있었다. 둘을 OR 로 묶으면
 *     아르헨티나·네덜란드 영화가 '한국' 칸에 앉는다
 *   · 그래도 원어가 필요한 이유는, TMDB 가 콘서트 실황의 제작국을 자주 빼먹기 때문이다.
 *     aespa·Red Velvet·NCT 콘서트가 제작국 없이 들어와 있고, 그때 남는 단서가 원어다
 *
 * ── 왜 바꿨나 ──────────────────────────────────────────────
 * 전에는 **원어 제목에 한글이 있는가**로 갈랐다. DB 에 제작국도 원어도 없어서
 * 갖고 있는 값으로 때운 것이었다. 실측(표본 194편)에서 9편이 틀렸고(4.6%,
 * 2,125편 기준 약 100편), 틀리는 방식이 둘이었다:
 *   ① 원어 제목이 영어인 한국 작품 → 외국 (K-Beauty Pop Up · see your eyes · 콘서트 실황)
 *   ② 원어 제목이 비어 있어 **한국어 번역 제목**으로 판정 → 한국
 *      (킬 빌: 2부 · 파이트 클럽 · 장고: 분노의 추적자)
 * ②가 특히 나빴다 — 누가 봐도 외국 영화가 '한국' 칸에 앉는다.
 *
 * ── 옛 판별이 남아 있는 자리 ────────────────────────────────
 * 제작국·원어가 **둘 다 없는** 행에서는 예전처럼 제목의 한글로 본다. TMDB 가 없는
 * 수기 등록 작품(웹툰·웹소설·숏폼·유튜브 301편)이 여기고, 거기엔 더 나은 근거가 없다.
 * 그 행들은 ②의 함정에 안 걸린다 — 번역 제목이 아니라 원래 한국 제목이기 때문이다.
 * (migration_origin 을 적용하기 전에도 앱이 죽지 않게 하는 길이기도 하다)
 */
export function originOf(c: Pick<Content, 'title' | 'originalTitle' | 'originalLanguage' | 'originCountries'>): Origin {
  const countries = c.originCountries || []
  if (countries.length) return countries.includes(KR) ? 'kr' : 'foreign'

  const lang = c.originalLanguage?.trim() || ''
  if (lang) return lang === KO ? 'kr' : 'foreign'

  // 근거가 없는 행 — 제목의 한글로 본다(수기 등록 작품)
  return HANGUL.test(c.originalTitle?.trim() || c.title || '') ? 'kr' : 'foreign'
}

export const ORIGIN_FILTERS: { code: Origin; label: string }[] = [
  { code: 'kr', label: '한국' },
  { code: 'foreign', label: '외국' },
]
