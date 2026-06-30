'use client'
import { useState, useEffect, useCallback } from 'react'
import TabBar from '@/components/layout/TabBar'
import { listSignals, checkSignal, clearSignals } from '@/lib/api'
import { COIN_LABELS } from '@/lib/constants'

type Signal = {
  id: string
  coin: string
  signal_date: string
  strategy: string
  direction: string
  entry: number
  tp: number
  tp2: number
  sl: number
  outcome: string | null
  profit_pct: number | null
  end_position: string | null
  checked_at: string | null
  created_at: string
}

const DIR_COLOR: Record<string, string> = {
  long:  'text-green-400 bg-green-900/20 border-green-800',
  short: 'text-red-400 bg-red-900/20 border-red-800',
}

export default function DashboardPage() {
  const [signals,     setSignals]     = useState<Signal[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filterCoin,  setFilterCoin]  = useState('')
  const [filterOutcome, setFilterOutcome] = useState('')
  const [checking,    setChecking]    = useState<Set<string>>(new Set())
  const [error,       setError]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listSignals({
        coin:    filterCoin    || undefined,
        outcome: filterOutcome || undefined,
        limit:   300,
      })
      setSignals(data.signals)
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [filterCoin, filterOutcome])

  useEffect(() => { load() }, [load])

  const handleCheck = async (id: string) => {
    setChecking(prev => new Set(prev).add(id))
    try {
      const updated = await checkSignal(id)
      setSignals(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s))
    } catch (e: any) {
      setError(`Check failed: ${e.message}`)
    }
    setChecking(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const handleClear = async () => {
    if (!confirm('Delete ALL signal logs? This cannot be undone.')) return
    await clearSignals()
    setSignals([])
  }

  const wins   = signals.filter(s => s.outcome === 'Win').length
  const losses = signals.filter(s => s.outcome === 'Loss').length
  const total  = signals.length
  const checked = wins + losses
  const wr = checked ? ((wins / checked) * 100).toFixed(1) : '—'

  const uniqueCoins = [...new Set(signals.map(s => s.coin))].sort()

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-white">Signal Log Dashboard</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              All generated signals — 15m timeframe · BTC ETH BNB SOL XRP ADA TRX LINK DOGE XLM
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="text-xs px-4 py-2 bg-surface-card border border-surface-border rounded-lg text-gray-300 hover:text-white transition-colors">
              {loading ? '⟳ Loading…' : '↻ Refresh'}
            </button>
            <button onClick={handleClear}
              className="text-xs px-4 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-red-400 hover:bg-red-900/50 transition-colors">
              🗑 Clear All
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-surface-card border border-surface-border rounded-lg p-4">
            <p className="text-xs text-gray-500">Total Signals</p>
            <p className="text-2xl font-bold text-white mt-1">{total}</p>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-lg p-4">
            <p className="text-xs text-gray-500">Checked</p>
            <p className="text-2xl font-bold text-brand mt-1">{checked}</p>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-lg p-4">
            <p className="text-xs text-gray-500">Win Rate (checked)</p>
            <p className={`text-2xl font-bold mt-1 ${
              checked === 0 ? 'text-gray-500' :
              parseFloat(wr) >= 55 ? 'text-green-400' :
              parseFloat(wr) >= 45 ? 'text-yellow-400' : 'text-red-400'
            }`}>{wr}{checked > 0 ? '%' : ''}</p>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-lg p-4">
            <p className="text-xs text-gray-500">Wins / Losses</p>
            <p className="text-2xl font-bold mt-1">
              <span className="text-green-400">{wins}</span>
              <span className="text-gray-600 mx-1">/</span>
              <span className="text-red-400">{losses}</span>
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <select value={filterCoin} onChange={e => setFilterCoin(e.target.value)}
            className="bg-surface-card border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand">
            <option value="">All Coins</option>
            {uniqueCoins.map(c => (
              <option key={c} value={c}>{COIN_LABELS[c] ?? c.replace('USDT','')}</option>
            ))}
          </select>
          <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)}
            className="bg-surface-card border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand">
            <option value="">All Outcomes</option>
            <option value="null">Unchecked</option>
            <option value="Win">Wins only</option>
            <option value="Loss">Losses only</option>
          </select>
          <span className="text-xs text-gray-600">{signals.length} shown</span>
        </div>

        {error && (
          <div className="mb-4 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {/* Signal list */}
        {loading ? (
          <div className="bg-surface-card border border-surface-border rounded-lg p-8 text-center text-gray-500 text-sm">
            Loading signals…
          </div>
        ) : signals.length === 0 ? (
          <div className="bg-surface-card border border-surface-border rounded-lg p-8 text-center">
            <p className="text-gray-400 text-sm mb-1">No signals logged yet.</p>
            <p className="text-gray-600 text-xs">
              Go to <strong className="text-gray-400">Backtest Bot → Signal Scanner</strong> to scan historical candles.
            </p>
          </div>
        ) : (
          <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500 border-b border-surface-border bg-surface">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">#</th>
                    <th className="px-3 py-2.5 text-left font-medium">Coin</th>
                    <th className="px-3 py-2.5 text-left font-medium">Signal Date</th>
                    <th className="px-3 py-2.5 text-left font-medium">Strategy</th>
                    <th className="px-3 py-2.5 text-left font-medium">Dir</th>
                    <th className="px-3 py-2.5 text-left font-medium">Entry</th>
                    <th className="px-3 py-2.5 text-left font-medium">TP1</th>
                    <th className="px-3 py-2.5 text-left font-medium">TP2</th>
                    <th className="px-3 py-2.5 text-left font-medium">SL</th>
                    <th className="px-3 py-2.5 text-left font-medium">Outcome</th>
                    <th className="px-3 py-2.5 text-left font-medium">PnL%</th>
                    <th className="px-3 py-2.5 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s, idx) => {
                    const isChecking = checking.has(s.id)
                    return (
                      <tr key={s.id}
                        className="border-b border-surface-border hover:bg-surface-hover transition-colors">
                        <td className="px-3 py-2 text-gray-600 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2 text-blue-400 font-bold font-mono">
                          {COIN_LABELS[s.coin] ?? s.coin.replace('USDT', '')}
                        </td>
                        <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">
                          {s.signal_date ? s.signal_date.slice(0, 16).replace('T', ' ') : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-300 max-w-[160px] truncate" title={s.strategy}>
                          {s.strategy}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold ${DIR_COLOR[s.direction] ?? 'text-gray-400'}`}>
                            {s.direction.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-300 font-mono">{Number(s.entry).toPrecision(6)}</td>
                        <td className="px-3 py-2 text-green-500 font-mono">{Number(s.tp).toPrecision(6)}</td>
                        <td className="px-3 py-2 text-green-400 font-mono">{Number(s.tp2).toPrecision(6)}</td>
                        <td className="px-3 py-2 text-red-400 font-mono">{Number(s.sl).toPrecision(6)}</td>
                        <td className="px-3 py-2">
                          {s.outcome ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              s.outcome === 'Win'
                                ? 'bg-green-900/40 text-green-400 border border-green-800'
                                : 'bg-red-900/40 text-red-400 border border-red-800'
                            }`}>
                              {s.outcome === 'Win' ? '✓' : '✗'} {s.outcome}
                            </span>
                          ) : (
                            <span className="text-gray-600 text-[10px]">pending</span>
                          )}
                        </td>
                        <td className={`px-3 py-2 font-semibold font-mono ${
                          s.profit_pct == null ? 'text-gray-600' :
                          s.profit_pct >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {s.profit_pct != null
                            ? `${s.profit_pct >= 0 ? '+' : ''}${Number(s.profit_pct).toFixed(2)}%`
                            : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {s.outcome ? (
                            <span className="text-[10px] text-gray-600">
                              {s.end_position ?? 'done'}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleCheck(s.id)}
                              disabled={isChecking}
                              className={`text-[10px] px-3 py-1 rounded font-semibold transition-all ${
                                isChecking
                                  ? 'bg-surface-border text-gray-500 cursor-not-allowed'
                                  : 'bg-brand/20 border border-brand/40 text-brand hover:bg-brand/30'
                              }`}>
                              {isChecking ? '⟳' : 'Check'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
