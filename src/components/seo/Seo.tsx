import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  SITE_NAME, SITE_URL, DEFAULT_TITLE, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE,
  absUrl, clampText, buildTitle,
} from '@/utils/seo'

/**
 * 페이지별 <title> / meta / canonical / JSON-LD 주입.
 *
 * React 19 는 컴포넌트 안의 <title>·<meta> 를 head 로 끌어올려 주지만,
 * index.html 에 있는 기본 태그를 대체하지 않고 '추가'하기 때문에
 * description·og 가 두 벌씩 생긴다. 그래서 여기서는 DOM upsert 로
 * 같은 태그를 항상 하나만 유지한다. (CSR 전용이라 document 접근 안전)
 */

type SeoType = 'website' | 'article' | 'video.movie' | 'video.tv_show' | 'book'

interface SeoProps {
  /** 페이지 제목. 비우면 사이트 기본 제목 */
  title?: string | null
  description?: string | null
  /** og:image. 상대경로도 절대경로로 변환됨 */
  image?: string | null
  /** canonical 경로. 기본값은 현재 pathname (쿼리스트링 제외) */
  path?: string | null
  type?: SeoType
  /** 개인 페이지(설정·내 글 등)는 색인 제외 */
  noindex?: boolean
  /** schema.org 구조화 데이터 */
  jsonLd?: Record<string, unknown> | null
}

/** name= 또는 property= 로 meta 태그를 찾아 없으면 만들고 있으면 값만 교체 */
function upsertMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

const JSONLD_ID = 'seo-jsonld'

/** 직렬화된 JSON-LD 문자열을 넣는다. 빈 문자열이면 태그를 제거 */
function upsertJsonLd(json: string) {
  const existing = document.getElementById(JSONLD_ID)
  if (!json) { existing?.remove(); return }
  const el = existing ?? Object.assign(document.createElement('script'), {
    id: JSONLD_ID, type: 'application/ld+json',
  })
  el.textContent = json
  if (!existing) document.head.appendChild(el)
}

export function Seo({
  title, description, image, path, type = 'website', noindex = false, jsonLd = null,
}: SeoProps) {
  const location = useLocation()
  // 쿼리스트링은 canonical 에서 제외한다. /browse?sort=top 같은 정렬 조합이
  // 전부 별개 URL 로 색인되면 중복 콘텐츠로 취급되기 때문.
  const canonicalPath = path ?? location.pathname

  const fullTitle = title ? buildTitle(title) : DEFAULT_TITLE
  const desc = clampText(description) || DEFAULT_DESCRIPTION
  const ogImage = image ? absUrl(image) : DEFAULT_OG_IMAGE
  const canonical = `${SITE_URL}${canonicalPath === '/' ? '/' : canonicalPath}`
  // 객체 그대로를 deps 에 넣으면 매 렌더마다 새 참조라 effect 가 계속 돈다 → 문자열로 비교
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : ''

  useLayoutEffect(() => {
    document.title = fullTitle

    upsertMeta('name', 'description', desc)
    upsertMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    upsertLink('canonical', canonical)

    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:locale', 'ko_KR')
    upsertMeta('property', 'og:type', type)
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', desc)
    upsertMeta('property', 'og:image', ogImage)
    upsertMeta('property', 'og:url', canonical)

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', fullTitle)
    upsertMeta('name', 'twitter:description', desc)
    upsertMeta('name', 'twitter:image', ogImage)

    upsertJsonLd(jsonLdText)
  }, [fullTitle, desc, ogImage, canonical, type, noindex, jsonLdText])

  // JSON-LD 는 페이지를 떠날 때 반드시 치운다.
  // (다음 페이지가 jsonLd 를 안 주면 이전 작품 정보가 남아 잘못된 구조화 데이터가 된다)
  useLayoutEffect(() => () => upsertJsonLd(''), [])

  return null
}
