import { useState } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/components/ui/Toast'
import * as DS from '@/api/dataService'
import { REPORT_REASONS } from '@/utils/constants'

const TARGET_LABELS: Record<string, string> = {
  review: '리뷰 신고하기',
  comment: '댓글 신고하기',
  content: '작품 신고하기',
  discussion: '토론글 신고하기',
  discussion_comment: '댓글 신고하기',
}

export function ReportModal() {
  const { reportModal, closeReportModal } = useUIStore()
  const { user } = useAuthStore()
  const toast = useToastStore(s => s.show)
  const [selectedReason, setSelectedReason] = useState<string | null>(null)
  const [detail, setDetail] = useState('')

  const handleSubmit = () => {
    if (!selectedReason || !user) return
    DS.createReport({
      reporterId: user.id,
      targetType: reportModal.targetType,
      targetId: reportModal.targetId,
      reason: selectedReason,
      detail: detail.trim(),
    })
    closeReportModal()
    setSelectedReason(null)
    setDetail('')
    toast('신고가 접수되었습니다.')
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeReportModal()
  }

  return (
    <div className={`modal-overlay ${reportModal.open ? 'show' : ''}`} onClick={handleOverlayClick}>
      <div className="modal" style={{ position: 'relative' }}>
        <div className="modal-close" onClick={closeReportModal}>&times;</div>
        <h3>{TARGET_LABELS[reportModal.targetType]}</h3>
        <p style={{ fontSize: 13, color: 'var(--subtext)', marginBottom: 16 }}>사유를 선택해주세요</p>
        <ul className="report-reasons">
          {REPORT_REASONS.map(r => (
            <li key={r.code} className={selectedReason === r.code ? 'selected' : ''} onClick={() => setSelectedReason(r.code)}>
              <span className="radio" />{r.label}
            </li>
          ))}
        </ul>
        <div className="form-group" style={{ marginTop: 12 }}>
          <textarea className="form-input" placeholder="상세 내용 (선택)" rows={2}
            value={detail} onChange={e => setDetail(e.target.value)}
            style={{ resize: 'none', height: 60, fontSize: 13 }}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={closeReportModal}>취소</button>
          <button className="btn btn-danger-solid" onClick={handleSubmit} disabled={!selectedReason}>신고하기</button>
        </div>
      </div>
    </div>
  )
}
