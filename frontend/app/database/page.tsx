'use client'
import { useState, useEffect, useCallback } from 'react'
import TabBar from '@/components/layout/TabBar'
import { getJSON } from '@/lib/api'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const TABLES = [
  { id: 'backtest_results', label: 'Backtest Results', color: 'text-brand' },
  { id: 'paper_trades',     label: 'Paper Trades',     color: 'text-green-400' },
  { id: 'live_trades',      label: 'Live Trades',       color: 'text-red-400' },
]

const COL_LABELS: Record<string, string> = {
  id: 'ID', coin: 'Coin', strategy: 'Strategy', direction: 'Dir',
  signal_date_time: 'Signal Time', entry: 'Entry', entry_price: 'Entry',
  tp: 'TP1', tp2: 'TP2', sl: 'SL', end_time: 'End Time',
  end_position: 'Result', win_loss_rate: 'W/L', profit_rate: 'PnL%',
  profit_pct: 'PnL%', profit_usdt: 'PnL$', exit_price: 'Exit',
  exit_reason: 'Reason', ai_confidence: 'AI%', ai_analysis: 'AI Analysis',
  opened_at: 'Opened', closed_at: 'Closed', created_at: 'Created',
  session_id: 'Session', quantity: 'Qty',
}

const HIDDEN = new Set(['complete_calculation', 'entry_order_id', 'exit_order_id'])

function fmt(key: string, val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if ((key.endsWith('_at') || key.endsWith('_time')) && typeof val === 'string')
    return new Date(val).toLocaleString()
  if (typeof val === 'number' && (key.includes('pct') || key === 'profit_rate'))
    return `${val >= 0 ? '+' : ''}${val}%`
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 40) + '…'
  return String(val)
}

export default function DatabasePage() {
  const [activeTable, setActiveTable] = useState('backtest_results')
  const [rows,  setRows]  = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading]   = useState(false)
  const [page,    setPage]      = useState(0)
  const [confirm, setConfirm]   = useState<string | null>(null)
  const limit = 50

  const loadStats = useCallback(async () => {
    try {
      setStats(await getJSON('/database/stats'))
    } catch {}
  }, [])

  const loadRows = useCallback(async (table: string, pg: number) => {
    setLoading(true)
    try {
      const d = await getJSON<{ rows: any[]; total: number }>(`/database/rows/${table}?limit=${limit}&offset=${pg * limit}`)
      setRows(d.rows ?? [])
      setTotal(d.total ?? 0)
    } catch { setRows([]) }
    setLoading(false)
  }, [])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { setPage(0); loadRows(activeTable, 0) }, [activeTable, loadRows])

  const deleteRow = async (id: string) => {
    await fetch(`${BASE}/database/rows/${activeTable}/${id}`, { method: 'DELETE' })
    loadRows(activeTable, page)
    loadStats()
  }

  const clearTable = async () => {
    await fetch(`${BASE}/database/rows/${activeTable}`, { method: 'DELETE' })
    setRows([]); setTotal(0); loadStats(); setConfirm(null)
  }

  const cols = rows.length > 0
    ? Object.keys(rows[0]).filter(k => !HIDDEN.has(k))
    : []

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Database Viewer</h1>
            <p className="text-xs text-gray-500 mt-0.5">View, filter and delete records from Supabase</p>
          </div>
          <button
            onClick={() => loadRows(activeTable, page)}
            className="text-xs px-3 py-1.5 bg-surface-card border border-surface-border rounded text-gray-400 hover:text-white transition-colors"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Table selector + stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {TABLES.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTable(t.id)}
              className={`bg-surface-card border rounded-lg p-4 text-left transition-all ${
                activeTable === t.id
                  ? 'border-brand shadow-lg shadow-brand/10'
                  : 'border-surface-border hover:border-gray-500'
              }`}
            >
              <p className={`text-sm font-semibold ${t.color}`}>{t.label}</p>
              <p className="text-2xl font-bold text-white mt-1">{stats[t.id] ?? '…'}</p>
              <p className="text-xs text-gray-500 mt-0.5">records</p>
            </button>
          ))}
        </div>

        {/* Table actions */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-400">
            Showing <span className="text-white font-semibold">{rows.length}</span> of <span className="text-white font-semibold">{total}</span> records
          </p>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => { const p = page - 1; setPage(p); loadRows(activeTable, p) }}
              className="text-xs px-3 py-1.5 bg-surface-card border border-surface-border rounded text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              ← Prev
            </button>
            <span className="text-xs text-gray-500 px-2 py-1.5">Page {page + 1} / {Math.ceil(total / limit) || 1}</span>
            <button
              disabled={(page + 1) * limit >= total}
              onClick={() => { const p = page + 1; setPage(p); loadRows(activeTable, p) }}
              className="text-xs px-3 py-1.5 bg-surface-card border border-surface-border rounded text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
            <button
              onClick={() => setConfirm(activeTable)}
              className="text-xs px-3 py-1.5 bg-red-900/30 border border-red-800/50 rounded text-red-400 hover:bg-red-900/50 transition-colors"
            >
              🗑 Clear Table
            </button>
          </div>
        </div>

        {/* Data table */}
        <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No records found</div>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-card border-b border-surface-border z-10">
                  <tr className="text-gray-500 text-left">
                    {cols.map(c => (
                      <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">
                        {COL_LABELS[c] ?? c}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id ?? i} className="border-b border-surface-border hover:bg-surface-hover transition-colors">
                      {cols.map(c => (
                        <td key={c} className={`px-3 py-2 whitespace-nowrap ${
                          c === 'coin' ? 'text-blue-400 font-mono font-semibold' :
                          c === 'win_loss_rate' ? (row[c] === 'Win' ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold') :
                          c === 'direction' ? (row[c] === 'long' ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold') :
                          (c === 'profit_rate' || c === 'profit_pct') ? (parseFloat(row[c]) >= 0 ? 'text-green-400 font-mono font-semibold' : 'text-red-400 font-mono font-semibold') :
                          c === 'id' ? 'text-gray-600 font-mono text-xs' :
                          'text-gray-300'
                        }`}>
                          {fmt(c, row[c])}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <button
                          onClick={() => deleteRow(row.id)}
                          className="text-red-500 hover:text-red-300 transition-colors px-2 py-0.5 rounded hover:bg-red-900/30"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Confirm clear modal */}
      {confirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-surface-card border border-red-800 rounded-xl p-6 w-80 shadow-2xl">
            <p className="text-white font-semibold mb-2">Clear entire table?</p>
            <p className="text-gray-400 text-sm mb-4">This will permanently delete ALL records in <span className="text-red-400">{confirm}</span>. Cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 py-2 rounded bg-surface-border text-gray-300 hover:bg-gray-700 transition-colors text-sm">Cancel</button>
              <button onClick={clearTable} className="flex-1 py-2 rounded bg-red-600 hover:bg-red-700 text-white transition-colors text-sm font-semibold">Yes, Delete All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
