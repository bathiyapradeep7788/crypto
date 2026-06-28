'use client'
import { useState, useEffect } from 'react'
import TabBar from '@/components/layout/TabBar'
import { getDashboard } from '@/lib/api'
import { useErrorToast } from '@/hooks/useErrorToast'

export default function DashboardPage() {
  const { addToast } = useErrorToast()
  const [rows,    setRows]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getDashboard()
      setRows(data.rows || [])
    } catch (e: any) {
      addToast(`Dashboard load error: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const totalWins = rows.filter(r => r.win_rate >= 50).length
  const avgWr  = rows.length ? (rows.reduce((s, r) => s + (r.win_rate ?? 0), 0) / rows.length).toFixed(1) : '—'
  const totalPnl = rows.reduce((s, r) => s + (r.total_pnl_pct ?? 0), 0)

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Optimisation Dashboard</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Best strategy + optimised TP/SL per coin — saved from the Backtest page
            </p>
          </div>
          <button onClick={load} disabled={loading}
            className="text-xs px-4 py-2 bg-surface-card border border-surface-border rounded-lg text-gray-300 hover:text-white transition-colors">
            {loading ? '⟳ Loading…' : '↻ Refresh'}
          </button>
        </div>

        {/* Summary cards */}
        {rows.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-5">
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <p className="text-xs text-gray-500">Coins Optimised</p>
              <p className="text-2xl font-bold text-white mt-1">{rows.length}</p>
            </div>
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <p className="text-xs text-gray-500">Avg Win Rate</p>
              <p className="text-2xl font-bold text-brand mt-1">{avgWr}%</p>
            </div>
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <p className="text-xs text-gray-500">Coins ≥50% WR</p>
              <p className="text-2xl font-bold text-green-400 mt-1">{totalWins}</p>
            </div>
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <p className="text-xs text-gray-500">Total PnL (sum%)</p>
              <p className={`text-2xl font-bold mt-1 ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}%
              </p>
            </div>
          </div>
        )}

        {/* Main table */}
        {loading ? (
          <div className="bg-surface-card border border-surface-border rounded-lg p-8 text-center text-gray-500 text-sm">
            Loading optimisation results…
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-surface-card border border-surface-border rounded-lg p-8 text-center">
            <p className="text-gray-400 text-sm mb-2">No optimisation data yet.</p>
            <p className="text-gray-600 text-xs">
              Go to <strong className="text-gray-400">Backtest Bot → Find Best Strategy</strong> and click
              <strong className="text-brand"> 💾 Optimise &amp; Save All</strong> to populate this page.
            </p>
          </div>
        ) : (
          <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300">Per-Coin Best Strategy Summary</h3>
              <span className="text-xs text-gray-600">{rows.length} coins</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500 border-b border-surface-border bg-surface">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">#</th>
                    <th className="px-3 py-2.5 text-left font-medium">Coin</th>
                    <th className="px-3 py-2.5 text-left font-medium">Best Strategy</th>
                    <th className="px-3 py-2.5 text-left font-medium">TP1%</th>
                    <th className="px-3 py-2.5 text-left font-medium">TP2%</th>
                    <th className="px-3 py-2.5 text-left font-medium">SL%</th>
                    <th className="px-3 py-2.5 text-left font-medium">Win Rate</th>
                    <th className="px-3 py-2.5 text-left font-medium">Total PnL</th>
                    <th className="px-3 py-2.5 text-left font-medium">Trades</th>
                    <th className="px-3 py-2.5 text-left font-medium">Period</th>
                    <th className="px-3 py-2.5 text-left font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <>
                      <tr key={r.coin}
                        className={`border-b border-surface-border hover:bg-surface-hover transition-colors ${
                          r.win_rate >= 60 ? 'border-l-2 border-l-green-500' :
                          r.win_rate >= 50 ? 'border-l-2 border-l-yellow-500' : ''
                        }`}>
                        <td className="px-3 py-2.5 text-gray-600 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2.5 text-blue-400 font-semibold font-mono">
                          {r.coin?.replace('USDT', '')}
                        </td>
                        <td className="px-3 py-2.5 text-brand font-medium max-w-[180px] truncate">
                          {r.strategy_label}
                        </td>
                        <td className="px-3 py-2.5 text-gray-300 font-mono">{r.tp_pct}</td>
                        <td className="px-3 py-2.5 text-gray-300 font-mono">{r.tp2_pct}</td>
                        <td className="px-3 py-2.5 text-gray-300 font-mono">{r.sl_pct}</td>
                        <td className="px-3 py-2.5">
                          <span className={`font-bold ${
                            r.win_rate >= 60 ? 'text-green-400' :
                            r.win_rate >= 50 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {r.win_rate?.toFixed(1)}%
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 font-semibold font-mono ${
                          (r.total_pnl_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {(r.total_pnl_pct ?? 0) >= 0 ? '+' : ''}{r.total_pnl_pct?.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2.5 text-gray-400">{r.total_trades}</td>
                        <td className="px-3 py-2.5 text-gray-600 text-[10px]">
                          {r.start_dt ? r.start_dt.slice(0, 10) : '—'} →<br/>
                          {r.end_dt   ? r.end_dt.slice(0, 10)   : '—'}
                          {r.interval && <span className="ml-1 text-gray-700">({r.interval})</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.all_strategies?.length > 0 && (
                            <button
                              onClick={() => setExpanded(expanded === r.coin ? null : r.coin)}
                              className="text-[10px] text-gray-500 hover:text-brand transition-colors">
                              {expanded === r.coin ? '▲ Hide' : '▼ All strategies'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded === r.coin && r.all_strategies && (
                        <tr key={`${r.coin}-exp`} className="border-b border-surface-border bg-surface">
                          <td colSpan={11} className="px-8 py-3">
                            <p className="text-[10px] text-gray-600 mb-2">All strategies tested (sorted by win rate):</p>
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="text-gray-600 text-left">
                                  <th className="pr-6 pb-1">Strategy</th>
                                  <th className="pr-6 pb-1">Win Rate</th>
                                  <th className="pr-6 pb-1">PnL%</th>
                                  <th className="pb-1">Trades</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...r.all_strategies]
                                  .sort((a: any, b: any) => b.win_rate - a.win_rate)
                                  .map((s: any) => (
                                    <tr key={s.strategy}
                                      className={s.strategy === r.strategy_id ? 'text-brand' : 'text-gray-500'}>
                                      <td className="pr-6 py-0.5">
                                        {s.strategy_label ?? s.strategy}
                                        {s.strategy === r.strategy_id ? ' ⭐' : ''}
                                      </td>
                                      <td className="pr-6">{s.win_rate?.toFixed(1)}%</td>
                                      <td className={`pr-6 ${(s.total_pnl_pct ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {(s.total_pnl_pct ?? 0) >= 0 ? '+' : ''}{s.total_pnl_pct?.toFixed(2)}%
                                      </td>
                                      <td>{s.total_trades}</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Updated at */}
        {rows.length > 0 && rows[0].updated_at && (
          <p className="text-[10px] text-gray-700 mt-3 text-right">
            Last updated: {new Date(rows[0].updated_at).toLocaleString()}
          </p>
        )}
      </main>
    </div>
  )
}
