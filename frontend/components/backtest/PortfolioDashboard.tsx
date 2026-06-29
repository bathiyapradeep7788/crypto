'use client'

import { useEffect, useState } from 'react'

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

export default function PortfolioDashboard() {
  const [rows, setRows] = useState<PortfolioRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/optimize/portfolio-results')
      .then(r => r.json())
      .then(d => { setRows(d.results ?? []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const totalPnl = rows.reduce((s, r) => s + r.total_pnl_pct, 0)
  const avgWR    = rows.length ? rows.reduce((s, r) => s + r.win_rate_pct, 0) / rows.length : 0
  const totalTrades = rows.reduce((s, r) => s + r.total_trades, 0)
  const totalRej    = rows.reduce((s, r) => s + r.cap_rejected_trades, 0)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">
          Institutional Portfolio Optimizer
        </h1>
        <p className="text-gray-400 text-sm">
          6-Month Regime-Filtered Cross-Asset Simulation · ADX(14) · Max 3 Concurrent Positions
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card label="Avg Win Rate" value={`${avgWR.toFixed(1)}%`} color={avgWR >= 50 ? 'green' : avgWR >= 40 ? 'yellow' : 'red'} />
        <Card label="Combined PnL" value={`${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}%`} color={totalPnl >= 0 ? 'green' : 'red'} />
        <Card label="Total Trades" value={totalTrades.toString()} color="blue" />
        <Card label="Cap-Rejected" value={totalRej.toString()} color="gray" />
      </div>

      {loading && <p className="text-gray-400 text-center py-12">Loading portfolio results...</p>}
      {error   && <p className="text-red-400 text-center py-12">Error: {error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="text-gray-400 text-center py-12">
          No results yet. Run the portfolio simulation script first.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-gray-400 uppercase text-xs">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Coin</th>
                <th className="px-4 py-3 text-left">Regime</th>
                <th className="px-4 py-3 text-left">Top Strategy</th>
                <th className="px-4 py-3 text-right">Win Rate</th>
                <th className="px-4 py-3 text-right">PnL%</th>
                <th className="px-4 py-3 text-right">Max DD%</th>
                <th className="px-4 py-3 text-right">Trades</th>
                <th className="px-4 py-3 text-right">Rejected</th>
                <th className="px-4 py-3 text-right">TP / SL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((r, i) => {
                const pnlPos = r.total_pnl_pct >= 0
                const wrGood = r.win_rate_pct >= 50
                const wrOk   = r.win_rate_pct >= 40
                return (
                  <tr key={r.coin} className="bg-gray-900 hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {r.coin.replace('USDT', '')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        r.selected_regime === 'trending'
                          ? 'bg-blue-900 text-blue-300'
                          : 'bg-purple-900 text-purple-300'
                      }`}>
                        {r.regime_pct_trending}% Trend
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{r.best_strategy}</td>
                    <td className={`px-4 py-3 text-right font-mono ${wrGood ? 'text-green-400' : wrOk ? 'text-yellow-400' : 'text-red-400'}`}>
                      {r.win_rate_pct.toFixed(1)}%
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                      {pnlPos ? '+' : ''}{r.total_pnl_pct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-orange-400">
                      {r.max_drawdown_pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">{r.total_trades}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{r.cap_rejected_trades}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-400">
                      {r.tp_pct}/{r.sl_pct}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <p className="text-gray-600 text-xs mt-4 text-right">
          Last updated: {new Date(rows[0]?.updated_at).toLocaleString()}
        </p>
      )}
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-400', red: 'text-red-400', yellow: 'text-yellow-400',
    blue: 'text-blue-400', gray: 'text-gray-400',
  }
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${colors[color] ?? 'text-white'}`}>{value}</p>
    </div>
  )
}
