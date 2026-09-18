import { describe, it, expect } from 'vitest'
import { addPerson, peopleOf, roleOfDepartment, samePerson, personPhotoUrl, MAX_PEOPLE_PER_ROLE } from '@/utils/people'
import { mapPeople, pickSpacedPeople } from '@/utils/tmdb'
import type { FavoritePerson } from '@/types'

const person = (name: string, role: FavoritePerson['role'] = 'maker', tmdbId: number | null = null): FavoritePerson =>
  ({ name, role, tmdbId, profilePath: null })

describe('roleOfDepartment', () => {
  it('연기만 배우, 나머지는 만드는 쪽', () => {
    expect(roleOfDepartment('Acting')).toBe('actor')
    expect(roleOfDepartment('Directing')).toBe('maker')
    expect(roleOfDepartment('Writing')).toBe('maker')
    expect(roleOfDepartment(null)).toBe('maker')
  })
})

describe('samePerson', () => {
  it('번호가 둘 다 있으면 번호로 가른다 — 동명이인은 다른 사람이다', () => {
    expect(samePerson(person('김은숙', 'maker', 1), person('김은숙', 'actor', 2))).toBe(false)
    expect(samePerson(person('Bong Joon-ho', 'maker', 7), person('봉준호', 'maker', 7))).toBe(true)
  })

  it('한쪽이라도 번호가 없으면 이름으로 (공백 무시)', () => {
    expect(samePerson(person('송 강호'), person('송강호', 'actor', 9))).toBe(true)
    expect(samePerson(person('송강'), person('송강호'))).toBe(false)
  })
})

describe('peopleOf — 옛 칸에서 읽기', () => {
  it('favoritePeople 이 있으면 그게 기준이다', () => {
    const out = peopleOf({ favoritePeople: [person('봉준호', 'maker', 7)], favoriteDirectors: ['옛 이름'], favoriteActors: [] })
    expect(out.map(p => p.name)).toEqual(['봉준호'])
  })

  it('비어 있으면 이름만 담던 두 칸을 갈래에 맞춰 읽는다', () => {
    const out = peopleOf({ favoritePeople: [], favoriteDirectors: ['박찬욱'], favoriteActors: ['김고은'] })
    expect(out).toEqual([person('박찬욱', 'maker'), person('김고은', 'actor')])
  })

  it('칸이 아예 없는 옛 프로필도 빈 목록으로 읽힌다', () => {
    expect(peopleOf({})).toEqual([])
  })

  it('모양이 어긋난 값은 고쳐 읽는다 (role 누락 · 이름 없는 항목)', () => {
    const out = peopleOf({ favoritePeople: [{ name: '놀란' } as any, { role: 'actor' } as any] })
    expect(out).toEqual([person('놀란', 'maker')])
  })
})

describe('addPerson', () => {
  it('같은 사람은 두 번 안 들어간다', () => {
    const list = [person('봉준호', 'maker', 7)]
    expect(addPerson(list, person('봉준호', 'maker', 7))).toBe(list)
  })

  it('갈래마다 최대치가 따로다', () => {
    const makers = Array.from({ length: MAX_PEOPLE_PER_ROLE }, (_, i) => person(`감독${i}`, 'maker', i + 1))
    expect(addPerson(makers, person('한 명 더', 'maker', 999))).toBe(makers)
    expect(addPerson(makers, person('송강호', 'actor', 1000))).toHaveLength(MAX_PEOPLE_PER_ROLE + 1)
  })

  it('이름 앞뒤 공백은 떼고, 빈 이름은 무시한다', () => {
    expect(addPerson([], person('  신이원  '))[0].name).toBe('신이원')
    expect(addPerson([], person('   '))).toEqual([])
  })
})

describe('personPhotoUrl', () => {
  it('경로가 없으면 null', () => {
    expect(personPhotoUrl(null)).toBeNull()
    expect(personPhotoUrl('/a.jpg')).toBe('https://image.tmdb.org/t/p/w45/a.jpg')
    expect(personPhotoUrl('/a.jpg', 'w185')).toBe('https://image.tmdb.org/t/p/w185/a.jpg')
  })
})

describe('mapPeople — TMDB 인물 검색 응답', () => {
  it('직군·사진·대표작을 뽑는다 (영화는 title, TV 는 name)', () => {
    const out = mapPeople([{
      id: 21684, name: '봉준호', profile_path: '/b.jpg', known_for_department: 'Directing',
      known_for: [{ title: '기생충' }, { name: '설국열차 (TV)' }, { title: '괴물' }, { title: '옥자' }],
    }])
    expect(out).toEqual([{ tmdbId: 21684, name: '봉준호', profilePath: '/b.jpg', department: 'Directing', knownFor: ['기생충', '설국열차 (TV)', '괴물'] }])
  })

  it('번호·이름 없는 항목은 버리고 max 개까지만', () => {
    const raw = [{ name: '번호 없음' }, { id: 1 }, ...Array.from({ length: 12 }, (_, i) => ({ id: i + 10, name: `사람${i}` }))]
    expect(mapPeople(raw)).toHaveLength(8)
    expect(mapPeople(null)).toEqual([])
  })
})

describe('pickSpacedPeople — 붙여 쓴 이름으로 찾기', () => {
  const raw = [
    { id: 1, name: '마틴 스콜세지', popularity: 9 },
    { id: 2, name: '마틴 프리먼', popularity: 30 },
    { id: 3, name: '마틴 스콜세지 주니어', popularity: 1 },
    { id: 1, name: '마틴 스콜세지', popularity: 9 },   // 다른 띄어쓰기 요청에서 또 온 같은 사람
  ]

  it('공백을 무시하고 검색어가 들어 있는 사람만, 한 번씩, 인기순으로', () => {
    expect(pickSpacedPeople(raw, '마틴스콜세지').map(p => p.id)).toEqual([1, 3])
  })

  it('일부만 쳐도 걸린다', () => {
    expect(pickSpacedPeople(raw, '마틴스콜').map(p => p.id)).toEqual([1, 3])
  })

  it('이름이 다르면 인기가 높아도 안 나온다', () => {
    expect(pickSpacedPeople(raw, '마틴스콜세지').some(p => p.id === 2)).toBe(false)
  })
})
