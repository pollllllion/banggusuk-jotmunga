import { useEffect, useRef } from 'react'
import { create } from 'zustand'

interface ToastState {
  message: string
  visible: boolean
  show: (msg: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  message: '',
  visible: false,
  show: (msg) => {
    set({ message: msg, visible: true })
    setTimeout(() => set({ visible: false }), 2500)
  },
}))

export function Toast() {
  const { message, visible } = useToastStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.className = visible ? 'toast show' : 'toast'
    }
  }, [visible])

  return <div ref={ref} className="toast">{message}</div>
}
