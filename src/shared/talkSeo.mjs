/**
 * 토론글(/talk/:id) 구조화 데이터 — 앱(DiscussionDetailPage)과 프리렌더(scripts/prerender.mjs)가
 * 같은 값을 내도록 한 곳에 둔다.
 *
 * 왜 둘이 같아야 하나: 프리렌더가 원본 HTML 에 JSON-LD 를 넣어도, JS 를 돌린 구글이 보는 건
 * 앱이 Seo 로 덮어쓴 값이다. 앱이 jsonLd 를 안 넘기면 Seo 가 태그를 지워 버린다.
 *
 * - 별점 있는 작품 글 → Review (리뷰 스니펫)
 * - 그 밖의 글       → DiscussionForumPosting (구글 '토론 및 포럼' 칸의 대상)
 *   https://developers.google.com/search/docs/appearance/structured-data/discussion-forum
 * - 스포일러 글      → 별점이 없으면 넣지 않는다. 본문을 검색결과에 내보내지 않기로 한 글이다
 *
 * 이름(nameOf)은 호출한 쪽이 준다 — 앱은 캐시에서, 프리렌더는 DB 에서 닉네임을 찾는다.
 */
import { schemaTypeOf } from './contentSeo.mjs'

/** 구조화 데이터에 싣는 댓글 수 상한. 화면엔 전부 보이니 JSON-LD 는 앞쪽만 */
export const TALK_SCHEMA_COMMENTS = 50

const byCreated = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt))

/**
 * 읽을 수 있는 댓글을 원댓글 → 답글 트리로 (달린 차례대로).
 * 지워진 원댓글은 빼고, 그 밑 답글은 맨 위 단계로 올린다 — 본문이 없는 Comment 는 구글이 오류로 본다.
 * @returns {{ c: object, replies: object[] }[]}
 */
export function talkCommentTree(comments = []) {
  const live = comments.filter(c => !c.deleted && String(c.body || '').trim())
  const sorted = [...live].sort(byCreated)
  const liveIds = new Set(sorted.map(c => c.id))
  const roots = sorted.filter(c => !c.parentId || !liveIds.has(c.parentId))
  return roots.map(c => ({ c, replies: sorted.filter(r => r.parentId === c.id) }))
}

/**
 * @param {object} o
 * @param {object} o.post       discussions 행
 * @param {object|null} o.content 작품 (자유방 글은 없음)
 * @param {object[]} o.comments  그 글의 discussion_comments 행
 * @param {(x: {authorId?: string|null, guestName?: string|null}) => string} o.nameOf
 * @param {string} o.siteUrl
 */
export function buildTalkJsonLd({ post, content, comments = [], nameOf, siteUrl }) {
  const url = `${siteUrl}/talk/${post.id}`
  const title = post.title || '(제목 없음)'
  const person = x => ({ '@type': 'Person', name: nameOf(x) })

  // author 누락·itemReviewed 타입 오류는 구글이 '심각한 문제'로 잡아 스니펫을 통째로 뺀다
  if (content && post.rating != null) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Review',
      url,
      name: title,
      datePublished: post.createdAt,
      author: person(post),
      itemReviewed: {
        '@type': schemaTypeOf(content),
        name: content.title,
        url: `${siteUrl}/content/${content.id}`,
        ...(content.posterUrl ? { image: content.posterUrl } : {}),
      },
      reviewRating: { '@type': 'Rating', ratingValue: post.rating, bestRating: 10, worstRating: 1 },
    }
  }
  if (post.spoiler || !String(post.body || '').trim()) return null

  const tree = talkCommentTree(comments)
  const count = tree.reduce((n, t) => n + 1 + t.replies.length, 0)
  const toComment = c => ({
    '@type': 'Comment',
    text: c.body,
    datePublished: c.createdAt,
    author: person(c),
  })
  let budget = TALK_SCHEMA_COMMENTS
  const comment = []
  for (const { c, replies } of tree) {
    if (budget-- <= 0) break
    const kids = replies.slice(0, Math.max(0, budget)).map(toComment)
    budget -= kids.length
    comment.push(kids.length ? { ...toComment(c), comment: kids } : toComment(c))
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    url,
    mainEntityOfPage: url,
    headline: title,
    text: post.body,
    datePublished: post.createdAt,
    author: person(post),
    ...(content ? {
      about: { '@type': schemaTypeOf(content), name: content.title, url: `${siteUrl}/content/${content.id}` },
    } : {}),
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/CommentAction',
      userInteractionCount: count,
    },
    ...(comment.length ? { comment } : {}),
  }
}
