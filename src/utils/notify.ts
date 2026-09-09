/**
 * 알림 대상·문구 계산 (순수 함수).
 *
 * DB·캐시를 모르는 곳에 둔 이유: "누구에게 몇 개가 가는가"가 알림 기능의 전부이고,
 * 여기가 틀리면 남의 알림이 나에게 오거나(사고) 아무에게도 안 간다(기능 없음).
 * 실제 행 생성·삽입은 api/discussions.ts 가 한다.
 *
 * ⚠️ 받는 쪽은 **고정닉 계정만** 될 수 있다. 유동닉 글은 authorId 가 null 이고,
 *    notifications 의 RLS select 는 auth.uid() 기준이라 유동닉은 자기 알림을 못 읽는다.
 *    그래서 "authorId 가 있다 = 계정이다 = 받을 수 있다" 가 그대로 필터가 된다.
 */
import type { NotificationType } from '@/types'

export type NotifyTarget = { userId: string; type: NotificationType; message: string }

/** 알림 문구에 넣을 글 이름. 제목이 없던 옛 글은 본문 앞부분으로 대신한다. */
export const LABEL_MAX = 20

export function postLabel(title: string | null | undefined, body: string | null | undefined): string {
  const raw = (title || body || '').replace(/\s+/g, ' ').trim()
  if (!raw) return '글'
  return raw.length > LABEL_MAX ? `${raw.slice(0, LABEL_MAX)}…` : raw
}

/**
 * 댓글 알림 대상 — ① 글쓴이 ② 이 글에 이미 댓글을 단 다른 사람들.
 *
 * 대댓글(부모 댓글) 개념이 없는 게시판이라 ②를 '참여자 알림'으로 대신한다.
 * 내가 댓글 단 글에 대화가 이어지는 걸 모르면 토론이 한 번에 끝나 버린다.
 *
 * 보내지 않는 경우:
 *   - 글쓴이·참여자가 유동닉(null) — 읽을 수가 없다
 *   - 자기 글에 자기가 단 댓글, 자기가 또 단 댓글
 *   - 한 사람에게 두 번 (글쓴이 겸 댓글러는 '댓글' 알림 하나만)
 *
 * @param participantIds 이 글의 기존 댓글 작성자 id 목록 (방금 단 댓글이 섞여 있어도 된다)
 */
export function commentNotifyTargets(opts: {
  postAuthorId: string | null | undefined
  commenterId: string | null | undefined
  participantIds: (string | null | undefined)[]
  label: string
  actor: string
}): NotifyTarget[] {
  const { postAuthorId, commenterId, participantIds, label, actor } = opts
  const out: NotifyTarget[] = []
  const seen = new Set<string>(commenterId ? [commenterId] : [])

  if (postAuthorId && !seen.has(postAuthorId)) {
    seen.add(postAuthorId)
    out.push({ userId: postAuthorId, type: 'comment', message: `${actor}님이 '${label}' 글에 댓글을 남겼어요.` })
  }
  for (const id of participantIds) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ userId: id, type: 'reply', message: `내가 댓글 단 '${label}' 글에 ${actor}님이 댓글을 남겼어요.` })
  }
  return out
}

/** 추천 알림 대상 — 글/댓글 주인 한 명. 자기 것 추천이거나 유동닉이면 없음. */
export function likeNotifyTarget(opts: {
  targetAuthorId: string | null | undefined
  actorId: string
  actor: string
  label: string
  what: '글' | '댓글'
}): NotifyTarget | null {
  const { targetAuthorId, actorId, actor, label, what } = opts
  if (!targetAuthorId || targetAuthorId === actorId) return null
  return { userId: targetAuthorId, type: 'like', message: `${actor}님이 '${label}' ${what}을 추천했어요.` }
}
