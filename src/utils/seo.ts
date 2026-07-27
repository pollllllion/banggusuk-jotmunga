/**
 * SEO 공통 상수·헬퍼
 *
 * 실제 구현은 src/shared/siteSeo.mjs 에 있다 (빌드 스크립트가 같은 값을 써야 하므로 .mjs).
 * 앱 코드는 기존처럼 '@/utils/seo' 에서 가져다 쓰면 된다.
 */
export {
  SITE_URL, SITE_NAME, SITE_TAGLINE,
  DEFAULT_TITLE, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE,
  absUrl, clampText, buildTitle,
} from '@/shared/siteSeo.mjs'
