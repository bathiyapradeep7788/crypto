'use client'
import { createContext, useContext } from 'react'

export interface Toast {
  id: string
  message: string
  level: 'error' | 'warning' | 'info'
}

export interface ToastContextValue {
  toasts: Toast[]
  addToast: (message: string, level?: 'error' | 'warning' | 'info') => void
  removeToast: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
})

export function useErrorToast() {
  return useContext(ToastContext)
}
