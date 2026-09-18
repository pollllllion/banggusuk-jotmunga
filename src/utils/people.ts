/**
 * 취향 칸의 '이 사람들 걸 봅니다' — 좋아하는 감독·작가·배우.
 *
 * 처음엔 이름만 적는 칸이었다(favoriteDirectors: string[]). 그러면 "김은숙" 이 작가인지 배우인지
 * 알 수 없고, 그 사람의 작품과 이을 방법도 없다. 그래서 TMDB 인물 검색에서 고르게 하고
 * 번호·사진·직군을 같이 담는다. 검색에 안 나오는 사람(TMDB 에 한글 이름이 없는 경우)은
 * 여전히 이름만으로 넣을 수 있다 — 그때 tmdbId 는 null 이다.
 */
import type { FavoritePerson, PersonRole, User } from '@/types'

export const MAX_PEOPLE_PER_ROLE = 20

export const ROLE_LABEL: Record<PersonRole, string> = { maker: '감독·작가', actor: '배우' }

/** TMDB 의 known_for_department → 우리 두 갈래. 연기만 배우고, 나머지(연출·각본·제작…)는 만드는 쪽이다 */
export function roleOfDepartment(department: string | null | undefined): PersonRole {
  return department === 'Acting' ? 'actor' : 'maker'
}

/** 같은 사람인가 — 번호가 둘 다 있으면 번호로, 아니면 이름으로(공백 무시) */
export function samePerson(a: Pick<FavoritePerson, 'name' | 'tmdbId'>, b: Pick<FavoritePerson, 'name' | 'tmdbId'>): boolean {
  if (a.tmdbId && b.tmdbId) return a.tmdbId === b.tmdbId
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  return norm(a.name) === norm(b.name)
}

/**
 * 이 사람의 목록. favoritePeople 이 기준이고, 비어 있으면 이름만 담던 옛 칸에서 읽는다
 * (favoriteDirectors → 감독·작가, favoriteActors → 배우).
 */
export function peopleOf(user: Pick<User, 'favoritePeople' | 'favoriteDirectors' | 'favoriteActors'>): FavoritePerson[] {
  const list = Array.isArray(user.favoritePeople) ? user.favoritePeople.filter(p => p && p.name) : []
  if (list.length) return list.map(p => ({ name: p.name, role: p.role === 'actor' ? 'actor' : 'maker', tmdbId: p.tmdbId ?? null, profilePath: p.profilePath ?? null }))
  return [
    ...(user.favoriteDirectors ?? []).map(name => ({ name, role: 'maker' as const, tmdbId: null, profilePath: null })),
    ...(user.favoriteActors ?? []).map(name => ({ name, role: 'actor' as const, tmdbId: null, profilePath: null })),
  ]
}

/** 목록에 한 사람을 더한다. 이미 있거나 그 갈래가 꽉 찼으면 그대로 돌려준다 */
export function addPerson(list: FavoritePerson[], person: FavoritePerson): FavoritePerson[] {
  if (!person.name.trim()) return list
  if (list.some(p => samePerson(p, person))) return list
  if (list.filter(p => p.role === person.role).length >= MAX_PEOPLE_PER_ROLE) return list
  return [...list, { ...person, name: person.name.trim() }]
}

/** 작은 사진 주소 (TMDB 인물 사진은 w45 · w185 만 준다) */
export function personPhotoUrl(profilePath: string | null | undefined, size: 'w45' | 'w185' = 'w45'): string | null {
  return profilePath ? `https://image.tmdb.org/t/p/${size}${profilePath}` : null
}
