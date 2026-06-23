'use client'
import { useState, useEffect, useCallback } from 'react'
import TabBar from '@/components/layout/TabBar'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Service { id: string; name: string; status: string }
interface Deploy { id: string; status: string; createdAt: string; finishedAt?: string }

export default function RenderLogsPage() {
  const [services,       setServices]       = useState<Service[]>([])
  const [selectedSvc,    setSelectedSvc]    = useState<string>('')
  const [logs,           setLogs]           = useState<any[]>([])
  const [deploys,        setDeploys]        = useState<Deploy[]>([])
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [activeTab,      setActiveTab]      = useState<'logs' | 'deploys'>('logs')
  const [autoRefresh,    setAutoRefresh]    = useState(false)
  const [logLimit,       setLogLimit]       = useState(100)

  const loadServices = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/render/services`)
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      setServices(d.services ?? [])
      if (d.services?.length > 0 && !selectedSvc) setSelectedSvc(d.services[0].id)
    } catch (e: any) { setError(e.message) }
  }, [selectedSvc])

  const loadLogs = useCallback(async () => {
    if (!selectedSvc) return
    setLoading(true)
    try {
      const r = await fetch(`${BASE}/render/logs/${selectedSvc}?limit=${logLimit}`)
      const d = await r.json()
      if (d.error) { setError(d.error); setLogs([]) }
      else { setLogs(d.logs ?? d ?? []); setError(null) }
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }, [selectedSvc, logLimit])

  const loadDeploys = useCallback(async () => {
    if (!selectedSvc) return
    try {
      const r = await fetch(`${BASE}/render/deploys/${selectedSvc}`)
      const d = await r.json()
      setDeploys(d.deploys ?? d ?? [])
    } catch {}
  }, [selectedSvc])

  useEffect(() => { loadServices() }, [])
  useEffect(() => { if (selectedSvc) { loadLogs(); loadDeploys() } }, [selectedSvc])

  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => { loadLogs() }, 5000)
    return () => clearInterval(t)
  }, [autoRefresh, loadLogs])

  const levelColor = (log: any) => {
    const text = JSON.stringify(log).toLowerCase()
    if (text.includes('error') || text.includes('critical')) return 'text-red-400'
    if (text.includes('warn')) return 'text-yellow-400'
    return 'text-gray-300'
  }

  const deployStatusColor = (status: string) => {
    if (status === 'live') return 'text-green-400 bg-green-900/30'
    if (status === 'failed' || status === 'canceled') return 'text-red-400 bg-red-900/30'
    if (status === 'build_in_progress' || status === 'update_in_progress') return 'text-yellow-400 bg-yellow-900/30 animate-pulse'
    return 'text-gray-400 bg-gray-800'
  }

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Render Logs</h1>
            <p className="text-xs text-gray-500 mt-0.5">Live backend logs and deploy history from Render</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-brand" />
              Auto-refresh (5s)
            </label>
            <button onClick={() => { loadLogs(); loadDeploys() }}
              className="text-xs px-3 py-1.5 bg-surface-card border border-surface-border rounded text-gray-400 hover:text-white transition-colors">
              ↻ Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400 mb-4">
            {error.includes('RENDER_API_KEY') ? (
              <span>⚠ Render API key not set. Add <code className="bg-red-900/40 px-1 rounded">RENDER_API_KEY</code> to your environment variables on Render dashboard.</span>
            ) : error}
          </div>
        )}

        <div className="grid grid-cols-12 gap-4">
          {/* Service selector */}
          <div className="col-span-3 space-y-3">
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Services</h3>
              {services.length === 0 ? (
                <p className="text-xs text-gray-600">No services found</p>
              ) : (
                <div className="space-y-2">
                  {services.map(s => (
                    <button key={s.id} onClick={() => setSelectedSvc(s.id)}
                      className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${selectedSvc === s.id ? 'bg-brand/20 border border-brand/40 text-brand' : 'bg-surface border border-surface-border text-gray-400 hover:text-white'}`}>
                      <p className="font-semibold truncate">{s.name}</p>
                      <p className="text-gray-600 mt-0.5">{s.id.slice(0, 12)}…</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <h3 className="text-xs font-semibold text-gray-400 mb-2">Log limit</h3>
              <select value={logLimit} onChange={e => setLogLimit(parseInt(e.target.value))}
                className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-white focus:outline-none">
                <option value={50}>50 lines</option>
                <option value={100}>100 lines</option>
                <option value={200}>200 lines</option>
                <option value={500}>500 lines</option>
              </select>
            </div>
          </div>

          {/* Logs / Deploys panel */}
          <div className="col-span-9">
            <div className="flex gap-1 mb-3">
              {(['logs', 'deploys'] as const).map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`px-4 py-2 text-xs font-medium rounded-t transition-colors ${activeTab === t ? 'bg-surface-card border border-b-0 border-surface-border text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  {t === 'logs' ? '📋 Logs' : '🚀 Deploys'}
                </button>
              ))}
            </div>

            {activeTab === 'logs' && (
              <div className="bg-surface-card border border-surface-border rounded-lg rounded-tl-none overflow-hidden">
                <div className="px-4 py-2 border-b border-surface-border flex items-center justify-between">
                  <span className="text-xs text-gray-500">{logs.length} entries</span>
                  {loading && <span className="text-xs text-brand animate-pulse">Loading...</span>}
                </div>
                <div className="overflow-y-auto max-h-[65vh] font-mono text-xs p-4 space-y-0.5 bg-black/30">
                  {logs.length === 0 ? (
                    <p className="text-gray-600 text-center py-8">
                      {selectedSvc ? 'No logs available' : 'Select a service to view logs'}
                    </p>
                  ) : (
                    logs.map((log, i) => {
                      const msg = typeof log === 'string' ? log : (log.message ?? log.text ?? JSON.stringify(log))
                      const ts  = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''
                      return (
                        <div key={i} className={`flex gap-3 hover:bg-white/5 px-1 rounded ${levelColor(log)}`}>
                          {ts && <span className="text-gray-600 shrink-0 w-20">{ts}</span>}
                          <span className="break-all">{msg}</span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {activeTab === 'deploys' && (
              <div className="bg-surface-card border border-surface-border rounded-lg rounded-tl-none overflow-hidden">
                {deploys.length === 0 ? (
                  <div className="text-center py-12 text-gray-600 text-sm">No deploys found</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="border-b border-surface-border">
                      <tr className="text-gray-500 text-left">
                        {['Deploy ID', 'Status', 'Started', 'Finished'].map(h => (
                          <th key={h} className="px-4 py-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {deploys.map((d: any, i) => {
                        const dep = d.deploy ?? d
                        return (
                          <tr key={i} className="border-b border-surface-border hover:bg-surface-hover">
                            <td className="px-4 py-2 font-mono text-gray-400">{dep.id?.slice(0, 14)}…</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${deployStatusColor(dep.status)}`}>
                                {dep.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-400">{dep.createdAt ? new Date(dep.createdAt).toLocaleString() : '—'}</td>
                            <td className="px-4 py-2 text-gray-400">{dep.finishedAt ? new Date(dep.finishedAt).toLocaleString() : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
