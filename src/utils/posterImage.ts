/**
 * 포스터 이미지 → base64 데이터 URL.
 * 브라우저 canvas 로 가로 최대폭까지 축소·JPEG 압축한 뒤 data: URL 문자열을 돌려준다.
 * 외부 저장소(버킷/정책) 없이 posterUrl 에 그대로 담아 쓴다. 수기 큐레이션 소량이라 부담 적음.
 * (원본을 그대로 넣으면 문자열이 커져 DB·로딩이 무거워지므로 항상 축소한다.)
 */
const MAX_WIDTH = 360 // 포스터는 작게 표시되므로 360px 로 충분 (데이터 URL 용량 억제)

/** 이미지 File → 가로 MAX_WIDTH 이하로 축소한 JPEG data URL */
export function posterToDataUrl(file: File, maxWidth = MAX_WIDTH, quality = 0.72): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('이미지 파일만 올릴 수 있어요.'))
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.min(1, maxWidth / img.width)
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('이미지 변환에 실패했어요.')); return }
      ctx.drawImage(img, 0, 0, w, h)
      try {
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch {
        reject(new Error('이미지 변환에 실패했어요.'))
      }
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('이미지를 읽을 수 없어요.')) }
    img.src = objectUrl
  })
}
