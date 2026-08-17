import { create } from 'zustand'

type ReportTarget = 'review' | 'comment' | 'content' | 'discussion' | 'discussion_comment'

interface ReportModalState {
  open: boolean
  targetType: ReportTarget
  targetId: string
}

interface UIState {
  userMenuOpen: boolean
  /** 모바일 햄버거 서랍 (사이드바 게시판 목록) */
  navDrawerOpen: boolean
  reportModal: ReportModalState

  toggleUserMenu: () => void
  closeUserMenu: () => void
  toggleNavDrawer: () => void
  closeNavDrawer: () => void
  openReportModal: (targetType: ReportTarget, targetId: string) => void
  closeReportModal: () => void
}

export const useUIStore = create<UIState>((set) => ({
  userMenuOpen: false,
  navDrawerOpen: false,
  reportModal: { open: false, targetType: 'review', targetId: '' },

  toggleUserMenu: () => set(s => ({ userMenuOpen: !s.userMenuOpen })),
  closeUserMenu: () => set({ userMenuOpen: false }),
  toggleNavDrawer: () => set(s => ({ navDrawerOpen: !s.navDrawerOpen })),
  closeNavDrawer: () => set({ navDrawerOpen: false }),
  openReportModal: (targetType, targetId) => set({ reportModal: { open: true, targetType, targetId } }),
  closeReportModal: () => set(s => ({ reportModal: { ...s.reportModal, open: false } })),
}))
