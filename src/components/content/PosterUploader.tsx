import { useRef, useState } from 'react'
import { useToastStore } from '@/components/ui/Toast'
import { posterToDataUrl } from '@/utils/posterImage'

/**
 * 포스터 이미지 입력 — 붙여넣기(Ctrl+V) · 드래그&드롭 · 파일 선택 · URL 직접입력 모두 지원.
 * 이미지는 축소·압축한 base64 data URL 로 만들어 value(posterUrl) 에 그대로 담는다.
 */
export function PosterUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const toast = useToastStore(s => s.show)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('이미지 파일만 올릴 수 있어요.'); return }
    setBusy(true)
    try {
      const dataUrl = await posterToDataUrl(file)
      onChange(dataUrl)
      toast('포스터 이미지 적용됨!')
    } catch (e: any) {
      toast(e?.message || '이미지 처리에 실패했어요.')
    } finally {
      setBusy(false)
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (item) { e.preventDefault(); handleFile(item.getAsFile()) }
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFile(e.dataTransfer.files?.[0])
  }

  return (
    <div className="form-group">
      <label>포스터 이미지 (선택)</label>
      <div
        className="poster-uploader"
        tabIndex={0}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        title="여기를 클릭한 뒤 Ctrl+V 로 붙여넣거나, 이미지를 끌어다 놓으세요"
      >
        {value
          ? <img src={value} alt="포스터 미리보기" className="poster-uploader-preview" />
          : <div className="poster-uploader-empty">{busy ? '처리 중…' : '여기 클릭 후 Ctrl+V 붙여넣기 · 드래그&드롭'}</div>}
        {value && busy && <div className="poster-uploader-badge">처리 중…</div>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
        <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => fileRef.current?.click()}>
          파일 선택
        </button>
        <input className="form-input" style={{ flex: 1, marginBottom: 0 }} value={value}
          onChange={e => onChange(e.target.value)} placeholder="또는 이미지 URL 직접 입력 (https://...)" />
        {value && <button type="button" className="btn btn-secondary btn-small" onClick={() => onChange('')}>지우기</button>}
      </div>
    </div>
  )
}
