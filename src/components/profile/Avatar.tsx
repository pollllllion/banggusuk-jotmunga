import { clickable } from '@/utils/a11y'

/**
 * 동그란 프로필 사진. 올린 사진이 없으면 빈 사람 실루엣이 대신 뜬다.
 *
 * 사진은 talk-media 버킷의 avatars/ 아래에 있고 profiles."avatarUrl" 에 주소만 담긴다
 * (migration_profile_avatar · utils/talkMedia.ts 의 uploadAvatar).
 */
export function Avatar({ src, name, size = 34, onClick }: {
  /** 프로필 사진 URL. 없으면 실루엣 */
  src?: string | null
  name: string | null | undefined
  size?: number
  /** 프로필로 보낼 수 있으면 넘긴다. 없으면 그냥 그림이다 */
  onClick?: () => void
}) {
  return (
    <span
      className={`avatar ${onClick ? 'linkable' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden={!onClick}
      {...(onClick ? clickable(onClick, `${name} 프로필 보기`) : {})}
    >
      {src
        ? <img src={src} alt="" loading="lazy" />
        : (
          // 머리 + 어깨. 원 안에 꽉 차게 잘리도록 아래쪽을 원 밖까지 그린다
          <svg viewBox="0 0 24 24" fill="currentColor" width={Math.round(size * 0.68)} height={Math.round(size * 0.68)} aria-hidden="true">
            <circle cx="12" cy="9" r="3.9" />
            <path d="M12 14.2c-4.2 0-7 2.4-7 5.3V22h14v-2.5c0-2.9-2.8-5.3-7-5.3z" />
          </svg>
        )}
    </span>
  )
}
