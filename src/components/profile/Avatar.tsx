import { useEffect, useState } from 'react'
import { clickable } from '@/utils/a11y'

/**
 * 동그란 프로필 사진. 올린 사진이 없으면 빈 사람 실루엣이 대신 뜬다.
 *
 * 사진은 talk-media 버킷의 avatars/ 아래에 있고 profiles."avatarUrl" 에 주소만 담긴다
 * (migration_profile_avatar · utils/talkMedia.ts 의 uploadAvatar).
 *
 * 주소는 있는데 그림이 안 열리는 경우가 있다(파일이 지워졌거나 버킷이 막혔거나).
 * 그냥 두면 브라우저 기본 '깨진 그림' 아이콘이 떠서 사이트가 고장난 것처럼 보인다 —
 * 실루엣으로 돌려놓는다. 사진이 없는 사람과 똑같이 보이는 편이 낫다.
 */
export function Avatar({ src, name, size = 34, onClick }: {
  /** 프로필 사진 URL. 없으면 실루엣 */
  src?: string | null
  name: string | null | undefined
  size?: number
  /** 프로필로 보낼 수 있으면 넘긴다. 없으면 그냥 그림이다 */
  onClick?: () => void
}) {
  // src 가 바뀌면 다시 시도한다 (사진을 새로 올린 직후가 그 경우다)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])

  return (
    <span
      className={`avatar ${onClick ? 'linkable' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden={!onClick}
      {...(onClick ? clickable(onClick, `${name} 프로필 보기`) : {})}
    >
      {src && !broken
        ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
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
