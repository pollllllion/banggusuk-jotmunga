import { describe, it, expect } from 'vitest'
import { extractMediaRefs } from '../media-refs.mjs'

describe('extractMediaRefs', () => {
  it('Supabase 주소와 R2 주소를 따로 모은다', () => {
    const { supabase, r2 } = extractMediaRefs([
      '<img src="https://x.supabase.co/storage/v1/object/public/talk-media/talk/old.gif">',
      '<img src="https://ottcal.com/media/talk/new-1.gif"> 그리고 https://ottcal.com/media/avatars/me.webp',
    ])
    expect([...supabase]).toEqual(['talk/old.gif'])
    expect([...r2].sort()).toEqual(['avatars/me.webp', 'talk/new-1.gif'])
  })

  it("Supabase 의 'talk-media/talk/..' 를 R2 참조로 착각하지 않는다", () => {
    const { r2 } = extractMediaRefs(['https://x.supabase.co/storage/v1/object/public/talk-media/talk/old.gif'])
    expect(r2.size).toBe(0)
  })

  it('쿼리·빈 값·검증용 workers.dev 주소도 견딘다', () => {
    const { r2 } = extractMediaRefs(['', null, 'https://ottcal.a.workers.dev/media/talk/q.png?v=2'])
    expect([...r2]).toEqual(['talk/q.png'])
  })
})
