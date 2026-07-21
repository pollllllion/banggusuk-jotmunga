import { defineConfig } from 'vitest/config'

// 순수 헬퍼(scripts/tmdb-lib.mjs)만 테스트한다. 브라우저 코드(src)는 대상 외.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.mjs'],
  },
})
