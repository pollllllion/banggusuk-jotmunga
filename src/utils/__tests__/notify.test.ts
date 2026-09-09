import { describe, it, expect } from 'vitest'
import { commentNotifyTargets, likeNotifyTarget, postLabel, wantsNotification } from '../notify'

const base = { label: '테스트 글', actor: '댓글러' }

describe('postLabel', () => {
  it('제목이 있으면 제목을 쓴다', () => {
    expect(postLabel('오징어 게임 3', '본문')).toBe('오징어 게임 3')
  })
  it('제목이 없던 옛 글은 본문으로 대신한다', () => {
    expect(postLabel(null, '본문만 있는 글')).toBe('본문만 있는 글')
  })
  it('긴 제목은 20자에서 자르고 …를 붙인다', () => {
    const long = '가'.repeat(40)
    expect(postLabel(long, null)).toBe('가'.repeat(20) + '…')
  })
  it('줄바꿈·연속 공백은 한 칸으로 접는다', () => {
    expect(postLabel(null, '여러\n\n줄   글')).toBe('여러 줄 글')
  })
  it('제목도 본문도 없으면 빈 문자열이 아니라 기본값', () => {
    expect(postLabel(null, '   ')).toBe('글')
  })
})

describe('commentNotifyTargets', () => {
  it('글쓴이에게 comment 알림이 간다', () => {
    const t = commentNotifyTargets({ ...base, postAuthorId: 'author', commenterId: 'bob', participantIds: ['bob'] })
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ userId: 'author', type: 'comment' })
    expect(t[0].message).toContain('댓글러')
    expect(t[0].message).toContain('테스트 글')
  })

  it('자기 글에 자기가 댓글을 달면 아무에게도 안 간다', () => {
    expect(commentNotifyTargets({ ...base, postAuthorId: 'me', commenterId: 'me', participantIds: ['me'] })).toEqual([])
  })

  it('기존 댓글 작성자에게 reply 알림이 간다', () => {
    const t = commentNotifyTargets({ ...base, postAuthorId: 'author', commenterId: 'carol', participantIds: ['bob', 'carol'] })
    expect(t.map(x => [x.userId, x.type])).toEqual([['author', 'comment'], ['bob', 'reply']])
  })

  it('글쓴이 겸 댓글러에게는 한 번만 간다 (comment 쪽이 이긴다)', () => {
    const t = commentNotifyTargets({ ...base, postAuthorId: 'author', commenterId: 'bob', participantIds: ['author', 'bob'] })
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ userId: 'author', type: 'comment' })
  })

  it('같은 사람이 여러 번 댓글을 달았어도 알림은 한 번', () => {
    const t = commentNotifyTargets({ ...base, postAuthorId: 'author', commenterId: 'z', participantIds: ['bob', 'bob', 'bob'] })
    expect(t.filter(x => x.userId === 'bob')).toHaveLength(1)
  })

  it('유동닉(null)은 글쓴이든 참여자든 대상이 아니다 — 자기 알림을 읽을 수 없다', () => {
    const t = commentNotifyTargets({ ...base, postAuthorId: null, commenterId: null, participantIds: [null, undefined] })
    expect(t).toEqual([])
  })

  it('유동닉이 단 댓글도 계정 글쓴이에게는 알림을 보낸다', () => {
    const t = commentNotifyTargets({ ...base, postAuthorId: 'author', commenterId: null, participantIds: [null] })
    expect(t).toHaveLength(1)
    expect(t[0].userId).toBe('author')
  })
})

describe('wantsNotification (알림 설정)', () => {
  it('설정이 없으면(마이그레이션 전) 전부 켜진 것으로 본다', () => {
    for (const t of ['comment', 'reply', 'like'] as const) {
      expect(wantsNotification(undefined, t)).toBe(true)
      expect(wantsNotification(null, t)).toBe(true)
      expect(wantsNotification({}, t)).toBe(true)
    }
  })
  it('false 로 명시했을 때만 끈다', () => {
    expect(wantsNotification({ notifyComment: false }, 'comment')).toBe(false)
    expect(wantsNotification({ notifyComment: false }, 'reply')).toBe(true)
    expect(wantsNotification({ notifyReply: false }, 'reply')).toBe(false)
    expect(wantsNotification({ notifyLike: false }, 'like')).toBe(false)
  })
})

describe('설정은 종 아이콘을 막지 않는다', () => {
  // 2026-09-09 결정: 종은 항상 뜨고, 설정은 폰 푸시만 끈다.
  // 그 판정은 Edge Function(push-on-activity)이 하고, 여기서는 하지 않는다.
  it('설정을 꺼도 대상 계산은 그대로다', () => {
    const t = commentNotifyTargets({ ...base, postAuthorId: 'author', commenterId: 'bob', participantIds: ['bob', 'carol'] })
    expect(t.map(x => [x.userId, x.type])).toEqual([['author', 'comment'], ['carol', 'reply']])
  })

  it('추천도 마찬가지', () => {
    const t = likeNotifyTarget({ targetAuthorId: 'author', actorId: 'fan', actor: '팬', label: 'x', what: '글' })
    expect(t).not.toBeNull()
  })
})

describe('wantsNotification — 폰 푸시 판정 (Edge Function 이 쓰는 규칙)', () => {
  it('false 로 명시했을 때만 끈다', () => {
    expect(wantsNotification({ notifyComment: false }, 'comment')).toBe(false)
    expect(wantsNotification({ notifyComment: false }, 'reply')).toBe(true)
    expect(wantsNotification({ notifyReply: false }, 'reply')).toBe(false)
    expect(wantsNotification({ notifyLike: false }, 'like')).toBe(false)
  })
})

describe('likeNotifyTarget', () => {
  it('글 주인에게 like 알림이 간다', () => {
    const t = likeNotifyTarget({ targetAuthorId: 'author', actorId: 'fan', actor: '팬', label: '글제목', what: '글' })
    expect(t).toMatchObject({ userId: 'author', type: 'like' })
    expect(t!.message).toContain('글을 추천')
  })
  it('자기 글 자기 추천은 알림이 없다', () => {
    expect(likeNotifyTarget({ targetAuthorId: 'me', actorId: 'me', actor: '나', label: 'x', what: '글' })).toBeNull()
  })
  it('유동닉 글 추천은 알림이 없다', () => {
    expect(likeNotifyTarget({ targetAuthorId: null, actorId: 'fan', actor: '팬', label: 'x', what: '댓글' })).toBeNull()
  })
})
