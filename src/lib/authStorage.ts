/**
 * "로그인 상태 유지" 스위치.
 *
 * 켜져 있으면 로그인 토큰을 localStorage 에, 꺼져 있으면 sessionStorage 에 둔다.
 * sessionStorage 는 탭(폰이면 앱)을 닫는 순간 비워지므로 다음에 열면 로그아웃돼 있다.
 * 공용 PC 에서 자동 로그인을 원치 않는 사람에게 필요한 선택지다.
 *
 * 왜 supabase 옵션이 아니라 직접 만드나:
 *   persistSession 은 createClient 시점에 한 번 정해지는 값이라 로그인마다 못 바꾼다.
 *   대신 storage 어댑터를 주면 읽고 쓰는 위치를 그때그때 고를 수 있다.
 *
 * 기본값은 켜짐 — 지금까지의 동작이고, 끄면 앱을 닫을 때마다 로그아웃돼서
 * 폰에서 특히 성가시다. 끄는 건 명시적으로 선택한 사람만.
 */
const FLAG = 'bangjot_remember'

export function isRemember(): boolean {
  try { return localStorage.getItem(FLAG) !== '0' } catch { return true }
}

export function setRemember(on: boolean) {
  try {
    // 이 값 자체는 localStorage 에 남긴다 — sessionStorage 에 두면
    // 다음에 열었을 때 "안 유지" 선택을 기억하지 못한다.
    if (on) localStorage.removeItem(FLAG)
    else localStorage.setItem(FLAG, '0')
  } catch { /* 사생활 보호 모드 — 기본값(켜짐)으로 동작한다 */ }
}

function primary(): Storage { return isRemember() ? localStorage : sessionStorage }
function secondary(): Storage { return isRemember() ? sessionStorage : localStorage }

/**
 * supabase-js 에 넘길 storage 어댑터.
 *
 * 읽을 때 반대편도 본다: 체크를 껐다 켜는 순간 토큰이 반대쪽에 남아 있는데,
 * 거기서 못 찾고 null 을 주면 방금 로그인한 사람이 튕긴다.
 * 기존 사용자의 토큰도 localStorage 에 있으므로 이 fallback 이 승계 역할을 겸한다.
 */
export const authStorage = {
  getItem: (key: string): string | null => {
    try { return primary().getItem(key) ?? secondary().getItem(key) } catch { return null }
  },
  setItem: (key: string, value: string) => {
    try {
      primary().setItem(key, value)
      secondary().removeItem(key)   // 양쪽에 두면 어느 쪽이 최신인지 알 수 없다
    } catch { /* 저장 불가 — 이번 세션 동안만 로그인이 유지된다 */ }
  },
  removeItem: (key: string) => {
    try { localStorage.removeItem(key); sessionStorage.removeItem(key) } catch { /* 무시 */ }
  },
}
