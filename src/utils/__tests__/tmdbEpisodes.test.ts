import { describe, it, expect } from 'vitest'
import { mapEpisodes } from '@/utils/tmdb'

describe('mapEpisodes — TMDB 시즌 응답 → 회차표', () => {
  it('회차 번호순으로 세우고 날짜는 YYYY-MM-DD 로 자른다', () => {
    const out = mapEpisodes([
      { episode_number: 2, name: '두 번째 밤', air_date: '2026-09-19' },
      { episode_number: 1, name: '첫 만남', air_date: '2026-09-12T00:00:00Z' },
    ])
    expect(out).toEqual([
      { number: 1, name: '첫 만남', airDate: '2026-09-12' },
      { number: 2, name: '두 번째 밤', airDate: '2026-09-19' },
    ])
  })

  it('자리말 제목은 제목으로 치지 않는다', () => {
    const names = ['에피소드 7', 'Episode 7', '7화', '제7회', 'ep. 7', '  에피소드 12  ']
    for (const name of names) expect(mapEpisodes([{ episode_number: 7, name, air_date: null }])[0].name).toBeNull()
  })

  it('진짜 제목은 숫자가 들어 있어도 남긴다', () => {
    expect(mapEpisodes([{ episode_number: 3, name: '3화의 비밀', air_date: null }])[0].name).toBe('3화의 비밀')
    expect(mapEpisodes([{ episode_number: 3, name: '7번 국도', air_date: null }])[0].name).toBe('7번 국도')
  })

  it('날짜가 없는 회차도 남긴다 — 날짜 미정으로 보여준다', () => {
    expect(mapEpisodes([{ episode_number: 9, name: null, air_date: null }])).toEqual([{ number: 9, name: null, airDate: null }])
  })

  it('0화(스페셜)·번호 없는 항목·빈 응답은 버린다', () => {
    expect(mapEpisodes([{ episode_number: 0, name: '스페셜' }, { name: '번호 없음' }])).toEqual([])
    expect(mapEpisodes(null)).toEqual([])
    expect(mapEpisodes(undefined)).toEqual([])
  })
})
