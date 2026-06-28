'use client'
import { useState, useCallback, useEffect } from 'react'
import { ToastContext, Toast } from '@/hooks/useErrorToast'

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), 5000)
    return () => clearTimeout(t)
  }, [toast.id, onRemove])

  const bg =
    toast.level === 'error'   ? 'bg-red-900/90 border-red-700 text-red-200' :
    toast.level === 'warning' ? 'bg-yellow-900/90 border-yellow-700 text-yellow-200' :
                                'bg-surface-card border-surface-border text-gray-200'

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm max-w-sm ${bg}`}>
      <span className="mt-0.5 shrink-0">
        {toast.level === 'error' ? '✕' : toast.level === 'warning' ? '⚠' : 'ℹ'}
      </span>
      <span className="flex-1 break-words">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity leading-none"
      >
        ×
      </button>
    </div>
  )
}

export function ErrorToastContainer({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((message: string, level: 'error' | 'warning' | 'info' = 'error') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev, { id, message, level }])
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem toast={t} onRemove={removeToast} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
