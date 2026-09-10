import { useEffect, useRef, useState } from 'react'
import { useEscapeKey } from '@/hooks/useEscapeKey'

/** 미리보기 네모의 한 변(px). 내보내는 그림도 같은 크기라 셈이 하나로 끝난다 */
const VIEW = 256
const MIN_ZOOM = 1
const MAX_ZOOM = 3

/**
 * 프로필 사진 자르기 — 고른 그림을 동그라미에 맞춰 밀고 키운 뒤 확인한다.
 *
 * 예전에는 고르는 즉시 가운데를 잘라 올렸다. 얼굴이 가운데 없는 사진은 목이 잘렸고,
 * 마음에 안 들면 다시 고르는 수밖에 없었다 — 어떻게 잘릴지 보이지도 않았다.
 *
 * 셈은 하나뿐이다: baseScale(짧은 변이 네모를 꽉 채우는 배율) × zoom.
 * 밀 수 있는 범위는 그림이 네모를 늘 덮도록 잠근다 — 흰 여백이 생길 자리를 아예 안 만든다.
 */
export function AvatarCropModal({ file, onCancel, onDone }: {
  file: File
  onCancel: () => void
  /** 자른 결과(256px webp). 올리는 건 부르는 쪽이 한다 */
  onDone: (cropped: File) => void
}) {
  const [url, setUrl] = useState<string>('')
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  useEscapeKey(true, onCancel)

  // object URL 은 창을 닫을 때 반드시 돌려준다 — 안 그러면 고를 때마다 메모리에 쌓인다
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const base = nat ? VIEW / Math.min(nat.w, nat.h) : 1
  const eff = base * zoom
  const dw = nat ? nat.w * eff : 0
  const dh = nat ? nat.h * eff : 0

  /** 그림이 네모를 늘 덮도록 — 왼쪽 위는 0 이하, 오른쪽 아래는 VIEW 이상 */
  const clamp = (x: number, y: number) => ({
    x: Math.min(0, Math.max(VIEW - dw, x)),
    y: Math.min(0, Math.max(VIEW - dh, y)),
  })

  // 그림이 실리거나 배율이 바뀌면 가운데를 유지한 채 다시 잠근다
  useEffect(() => {
    if (!nat) return
    setOff(prev => {
      const cx = (VIEW / 2 - prev.x) / (dw || 1)
      const cy = (VIEW / 2 - prev.y) / (dh || 1)
      return {
        x: Math.min(0, Math.max(VIEW - dw, VIEW / 2 - cx * dw)),
        y: Math.min(0, Math.max(VIEW - dh, VIEW / 2 - cy * dh)),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, nat])

  const onLoad = () => {
    const el = imgRef.current
    if (!el) return
    const w = el.naturalWidth, h = el.naturalHeight
    setNat({ w, h })
    // 처음엔 가운데
    const b = VIEW / Math.min(w, h)
    setOff({ x: (VIEW - w * b) / 2, y: (VIEW - h * b) / 2 })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    setOff(clamp(d.ox + (e.clientX - d.x), d.oy + (e.clientY - d.y)))
  }
  const onPointerUp = () => { drag.current = null }

  /** 보이는 그대로 256px webp 로 굽는다 — 미리보기와 결과가 어긋나면 자르기의 뜻이 없다 */
  const confirm = async () => {
    if (!nat || busy) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = VIEW; canvas.height = VIEW
      const ctx = canvas.getContext('2d')
      if (!ctx || !imgRef.current) { onDone(file); return }
      // 화면에서 보이는 네모를 원본 좌표로 되돌린다
      ctx.drawImage(imgRef.current, -off.x / eff, -off.y / eff, VIEW / eff, VIEW / eff, 0, 0, VIEW, VIEW)
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', 0.9))
      onDone(blob ? new File([blob], 'avatar.webp', { type: 'image/webp' }) : file)
    } catch {
      onDone(file)   // 못 구우면 원본을 올린다 — 아무것도 안 되는 것보단 낫다
    } finally {
      setBusy(false)
    }
  }

  const overlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onCancel() }

  return (
    <div className="modal-overlay show" onClick={overlayClick}>
      <div className="modal crop-modal">
        <button className="modal-close" onClick={onCancel} aria-label="닫기">✕</button>
        <h3>프로필 사진</h3>
        <p className="taste-modal-sub">밀어서 자리를 잡고, 아래 막대로 크기를 맞춰주세요.</p>

        {/* 네모 안에서 자르지만 동그라미로 보여준다 — 결과가 동그라미라서 */}
        <div
          className="crop-view"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {url && (
            <img
              ref={imgRef} src={url} alt="" onLoad={onLoad} draggable={false}
              style={{ width: dw || VIEW, height: dh || VIEW, left: off.x, top: off.y }}
            />
          )}
          <div className="crop-ring" aria-hidden />
        </div>

        <label className="crop-zoom">
          <span>크기</span>
          <input
            type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01}
            value={zoom} onChange={e => setZoom(Number(e.target.value))}
          />
        </label>

        <div className="write-actions">
          <button className="btn btn-secondary" onClick={onCancel}>취소</button>
          <button className="btn btn-primary" onClick={confirm} disabled={!nat || busy}>
            {busy ? '처리 중…' : '이 모양으로 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
