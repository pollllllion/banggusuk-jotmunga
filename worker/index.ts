/**
 * ottcal Worker — 정적 SPA(dist/) 서빙 + 토론방 첨부 올리기(R2)
 *
 * 왜 Worker 코드가 생겼나 (2026-09-22):
 *   짤을 Supabase Storage 에 두면 **볼 때마다** 무료 전송량(월 5GB)이 깎인다. 9MB 움짤 하나를
 *   550번 보면 한 달 한도가 끝난다. R2 는 전송(egress) 요금이 없고 무료 저장도 10GB 라,
 *   글·댓글 모두 사진·움짤 50MB · 동영상 100MB 를 받는다.
 *
 * 역할 나눔:
 *   올리기  POST /api/media?kind=talk|avatars  → 이 Worker (형식·크기·출처 검사 후 R2 에 저장) → { url, key }
 *   보이기  https://media.ottcal.com/<key>      → R2 커스텀 도메인이 직접 (Worker 를 거치지 않는다)
 *   청소    /api/media-admin/list · delete      → scripts/clean-media.mjs 전용 (Bearer MEDIA_ADMIN_TOKEN)
 *   wrangler.jsonc 의 run_worker_first 에 걸린 /api/* 만 여기로 오고, 나머지는 정적 자산이 먼저다.
 *
 * 보안:
 *   - media.ottcal.com 은 올린 사람이 붙인 Content-Type 이 아니라 저장할 때 **파일 첫 바이트로** 정한
 *     형식을 내보낸다. 사진·움짤·동영상이 아니면 받지 않는다 → HTML·SVG 가 우리 도메인에서 돌 길이 없다.
 *     (게다가 media.ottcal.com 은 앱과 다른 출처라 로그인 정보에 닿지 않는다)
 *   - 올리기는 로그인 없이 된다 — 유동닉도 짤을 올리는 게 토론방 규칙이고, Supabase 버킷도 anon 쓰기였다.
 *     대신 Origin 을 우리 사이트로 제한하고 형식별 크기로 막는다. 고아 파일은 주간 청소(clean-media)가 지운다
 */
import { handleMedia, type Env } from './media'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const res = await handleMedia(request, env)
    if (res) return res
    // 여기로 온 나머지(/api/* 중 첨부와 무관한 것)는 정적 자산에 넘긴다 (not_found_handling=SPA 가 그대로 적용된다)
    return env.ASSETS.fetch(request)
  },
}
