'use client'

import { useEffect, useState, useCallback } from 'react'

interface PortfolioRow {
  coin: string
  regime_pct_trending: number
  selected_regime: string
  best_strategy: string
  win_rate_pct: number
  total_pnl_pct: number
  max_drawdown_pct: number
  total_trades: number
  cap_rejected_trades: number
  tp_pct: number
  sl_pct: number
  updated_at: string
}

type RunStatus = 'idle' | 'starting' | 'running' | 'complete' | 'error'

export default function PortfolioDashboard() {
  const [rows, setRows]           = useState<PortfolioRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [runMsg, setRunMsg]       = useState<string>('')
  const [isHybrid, setIsHybrid]   = useState(false)

  const fetchResults = useCallback(() => {
    setLoading(true)
    fetch('/api/optimize/portfolio-results')
      .then(r => r.json())
      .then(d => {
        setRows(d.results ?? [])
        const hybrid = d.results?.[0]?.selected_regime === 'hybrid_v3v5'
        setIsHybrid(hybrid)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => { fetchResults() }, [fetchResults])

  // Poll for results while simulation is running
  useEffect(() => {
    if (runStatus !== 'running') return
    const id = setInterval(async () => {
      const res  = await fetch('/api/optimize/run-hybrid')
      const data = await res.json()
      if (data.isHybrid && data.count > 0) {
        setRunStatus('complete')
        setRunMsg(`✅ Hybrid simulation complete — ${data.count} coins saved.`)
        fetchResults()
        clearInterval(id)
      }
    }, 8000)
    return () => clearInterval(id)
  }, [runStatus, fetchResults])

  async function handleRunHybrid() {
    setRunStatus('starting')
    setRunMsg('Triggering V3+V5 Hybrid engine...')
    try {
      const res  = await fetch('/api/optimize/run-hybrid', { method: 'POST' })
      const data = await res.json()
      if (data.status === 'started') {
        setRunStatus('running')
        setRunMsg(`Engine started (PID ${data.pid}). Polling for results every 8s...`)
      } else if (data.status === 'local_required') {
        setRunStatus('idle')
        setRunMsg('▶ Run locally: node frontend/scripts/portfolio-simulation.mjs')
      } else {
        setRunStatus('error')
        setRunMsg(data.message ?? 'Unknown error')
      }
    } catch (e: any) {
      setRunStatus('error')
      setRunMsg(e.message)
    }
  }

  const totalPnl    = rows.reduce((s, r) => s + r.total_pnl_pct, 0)
  const avgWR       = rows.length ? rows.reduce((s, r) => s + r.win_rate_pct,   0) / rows.length : 0
  const avgDD       = rows.length ? rows.reduce((s, r) => s + r.max_drawdown_pct,0) / rows.length : 0
  const totalTrades = rows.reduce((s, r) => s + r.total_trades, 0)
  const totalRej    = rows.reduce((s, r) => s + r.cap_rejected_trades, 0)
  const profitable  = rows.filter(r => r.total_pnl_pct > 0).length

  const isRunning = runStatus === 'starting' || runStatus === 'running'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Institutional Portfolio Optimizer
            {isHybrid && (
              <span className="ml-3 text-xs px-2 py-1 rounded bg-indigo-900 text-indigo-300 font-mono align-middle">
                V3+V5 HYBRID
              </span>
            )}
          </h1>
          <p className="text-gray-400 text-sm">
            {isHybrid
              ? 'Bollinger (ADX>25) · VWAP (>2.5 SD) · Alpha Displacement Cap=5 · Trailing SL · 1H Filter'
              : '6-Month Cross-Asset Simulation · Max 5 Concurrent Positions'}
          </p>
        </div>

        {/* Run Hybrid Button */}
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleRunHybrid}
            disabled={isRunning}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              isRunning
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/40'
            }`}
          >
            {isRunning ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                Running Hybrid Engine...
              </span>
            ) : (
              '⚡ Run V3+V5 Hybrid Alpha Engine'
            )}
          </button>
          {runMsg && (
            <p className={`text-xs font-mono max-w-xs text-right ${
              runStatus === 'error' ? 'text-red-400' : runStatus === 'complete' ? 'text-green-400' : 'text-yellow-400'
            }`}>
              {runMsg}
            </p>
          )}
          <button
            onClick={fetchResults}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            ↻ Refresh results
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Card label="Avg Win Rate"    value={`${avgWR.toFixed(1)}%`}  color={avgWR>=50?'green':avgWR>=40?'yellow':'red'} />
        <Card label="Combined PnL"   value={`${totalPnl>=0?'+':''}${totalPnl.toFixed(2)}%`} color={totalPnl>=0?'green':'red'} />
        <Card label="Avg Max DD"      value={`${avgDD.toFixed(1)}%`}  color={avgDD<5?'green':avgDD<10?'yellow':'red'} />
        <Card label="Total Trades"   value={totalTrades.toLocaleString()} color="blue" />
        <Card label="Cap Rejected"   value={totalRej.toString()}      color="gray" />
        <Card label="Profitable"     value={`${profitable}/20`}       color={profitable>=15?'green':profitable>=10?'yellow':'red'} />
      </div>

      {loading && <p className="text-gray-400 text-center py-12">Loading portfolio results...</p>}
      {error   && <p className="text-red-400 text-center py-12">Error: {error}</p>}

      {!loading && !error && rows.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-700 rounded-xl">
          <p className="text-gray-400 mb-3">No results yet.</p>
          <p className="text-gray-600 text-sm">
            Click <span className="text-indigo-400 font-mono">⚡ Run V3+V5 Hybrid Alpha Engine</span> above,
            or run locally:
          </p>
          <code className="block mt-2 text-xs text-green-400 bg-gray-900 px-4 py-2 rounded mx-auto w-fit">
            node frontend/scripts/portfolio-simulation.mjs
          </code>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-gray-400 uppercase text-xs">
                <th className="px-3 py-3 text-left">#</th>
                <th className="px-3 py-3 text-left">Coin</th>
                <th className="px-3 py-3 text-left">Strategy</th>
                <th className="px-3 py-3 text-right">Win Rate</th>
                <th className="px-3 py-3 text-right">Net PnL%</th>
                <th className="px-3 py-3 text-right">Max DD%</th>
                <th className="px-3 py-3 text-right">Trades</th>
                <th className="px-3 py-3 text-right">Displaced</th>
                <th className="px-3 py-3 text-right">Rejected</th>
                <th className="px-3 py-3 text-right">TP/SL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((r, i) => {
                const pnlPos = r.total_pnl_pct >= 0
                const wrGood = r.win_rate_pct  >= 50
                const wrOk   = r.win_rate_pct  >= 40
                const isMicro = r.coin === 'ETHUSDT' || r.coin === 'INJUSDT'
                return (
                  <tr key={r.coin} className="bg-gray-900 hover:bg-gray-800 transition-colors">
                    <td className="px-3 py-3 text-gray-500 text-xs">{i + 1}</td>
                    <td className="px-3 py-3 font-semibold text-white">
                      {r.coin.replace('USDT', '')}
                      {isMicro && <span className="ml-1 text-xs text-indigo-400">①</span>}
                    </td>
                    <td className="px-3 py-3 text-gray-300 text-xs">{r.best_strategy}</td>
                    <td className={`px-3 py-3 text-right font-mono text-xs ${wrGood?'text-green-400':wrOk?'text-yellow-400':'text-red-400'}`}>
                      {r.win_rate_pct.toFixed(1)}%
                    </td>
                    <td className={`px-3 py-3 text-right font-mono font-semibold ${pnlPos?'text-green-400':'text-red-400'}`}>
                      {pnlPos?'+':''}{r.total_pnl_pct.toFixed(2)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-orange-400 text-xs">
                      {r.max_drawdown_pct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-3 text-right text-gray-300 text-xs">{r.total_trades}</td>
                    <td className="px-3 py-3 text-right text-xs">
                      <span className="text-indigo-400">{r.cap_rejected_trades}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-500 text-xs">{r.cap_rejected_trades}</td>
                    <td className="px-3 py-3 text-right font-mono text-gray-400 text-xs">
                      {r.tp_pct}/{r.sl_pct}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="bg-gray-800 border-t border-gray-600 font-semibold">
                <td colSpan={3} className="px-3 py-3 text-gray-400 text-xs">PORTFOLIO TOTAL</td>
                <td className={`px-3 py-3 text-right font-mono text-xs ${avgWR>=50?'text-green-400':'text-yellow-400'}`}>
                  {avgWR.toFixed(1)}%
                </td>
                <td className={`px-3 py-3 text-right font-mono font-bold ${totalPnl>=0?'text-green-400':'text-red-400'}`}>
                  {totalPnl>=0?'+':''}{totalPnl.toFixed(2)}%
                </td>
                <td className="px-3 py-3 text-right font-mono text-orange-400 text-xs">{avgDD.toFixed(1)}%</td>
                <td className="px-3 py-3 text-right text-gray-300 text-xs">{totalTrades.toLocaleString()}</td>
                <td colSpan={3} className="px-3 py-3 text-right text-gray-500 text-xs">
                  {profitable}/20 profitable · {totalRej} rejected
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex justify-between items-center mt-4">
          <p className="text-gray-600 text-xs">
            ① ETH &amp; INJ: 1H EMA21 trend filter + SL ×0.85
          </p>
          <p className="text-gray-600 text-xs">
            Last updated: {new Date(rows[0]?.updated_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-400', red: 'text-red-400', yellow: 'text-yellow-400',
    blue: 'text-blue-400',  gray: 'text-gray-400',
  }
  return (
    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${colors[color] ?? 'text-white'}`}>{value}</p>
    </div>
  )
}
