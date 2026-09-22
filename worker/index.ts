/**
 * ottcal Worker — 정적 SPA(dist/) 서빙 + 토론방 짤 저장소(R2)
 *
 * 왜 Worker 코드가 생겼나 (2026-09-22):
 *   짤을 Supabase Storage 에 두면 **볼 때마다** 무료 전송량(월 5GB)이 깎인다. 9MB 움짤 하나를
 *   550번 보면 한 달 한도가 끝난다. R2 는 전송(egress) 요금이 없고 무료 저장도 10GB 라,
 *   글·댓글 모두 20MB 움짤을 받아도 된다.
 *
 * 경로 (wrangler.jsonc 의 run_worker_first 에 걸린 것만 여기로 온다. 나머지는 정적 자산이 먼저):
 *   POST /api/media?kind=talk|avatars   파일 본문 그대로 → R2 저장 → { url }
 *   GET  /media/<key>                   R2 에서 꺼내 준다 (1년 immutable — 키가 uuid 라 내용이 안 바뀐다)
 *   GET  /api/media-admin/list          고아 청소용 목록   (Bearer MEDIA_ADMIN_TOKEN)
 *   POST /api/media-admin/delete        고아 청소용 삭제   (Bearer MEDIA_ADMIN_TOKEN)
 *
 * 보안:
 *   - 사용자 파일을 **우리 도메인에서** 내보내므로, HTML·SVG 가 섞이면 ottcal.com 에서 스크립트가 돈다.
 *     그래서 Content-Type 은 클라이언트가 보낸 값을 믿지 않고 **파일 첫 바이트(시그니처)로** 정한다.
 *     GIF·PNG·JPEG·WEBP 가 아니면 받지 않는다. 내보낼 때도 nosniff + CSP sandbox 를 붙인다
 *   - 올리기는 로그인 없이 된다 — 유동닉도 짤을 올리는 게 토론방 규칙이고, Supabase 버킷도 anon 쓰기였다.
 *     대신 Origin 을 우리 사이트로 제한하고 20MB 로 막는다. 고아 파일은 주간 청소(clean-media)가 지운다
 */
import { handleMedia, type Env } from './media'

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const res = await handleMedia(request, env, ctx)
    if (res) return res
    // 여기로 온 나머지는 정적 자산에 넘긴다 (not_found_handling=SPA 가 그대로 적용된다)
    return env.ASSETS.fetch(request)
  },
}
