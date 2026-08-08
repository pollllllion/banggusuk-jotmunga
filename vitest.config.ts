import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// 순수 계산 헬퍼만 테스트한다 (scripts 의 .mjs 라이브러리 + src 의 유틸).
// 컴포넌트·DOM 렌더링은 여전히 대상 외.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // src/shared 는 앱과 빌드 스크립트가 함께 쓰는 .mjs 라 mjs 도 포함한다
    include: ['scripts/**/*.test.mjs', 'src/**/*.test.{ts,mjs}'],
  },
})
