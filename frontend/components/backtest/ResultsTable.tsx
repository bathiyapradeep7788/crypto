'use client'
import { TradeResult } from '@/types'

interface Props { results: TradeResult[] }

export default function ResultsTable({ results }: Props) {
  if (results.length === 0) return null

  const wins   = results.filter(r => r.win_loss_rate === 'Win').length
  const losses = results.filter(r => r.win_loss_rate === 'Loss').length
  const winRate = ((wins / results.length) * 100).toFixed(1)
  const totalPnl = results.reduce((sum, r) => sum + r.profit_rate, 0).toFixed(2)

  // Per-strategy breakdown so multiple strategies can be compared at a glance.
  const byStrategy = Object.values(
    results.reduce((acc, r) => {
      const k = r.strategy
      if (!acc[k]) acc[k] = { strategy: k, trades: 0, wins: 0, losses: 0, pnl: 0 }
      acc[k].trades += 1
      if (r.win_loss_rate === 'Win') acc[k].wins += 1
      else acc[k].losses += 1
      acc[k].pnl += r.profit_rate
      return acc
    }, {} as Record<string, { strategy: string; trades: number; wins: number; losses: number; pnl: number }>)
  ).sort((a, b) => b.pnl - a.pnl)

  return (
    <div className="space-y-4">
      {/* Overall summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Trades', value: results.length,         color: 'text-white' },
          { label: 'Win Rate',     value: `${winRate}%`,          color: 'text-brand'  },
          { label: 'Wins',         value: `${wins}W / ${losses}L`, color: wins > losses ? 'text-green-400' : 'text-red-400' },
          { label: 'Net PnL',      value: `${parseFloat(totalPnl) >= 0 ? '+' : ''}${totalPnl}%`, color: parseFloat(totalPnl) >= 0 ? 'text-green-400' : 'text-red-400' },
        ].map(stat => (
          <div key={stat.label} className="bg-surface-card border border-surface-border rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Per-strategy comparison (shown when more than one strategy ran) */}
      {byStrategy.length > 1 && (
        <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
          <p className="text-sm font-semibold text-gray-300 px-4 pt-3">Strategy Comparison</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs mt-2">
              <thead className="border-b border-surface-border">
                <tr className="text-gray-500 text-left">
                  {['Rank','Strategy','Trades','Win Rate','W / L','Net PnL'].map(h => (
                    <th key={h} className="px-4 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byStrategy.map((s, i) => {
                  const wr = ((s.wins / s.trades) * 100).toFixed(1)
                  return (
                    <tr key={s.strategy} className="border-b border-surface-border hover:bg-surface-hover">
                      <td className="px-4 py-2 text-gray-500">#{i + 1}</td>
                      <td className="px-4 py-2 text-gray-200">{s.strategy}</td>
                      <td className="px-4 py-2 font-mono">{s.trades}</td>
                      <td className="px-4 py-2 font-mono text-brand">{wr}%</td>
                      <td className="px-4 py-2 font-mono">
                        <span className="text-green-400">{s.wins}W</span>
                        {' / '}
                        <span className="text-red-400">{s.losses}L</span>
                      </td>
                      <td className={`px-4 py-2 font-mono font-semibold ${s.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(2)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-card border-b border-surface-border">
              <tr className="text-gray-500 text-left">
                {['Coin','Strategy','Signal Time','Entry','TP1','TP2','SL','End Time','Result','W/L','PnL %'].map(h => (
                  <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b border-surface-border hover:bg-surface-hover transition-colors">
                  <td className="px-3 py-2 font-mono text-blue-400">{r.coin}</td>
                  <td className="px-3 py-2 text-gray-300 max-w-32 truncate">{r.strategy}</td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{new Date(r.signal_date_time).toLocaleString()}</td>
                  <td className="px-3 py-2 font-mono">{r.entry}</td>
                  <td className="px-3 py-2 font-mono text-green-400">{r.tp}</td>
                  <td className="px-3 py-2 font-mono text-green-300">{r.tp2}</td>
                  <td className="px-3 py-2 font-mono text-red-400">{r.sl}</td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{new Date(r.end_time).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      r.end_position === 'Hit TP2' ? 'bg-green-900/50 text-green-300' :
                      r.end_position === 'Hit TP1' ? 'bg-green-900/30 text-green-400' :
                      r.end_position === 'Hit SL'  ? 'bg-red-900/50 text-red-400' :
                                                     'bg-gray-800 text-gray-400'
                    }`}>{r.end_position}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`font-semibold ${r.win_loss_rate === 'Win' ? 'text-green-400' : 'text-red-400'}`}>
                      {r.win_loss_rate}
                    </span>
                  </td>
                  <td className={`px-3 py-2 font-mono font-semibold ${r.profit_rate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {r.profit_rate >= 0 ? '+' : ''}{r.profit_rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
