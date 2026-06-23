'use client'
import { useEffect } from 'react'
import { useBacktestCtx } from '@/context/BacktestContext'

// Global completion popup — shows on whatever tab you're on when a backtest
// finishes, since the run lives in the provider, not a single page.
export default function Toast() {
  const { notification, dismiss, status, progress } = useBacktestCtx()

  useEffect(() => {
    if (notification) {
      const t = setTimeout(dismiss, 8000)
      return () => clearTimeout(t)
    }
  }, [notification, dismiss])

  return (
    <>
      {/* Running indicator (any tab) */}
      {status === 'running' && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-surface-card border border-brand/40 rounded-lg px-4 py-2.5 shadow-xl text-sm text-brand">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Backtest running… {progress.processed}/{progress.total} strategies
        </div>
      )}

      {/* Completion popup */}
      {notification && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-start gap-3 rounded-lg px-4 py-3 shadow-2xl max-w-sm border ${
            notification.kind === 'success'
              ? 'bg-green-900/40 border-green-700 text-green-200'
              : 'bg-red-900/40 border-red-700 text-red-200'
          }`}
        >
          <span className="text-sm flex-1">{notification.text}</span>
          <button onClick={dismiss} className="text-current opacity-60 hover:opacity-100 text-sm">✕</button>
        </div>
      )}
    </>
  )
}
