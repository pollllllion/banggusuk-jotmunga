import { describe, it, expect } from 'vitest'
import { extractMediaRefs } from '../media-refs.mjs'

describe('extractMediaRefs', () => {
  it('Supabase 주소와 R2 주소를 따로 모은다', () => {
    const { supabase, r2 } = extractMediaRefs([
      '<img src="https://x.supabase.co/storage/v1/object/public/talk-media/talk/old.gif">',
      '<img src="https://media.ottcal.com/talk/new-1.gif"> 그리고 https://media.ottcal.com/avatars/me.webp',
    ])
    expect([...supabase]).toEqual(['talk/old.gif'])
    expect([...r2].sort()).toEqual(['avatars/me.webp', 'talk/new-1.gif'])
  })

  it('본문의 동영상 자리(data-vid)는 주소가 아니라 키라도 참조로 센다 — 빠지면 영상이 지워진다', () => {
    const { r2 } = extractMediaRefs(['<div data-vid="talk/5f1c9a2e-aaaa-bbbb-cccc-000000000000.mp4">[동영상]</div>'])
    expect([...r2]).toEqual(['talk/5f1c9a2e-aaaa-bbbb-cccc-000000000000.mp4'])
  })

  it("Supabase 의 'talk-media/talk/..' 를 R2 참조로 착각하지 않는다", () => {
    const { r2 } = extractMediaRefs(['https://x.supabase.co/storage/v1/object/public/talk-media/talk/old.gif'])
    expect(r2.size).toBe(0)
  })

  it('쿼리·빈 값을 견딘다', () => {
    const { r2 } = extractMediaRefs(['', null, 'https://media.ottcal.com/talk/q.png?v=2'])
    expect([...r2]).toEqual(['talk/q.png'])
  })
})
