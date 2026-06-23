'use client'
import { ClosedTrade, OpenPosition } from '@/types'

interface Props {
  openPosition: OpenPosition | null
  closedTrades: ClosedTrade[]
  currentPrice: number | null
}

export default function PositionsTable({ openPosition, closedTrades, currentPrice }: Props) {
  const wins = closedTrades.filter(t => t.win).length
  const losses = closedTrades.filter(t => !t.win).length
  const totalPnl = closedTrades.reduce((s, t) => s + t.profit_pct, 0)

  const unrealizedPnl = openPosition && currentPrice
    ? ((currentPrice - openPosition.entry) / openPosition.entry * 100 * (openPosition.direction === 'long' ? 1 : -1))
    : null

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Trades', value: closedTrades.length, color: 'text-white' },
          { label: 'Wins / Losses', value: `${wins} / ${losses}`, color: wins > losses ? 'text-green-400' : 'text-red-400' },
          { label: 'Win Rate', value: closedTrades.length > 0 ? `${(wins / closedTrades.length * 100).toFixed(1)}%` : '—', color: 'text-brand' },
          { label: 'Total PnL', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}%`, color: totalPnl >= 0 ? 'text-green-400' : 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-surface-card border border-surface-border rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Open position */}
      {openPosition && (
        <div className="bg-surface-card border border-brand/40 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Open Position</h3>
            <span className={`text-xs px-2 py-1 rounded font-semibold ${openPosition.direction === 'long' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
              {openPosition.direction.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><p className="text-gray-500">Symbol</p><p className="text-blue-400 font-mono font-semibold">{openPosition.symbol}</p></div>
            <div><p className="text-gray-500">Entry</p><p className="text-white font-mono">{openPosition.entry}</p></div>
            <div><p className="text-gray-500">Current</p><p className="text-white font-mono">{currentPrice?.toFixed(4) ?? '—'}</p></div>
            <div><p className="text-gray-500">TP1</p><p className="text-green-400 font-mono">{openPosition.tp}</p></div>
            <div><p className="text-gray-500">TP2</p><p className="text-green-300 font-mono">{openPosition.tp2}</p></div>
            <div><p className="text-gray-500">SL</p><p className="text-red-400 font-mono">{openPosition.sl}</p></div>
            <div><p className="text-gray-500">Unrealized PnL</p>
              <p className={`font-mono font-bold ${unrealizedPnl !== null && unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {unrealizedPnl !== null ? `${unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}%` : '—'}
              </p>
            </div>
            {openPosition.ai_confidence !== undefined && (
              <div><p className="text-gray-500">AI Confidence</p><p className="text-brand font-semibold">{openPosition.ai_confidence}%</p></div>
            )}
            {openPosition.ai_analysis && (
              <div className="col-span-3"><p className="text-gray-500">AI Analysis</p><p className="text-gray-300 text-xs mt-0.5">{openPosition.ai_analysis}</p></div>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-2">Opened: {new Date(openPosition.opened_at).toLocaleString()}</p>
        </div>
      )}

      {/* Closed trades */}
      {closedTrades.length > 0 && (
        <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-surface-border">
            <h3 className="text-sm font-semibold text-white">Trade History</h3>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-card border-b border-surface-border">
                <tr className="text-gray-500 text-left">
                  {['Symbol','Dir','Entry','Exit','Result','PnL %','PnL $','AI%','Closed'].map(h => (
                    <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...closedTrades].reverse().map((t, i) => (
                  <tr key={i} className="border-b border-surface-border hover:bg-surface-hover transition-colors">
                    <td className="px-3 py-2 font-mono text-blue-400">{t.symbol}</td>
                    <td className="px-3 py-2">
                      <span className={`font-semibold ${t.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                        {t.direction.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono">{t.entry}</td>
                    <td className="px-3 py-2 font-mono">{t.exit_price}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        t.exit_reason === 'Hit TP2' ? 'bg-green-900/50 text-green-300' :
                        t.exit_reason === 'Hit TP1' ? 'bg-green-900/30 text-green-400' :
                        'bg-red-900/50 text-red-400'
                      }`}>{t.exit_reason}</span>
                    </td>
                    <td className={`px-3 py-2 font-mono font-semibold ${t.profit_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {t.profit_pct >= 0 ? '+' : ''}{t.profit_pct}%
                    </td>
                    <td className={`px-3 py-2 font-mono ${t.profit_usdt >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${t.profit_usdt >= 0 ? '+' : ''}{t.profit_usdt}
                    </td>
                    <td className="px-3 py-2 text-brand">{t.ai_confidence ?? '—'}%</td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{new Date(t.closed_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
