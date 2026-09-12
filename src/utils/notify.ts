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

/** 받는 사람의 알림 설정 (profiles 의 세 칸 · migration_notify_prefs) */
export type NotifyPrefs = {
  notifyComment?: boolean; notifyReply?: boolean; notifyLike?: boolean; notifyFollow?: boolean
}

/** 받는 사람 id → 그 사람의 설정. 못 찾으면 undefined 를 주면 된다(= 켜짐). */
export type PrefsLookup = (userId: string) => NotifyPrefs | null | undefined

/**
 * 이 종류의 **폰 푸시**를 받기로 해 뒀나.
 *
 * ⚠️ 사이트 안 종 아이콘은 이 값과 무관하게 **항상** 뜬다. 설정은 폰 알림만 끈다.
 *    (2026-09-09 결정 — 종은 사이트에 들어와야 보이니 꺼 둘 이유가 없고,
 *     성가신 건 주머니에서 울리는 쪽이다)
 *
 * 실제로 이 규칙을 적용하는 곳은 Edge Function 이다
 * (supabase/functions/push-on-activity). 알림 행은 댓글 단 사람의 브라우저가
 * 만들고, 푸시는 서버가 쏘기 때문이다. 여기 있는 건 규칙의 원본이자 테스트 대상이다.
 * **한쪽만 고치지 말 것.**
 *
 * 값이 없으면 켜진 것으로 본다 — 마이그레이션 전이거나 프로필을 못 읽은 상태에서
 * 알림이 통째로 사라지는 것보다, 기본값(전부 켜짐)대로 오는 쪽이 덜 놀랍다.
 */
export function wantsNotification(prefs: NotifyPrefs | null | undefined, type: NotificationType): boolean {
  if (!prefs) return true
  if (type === 'comment') return prefs.notifyComment !== false
  if (type === 'reply') return prefs.notifyReply !== false
  if (type === 'post') return prefs.notifyFollow !== false
  return prefs.notifyLike !== false   // like · dislike
}

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
 * 알림 설정은 여기서 보지 않는다 — 종 아이콘은 항상 뜬다.
 * 설정은 폰 푸시만 끄고, 그 판정은 Edge Function 이 한다.
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
