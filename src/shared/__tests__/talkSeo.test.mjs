import { describe, it, expect } from 'vitest'
import { buildTalkJsonLd, talkCommentTree, TALK_SCHEMA_COMMENTS } from '../talkSeo.mjs'

const SITE = 'https://ottcal.com'
const nameOf = x => x.authorId ? `닉-${x.authorId}` : (x.guestName || '익명')
const drama = { id: 'tmdb-dr-1', type: 'drama', title: '들쥐' }
const post = { id: 'p1', contentId: 'tmdb-dr-1', authorId: 'u1', title: '제목', body: '본문', rating: null, spoiler: false, createdAt: '2026-09-18T05:33:00Z' }
const cm = (id, extra = {}) => ({ id, discussionId: 'p1', authorId: null, guestName: `g${id}`, body: `댓글${id}`, createdAt: `2026-09-18T06:0${id}:00Z`, ...extra })

describe('talkCommentTree', () => {
  it('답글은 원댓글 밑에, 달린 차례대로', () => {
    const t = talkCommentTree([cm('3', { parentId: '1' }), cm('2'), cm('1')])
    expect(t.map(x => x.c.id)).toEqual(['1', '2'])
    expect(t[0].replies.map(r => r.id)).toEqual(['3'])
  })

  it('지워진 원댓글은 빼고 그 답글을 위로 올린다', () => {
    const t = talkCommentTree([cm('1', { deleted: true, body: '' }), cm('2', { parentId: '1' })])
    expect(t.map(x => x.c.id)).toEqual(['2'])
  })
})

describe('buildTalkJsonLd', () => {
  it('별점 없는 글은 DiscussionForumPosting — 작품·댓글 포함', () => {
    const ld = buildTalkJsonLd({ post, content: drama, comments: [cm('1'), cm('2', { parentId: '1' })], nameOf, siteUrl: SITE })
    expect(ld['@type']).toBe('DiscussionForumPosting')
    expect(ld.url).toBe('https://ottcal.com/talk/p1')
    expect(ld.text).toBe('본문')
    expect(ld.author).toEqual({ '@type': 'Person', name: '닉-u1' })
    expect(ld.about).toMatchObject({ '@type': 'TVSeries', name: '들쥐' })
    expect(ld.interactionStatistic.userInteractionCount).toBe(2)
    expect(ld.comment).toHaveLength(1)
    expect(ld.comment[0].author.name).toBe('g1')
    expect(ld.comment[0].comment[0].text).toBe('댓글2')
  })

  it('자유방 글(작품 없음)도 만든다, about 없이', () => {
    const ld = buildTalkJsonLd({ post: { ...post, contentId: null }, content: null, nameOf, siteUrl: SITE })
    expect(ld['@type']).toBe('DiscussionForumPosting')
    expect(ld.about).toBeUndefined()
    expect(ld.comment).toBeUndefined()
  })

  it('별점 있는 작품 글은 Review', () => {
    const ld = buildTalkJsonLd({ post: { ...post, rating: 8 }, content: drama, nameOf, siteUrl: SITE })
    expect(ld['@type']).toBe('Review')
    expect(ld.reviewRating.ratingValue).toBe(8)
  })

  it('스포일러 글은 본문을 내보내지 않는다', () => {
    expect(buildTalkJsonLd({ post: { ...post, spoiler: true }, content: drama, nameOf, siteUrl: SITE })).toBeNull()
  })

  it('댓글은 상한까지만 싣고, 개수는 전체를 센다', () => {
    const many = Array.from({ length: TALK_SCHEMA_COMMENTS + 5 }, (_, i) => cm(String(i), { createdAt: `2026-09-18T06:00:${String(i).padStart(2, '0')}Z` }))
    const ld = buildTalkJsonLd({ post, content: drama, comments: many, nameOf, siteUrl: SITE })
    expect(ld.comment).toHaveLength(TALK_SCHEMA_COMMENTS)
    expect(ld.interactionStatistic.userInteractionCount).toBe(TALK_SCHEMA_COMMENTS + 5)
  })
})
