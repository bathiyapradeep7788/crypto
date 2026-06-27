'use client'
import { useState, useEffect, useCallback } from 'react'
import TabBar from '@/components/layout/TabBar'
import { getJSON } from '@/lib/api'

interface Deploy { id: string; name: string; url: string; state: string; created: number }

export default function VercelLogsPage() {
  const [deploys, setDeploys]       = useState<Deploy[]>([])
  const [selected, setSelected]     = useState<string>('')
  const [logs, setLogs]             = useState<any[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const loadDeploys = useCallback(async () => {
    try {
      const d = await getJSON<{ deployments: Deploy[]; error?: string }>('/vercel/deployments')
      if (d.error) { setError(d.error); return }
      setError(null)
      setDeploys(d.deployments ?? [])
      if (d.deployments?.length > 0 && !selected) setSelected(d.deployments[0].id)
    } catch (e: any) { setError(e.message) }
  }, [selected])

  const loadLogs = useCallback(async (id: string) => {
    if (!id) return
    setLoading(true)
    try {
      const d = await getJSON<{ logs: any[]; error?: string }>(`/vercel/logs/${id}`)
      if (d.error) { setError(d.error); setLogs([]) }
      else { setLogs(d.logs ?? []); setError(null) }
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { loadDeploys() }, [])
  useEffect(() => { if (selected) loadLogs(selected) }, [selected, loadLogs])
  useEffect(() => {
    if (!autoRefresh || !selected) return
    const t = setInterval(() => loadLogs(selected), 5000)
    return () => clearInterval(t)
  }, [autoRefresh, selected, loadLogs])

  const stateColor = (s: string) => {
    if (s === 'READY') return 'text-green-400 bg-green-900/30'
    if (s === 'ERROR' || s === 'CANCELED') return 'text-red-400 bg-red-900/30'
    if (s === 'BUILDING' || s === 'QUEUED') return 'text-yellow-400 bg-yellow-900/30 animate-pulse'
    return 'text-gray-400 bg-gray-800'
  }
  const lineColor = (log: any) => {
    const t = JSON.stringify(log).toLowerCase()
    if (t.includes('error')) return 'text-red-400'
    if (t.includes('warn')) return 'text-yellow-400'
    return 'text-gray-300'
  }

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Vercel Logs</h1>
            <p className="text-xs text-gray-500 mt-0.5">Deployments and build/runtime logs from Vercel</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-brand" />
              Auto-refresh (5s)
            </label>
            <button onClick={() => { loadDeploys(); if (selected) loadLogs(selected) }}
              className="text-xs px-3 py-1.5 bg-surface-card border border-surface-border rounded text-gray-400 hover:text-white transition-colors">
              ↻ Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400 mb-4">
            {error.includes('VERCEL_TOKEN')
              ? <span>⚠ Vercel token not set. Add <code className="bg-red-900/40 px-1 rounded">VERCEL_TOKEN</code> in the backend environment.</span>
              : error}
          </div>
        )}

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-4 space-y-3">
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Deployments</h3>
              {deploys.length === 0 ? (
                <p className="text-xs text-gray-600">No deployments found</p>
              ) : (
                <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                  {deploys.map(d => (
                    <button key={d.id} onClick={() => setSelected(d.id)}
                      className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${selected === d.id ? 'bg-brand/20 border border-brand/40 text-brand' : 'bg-surface border border-surface-border text-gray-400 hover:text-white'}`}>
                      <div className="flex items-center justify-between">
                        <p className="font-semibold truncate">{d.name}</p>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${stateColor(d.state)}`}>{d.state}</span>
                      </div>
                      <p className="text-gray-600 mt-0.5 truncate">{d.url}</p>
                      <p className="text-gray-600">{d.created ? new Date(d.created).toLocaleString() : ''}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="col-span-8">
            <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-surface-border flex items-center justify-between">
                <span className="text-xs text-gray-500">{logs.length} log lines</span>
                {loading && <span className="text-xs text-brand animate-pulse">Loading…</span>}
              </div>
              <div className="overflow-y-auto max-h-[70vh] font-mono text-xs p-4 space-y-0.5 bg-black/30">
                {logs.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">{selected ? 'No logs available' : 'Select a deployment'}</p>
                ) : (
                  logs.map((log, i) => {
                    const msg = typeof log === 'string' ? log : (log.message ?? JSON.stringify(log))
                    const ts = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''
                    return (
                      <div key={i} className={`flex gap-3 hover:bg-white/5 px-1 rounded ${lineColor(log)}`}>
                        {ts && <span className="text-gray-600 shrink-0 w-20">{ts}</span>}
                        <span className="break-all whitespace-pre-wrap">{msg}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
