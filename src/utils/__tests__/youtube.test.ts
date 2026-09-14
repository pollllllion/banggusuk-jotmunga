import { describe, it, expect } from 'vitest'
import { youtubeId, youtubeWatchUrl, youtubeEmbedUrl } from '../youtube'

describe('youtubeId', () => {
  const ID = 'dQw4w9WgXcQ'

  it('흔한 주소 모양을 전부 알아본다', () => {
    expect(youtubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID)
    expect(youtubeId(`https://youtube.com/watch?v=${ID}&t=42s`)).toBe(ID)
    expect(youtubeId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID)
    expect(youtubeId(`https://youtu.be/${ID}`)).toBe(ID)
    expect(youtubeId(`https://youtu.be/${ID}?si=abc`)).toBe(ID)
    expect(youtubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID)
    expect(youtubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
    expect(youtubeId(`https://www.youtube.com/live/${ID}`)).toBe(ID)
    expect(youtubeId(`  https://youtu.be/${ID}  `)).toBe(ID)
  })

  it('유튜브 영상이 아니면 null', () => {
    expect(youtubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(youtubeId('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(youtubeId('https://www.youtube.com/@channel')).toBeNull()
    expect(youtubeId('https://www.youtube.com/watch?v=short')).toBeNull()
    expect(youtubeId('javascript:alert(1)')).toBeNull()
    expect(youtubeId('그냥 글자')).toBeNull()
    expect(youtubeId('')).toBeNull()
  })

  it('ID 에 따옴표·꺾쇠가 섞이면 받지 않는다 (HTML 에 그대로 들어가므로)', () => {
    expect(youtubeId('https://youtu.be/abc"><img>')).toBeNull()
  })
})

describe('youtube 주소 만들기', () => {
  it('보는 주소와 플레이어 주소', () => {
    expect(youtubeWatchUrl('dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ')
    expect(youtubeEmbedUrl('dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })
})
