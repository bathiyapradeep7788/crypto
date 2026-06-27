'use client'
import { useEffect, useState, useRef } from 'react'
import TabBar    from '@/components/layout/TabBar'
import { useLogStream } from '@/hooks/useLogStream'

export default function LogsPage() {
  const { logs, clear } = useLogStream()
  const [filter, setFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO'>('ALL')
  const [showToast, setShowToast] = useState(false)
  const [toastMsg, setToastMsg]   = useState('')
  const prevErrorCount = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  const errorCount = logs.filter(l => l.level === 'ERROR').length
  const warnCount  = logs.filter(l => l.level === 'WARN').length

  // Toast on new errors
  useEffect(() => {
    if (errorCount > prevErrorCount.current) {
      const latest = logs.filter(l => l.level === 'ERROR').at(-1)
      setToastMsg(latest?.message ?? 'New error in system log')
      setShowToast(true)
      setTimeout(() => setShowToast(false), 5000)
    }
    prevErrorCount.current = errorCount
  }, [errorCount, logs])

  // Auto-scroll to bottom
  useEffect(() => {
    if (filter === 'ALL') bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length, filter])

  const filtered = filter === 'ALL' ? logs : logs.filter(l => l.level === filter)

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">

        {/* Error toast */}
        {showToast && (
          <div className="fixed top-4 right-4 z-50 flex items-start gap-3 bg-red-900/90 border border-red-700 rounded-xl px-4 py-3 shadow-2xl max-w-sm animate-fade-in">
            <span className="text-red-300 text-lg">🚨</span>
            <div className="flex-1">
              <p className="text-red-300 font-semibold text-sm">System Error</p>
              <p className="text-red-400 text-xs mt-0.5 line-clamp-2">{toastMsg}</p>
            </div>
            <button onClick={() => setShowToast(false)} className="text-red-500 hover:text-red-300 text-lg leading-none">×</button>
          </div>
        )}

        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-3">
              System Log
              {errorCount > 0 && (
                <span className="text-xs bg-red-900/60 border border-red-700 text-red-400 px-2 py-0.5 rounded-full font-semibold animate-pulse">
                  🚨 {errorCount} error{errorCount > 1 ? 's' : ''}
                </span>
              )}
              {warnCount > 0 && (
                <span className="text-xs bg-yellow-900/40 border border-yellow-700/50 text-yellow-400 px-2 py-0.5 rounded-full font-semibold">
                  ⚠ {warnCount} warn{warnCount > 1 ? 's' : ''}
                </span>
              )}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Real-time stream — strategy events, AI decisions, errors</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-gray-500 bg-surface-card border border-surface-border rounded-lg px-3 py-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Live</span>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-3">
          {(['ALL', 'ERROR', 'WARN', 'INFO'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f
                  ? f === 'ERROR' ? 'bg-red-700 text-white'
                  : f === 'WARN'  ? 'bg-yellow-700 text-white'
                  : 'bg-brand text-black'
                  : 'bg-surface-card border border-surface-border text-gray-400 hover:text-white'
              }`}>
              {f}
              {f === 'ERROR' && errorCount > 0 && <span className="ml-1 bg-red-900 rounded-full px-1">{errorCount}</span>}
              {f === 'WARN'  && warnCount  > 0 && <span className="ml-1 bg-yellow-900 rounded-full px-1">{warnCount}</span>}
            </button>
          ))}
          <button onClick={clear} className="ml-auto text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg transition-colors">
            Clear
          </button>
        </div>

        {/* Log panel */}
        <div className="bg-surface-card border border-surface-border rounded-xl h-[calc(100vh-260px)] overflow-y-auto p-3 font-mono text-xs space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-gray-600 text-center mt-12">
              {filter === 'ALL' ? 'Waiting for log events…' : `No ${filter} logs`}
            </p>
          ) : (
            filtered.map((log, i) => (
              <div key={i} className={`flex gap-3 px-2 py-0.5 rounded transition-colors ${
                log.level === 'ERROR' ? 'bg-red-900/10 hover:bg-red-900/20' :
                log.level === 'WARN'  ? 'bg-yellow-900/5 hover:bg-yellow-900/15' :
                'hover:bg-surface-hover'
              }`}>
                <span className="text-gray-600 shrink-0 w-20">{new Date(log.ts).toLocaleTimeString()}</span>
                <span className={`shrink-0 w-12 font-bold ${
                  log.level === 'ERROR' ? 'text-red-400' :
                  log.level === 'WARN'  ? 'text-yellow-400' :
                                          'text-blue-400'
                }`}>{log.level}</span>
                <span className={`${log.level === 'ERROR' ? 'text-red-300' : log.level === 'WARN' ? 'text-yellow-300' : 'text-gray-300'}`}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Stats footer */}
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
          <span>{logs.length} total entries</span>
          <span className="text-red-500">{errorCount} errors</span>
          <span className="text-yellow-500">{warnCount} warnings</span>
          <span className="text-blue-500">{logs.filter(l => l.level === 'INFO').length} info</span>
        </div>
      </main>
    </div>
  )
}
