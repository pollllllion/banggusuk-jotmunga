/**
 * 토론방 첨부(사진·움짤·동영상)의 저장소 주소와 한도 — 앱·정화기·Worker 가 같은 값을 본다.
 *
 * 저장소는 Cloudflare R2 'ottcal-media', 공개 주소는 R2 에 직접 붙인 media.ottcal.com.
 * Worker 를 거치지 않고 R2 가 바로 내보내므로 Worker 요청 한도(무료 하루 10만)를 쓰지 않고,
 * 동영상의 부분 요청(Range — 아이폰 사파리가 요구)도 그대로 된다.
 * 올리기만 Worker(POST /api/media)가 받는다. worker/media.ts 의 한도와 반드시 같이 고친다.
 *
 * 크기는 10진 MB(1,000,000 바이트)로 센다 — 폰(iOS)·맥이 파일 크기를 이렇게 보여 준다.
 * 동영상 100MB 는 비용이 아니라 Cloudflare 무료 플랜의 요청 본문 한도(100MB) 때문이다.
 */
export const MEDIA_BASE = 'https://media.ottcal.com'

export const MB = 1_000_000
/** 한 글·한 댓글에 넣을 수 있는 첨부 수 (사진·움짤·동영상 합쳐서) */
export const MAX_FILES = 4
/** 사진(JPG·PNG·WEBP) 원본 — 올리기 전에 webp 로 줄이므로 실제 올라가는 건 수백 KB */
export const IMAGE_MAX_BYTES = 50 * MB
/** 움짤(GIF) — 줄이면 애니메이션이 죽어서 원본 그대로 올라간다 */
export const GIF_MAX_BYTES = 50 * MB
/** 동영상(MP4·MOV·WEBM) */
export const VIDEO_MAX_BYTES = 100 * MB

export const IMAGE_TYPES = ['image/gif', 'image/png', 'image/jpeg', 'image/webp']
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

/** 본문에 저장하는 동영상 자리(<div data-vid="키">)의 키 모양 — 우리 R2 의 talk/ 아래 파일만 */
export const VIDEO_KEY_RE = /^talk\/[A-Za-z0-9-]{8,64}\.(mp4|mov|webm)$/

export const videoUrl = (key: string) => `${MEDIA_BASE}/${key}`

/** 파일 크기 → 사람이 읽는 MB (소수 한 자리) */
export const toMb = (bytes: number) => (bytes / MB).toFixed(1)
