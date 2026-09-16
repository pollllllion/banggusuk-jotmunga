import { useRef, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import { Avatar } from '@/components/profile/Avatar'
import { AvatarCropModal } from '@/components/profile/AvatarCropModal'
import { uploadAvatar } from '@/utils/talkMedia'
import { CameraIcon } from '@/components/ui/Icons'
import { useEscapeKey } from '@/hooks/useEscapeKey'

/**
 * 바꿀 수 있는 프로필 사진 — 사진 + 오른쪽 아래 카메라 배지 + 시트 + 자르기 창.
 *
 * 내 정보(/me)에만 있던 것을 **내 피드(/feed)에도** 놓으려고 컴포넌트로 뺐다
 * (2026-09-16). 사진을 바꾸려고 굳이 다른 화면으로 건너가야 할 이유가 없다 —
 * 프로필을 꾸미는 자리는 내 피드 쪽이 오히려 더 자연스럽다.
 * 복붙으로 두 벌을 두지 않는 이유는 늘 같다: 한쪽만 고쳐지는 날이 온다.
 *
 * 그림은 talk-media 버킷의 avatars/ 아래로 올리고 profiles."avatarUrl" 에 주소만 담는다
 * (migration_profile_avatar · utils/talkMedia.ts 의 uploadAvatar).
 *
 * 유동닉(비로그인)에게는 배지를 달지 않는다 — 저장할 계정이 없다.
 */
export function AvatarEditor({ size = 72, className, onChanged }: {
  size?: number
  /** 바깥 레이아웃이 쓰던 클래스를 그대로 얹는다 (내 정보의 .me-avatar 등) */
  className?: string
  /** 사진이 바뀐 뒤 — 레벨 카드처럼 값을 기억하는 것들을 다시 세게 한다 */
  onChanged?: () => void
}) {
  const { user, isAccount, updateProfile } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const fileRef = useRef<HTMLInputElement>(null)
  /** 사진 배지를 누르면 열리는 시트 (카메라/앨범 · 사진 삭제 · 취소) */
  const [sheetOpen, setSheetOpen] = useState(false)
  /** 자르기 창에 올라가 있는 그림. 확인해야 올라간다 */
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  useEscapeKey(sheetOpen, () => setSheetOpen(false))

  if (!user) return null

  /** 고른 그림은 바로 올리지 않고 자르기 창으로 넘긴다 — 어떻게 잘릴지 보고 정한다 */
  const pickAvatar = (file: File | null | undefined) => {
    setSheetOpen(false)
    if (!file) return
    if (!isAccount) { toast('프로필 사진은 로그인(고정닉) 후 바꿀 수 있어요.'); return }
    if (!file.type.startsWith('image/')) { toast('이미지 파일만 올릴 수 있어요.'); return }
    setCropFile(file)
  }

  /** 자르기 창에서 확인한 그림을 올리고 저장한다 */
  const saveAvatar = async (cropped: File) => {
    setCropFile(null)
    setBusy(true)
    try {
      const url = await uploadAvatar(cropped, { alreadySquare: true })
      await updateProfile({ avatarUrl: url })
      toast('프로필 사진을 바꿨어요.')
    } catch (e: any) {
      toast(e?.message || '사진을 올리지 못했어요.')
    } finally {
      setBusy(false); onChanged?.()
    }
  }

  const removeAvatar = async () => {
    setSheetOpen(false)
    if (!user.avatarUrl) return
    if (!confirm('프로필 사진을 삭제할까요?')) return
    setBusy(true)
    // 버킷의 파일 자체는 지우지 않는다 — 같은 주소를 옛 화면이 아직 들고 있을 수 있고,
    // 지운다고 눈에 띄게 아끼는 용량도 아니다(256px webp).
    try { await updateProfile({ avatarUrl: null }); toast('프로필 사진을 지웠어요.') }
    catch { toast('처리하지 못했어요.') }
    finally { setBusy(false); onChanged?.() }
  }

  return (
    <>
      {/* 사진 배지에서 여는 시트. 폰에서는 아래에서 올라오고, 넓은 화면에서는 가운데에 뜬다.
          '사진 삭제'는 올린 사진이 있을 때만 — 지울 게 없는데 지우기를 내놓지 않는다. */}
      {sheetOpen && (
        <div className="sheet-overlay" onClick={e => { if (e.target === e.currentTarget) setSheetOpen(false) }}>
          <div className="sheet" role="dialog" aria-label="프로필 사진">
            <div className="sheet-group">
              <button className="sheet-item" onClick={() => fileRef.current?.click()}>카메라/앨범</button>
              {user.avatarUrl && (
                <button className="sheet-item danger" onClick={removeAvatar}>사진 삭제</button>
              )}
            </div>
            <button className="sheet-item sheet-cancel" onClick={() => setSheetOpen(false)}>취소</button>
          </div>
        </div>
      )}

      {cropFile && (
        <AvatarCropModal file={cropFile} onCancel={() => setCropFile(null)} onDone={saveAvatar} />
      )}

      <div className={`avatar-edit ${className || ''}`}>
        <Avatar src={user.avatarUrl} name={user.nickname} size={size} />
        {/* 사진 오른쪽 아래 카메라 배지 — 누르면 아래에서 시트가 올라온다.
            글자 링크를 사진 밑에 늘어놓는 것보다, 사진 위에 얹힌 배지가 '이 사진을 바꾼다'를
            바로 말한다. 등록/삭제 중 무엇을 할지는 시트에서 고른다. */}
        {isAccount && (
          <button className="me-avatar-cam" onClick={() => setSheetOpen(true)} disabled={busy} aria-label="프로필 사진 바꾸기">
            <CameraIcon size={15} />
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={e => { pickAvatar(e.target.files?.[0]); e.target.value = '' }} />
      </div>
    </>
  )
}
