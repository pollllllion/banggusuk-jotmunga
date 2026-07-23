import { useState } from 'react'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { PosterUploader } from '@/components/content/PosterUploader'
import type { Content } from '@/types'

/**
 * 내 피드에서 내가 등록한 작품 정보 수정 (포스터 잘못 올린 것 고치기 등).
 * 서버 RPC update_my_content 로 본인이 만든 작품만 수정된다.
 */
export function EditContentModal({ content, onClose, onSaved }: {
  content: Content
  onClose: () => void
  onSaved: (c: Content) => void
}) {
  const toast = useToastStore(s => s.show)
  const [title, setTitle] = useState(content.title)
  const [platform, setPlatform] = useState(content.platform ?? '')
  const [posterUrl, setPosterUrl] = useState(content.posterUrl ?? '')
  const [releaseYear, setReleaseYear] = useState<string>(content.releaseYear ? String(content.releaseYear) : '')
  const [saving, setSaving] = useState(false)

  const overlayClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose() }

  const save = async () => {
    if (!title.trim()) { toast('제목을 입력해주세요.'); return }
    let year: number | null = null
    if (releaseYear.trim()) {
      const n = Number(releaseYear.trim())
      if (!Number.isInteger(n) || n < 1900 || n > new Date().getFullYear() + 5) {
        toast('개봉/공개 연도를 숫자로 입력해주세요 (예: 2023)'); return
      }
      year = n
    }
    setSaving(true)
    try {
      const updated = await DS.updateMyContent({
        contentId: content.id,
        title: title.trim(),
        posterUrl: posterUrl.trim() || null,
        platform: platform.trim() || null,
        releaseYear: year,
      })
      toast('작품 정보를 수정했어요.')
      onSaved(updated)
      onClose()
    } catch (e: any) {
      toast(e?.message || '수정에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay show" onClick={overlayClick}>
      <div className="modal" style={{ maxWidth: 460, width: '92vw' }}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>✏️ 작품 정보 수정</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input className="form-input" placeholder="제목 *" value={title} onChange={e => setTitle(e.target.value)} />
          <input className="form-input" placeholder="플랫폼 (예: 네이버웹툰, 카카오페이지) — 선택" value={platform} onChange={e => setPlatform(e.target.value)} />
          <input className="form-input" placeholder="개봉/공개 연도 (예: 2023) — 선택" value={releaseYear} onChange={e => setReleaseYear(e.target.value)} inputMode="numeric" />
          <PosterUploader value={posterUrl} onChange={setPosterUrl} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={save} disabled={saving || !title.trim()}>
            {saving ? '저장중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
