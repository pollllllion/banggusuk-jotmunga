import { create } from 'zustand'

type ReportTarget = 'review' | 'comment' | 'content'

interface ReportModalState {
  open: boolean
  targetType: ReportTarget
  targetId: string
}

interface UIState {
  userMenuOpen: boolean
  reportModal: ReportModalState

  toggleUserMenu: () => void
  closeUserMenu: () => void
  openReportModal: (targetType: ReportTarget, targetId: string) => void
  closeReportModal: () => void
}

export const useUIStore = create<UIState>((set) => ({
  userMenuOpen: false,
  reportModal: { open: false, targetType: 'review', targetId: '' },

  toggleUserMenu: () => set(s => ({ userMenuOpen: !s.userMenuOpen })),
  closeUserMenu: () => set({ userMenuOpen: false }),
  openReportModal: (targetType, targetId) => set({ reportModal: { open: true, targetType, targetId } }),
  closeReportModal: () => set(s => ({ reportModal: { ...s.reportModal, open: false } })),
}))
