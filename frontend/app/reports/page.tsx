'use client'
import { useState, useEffect } from 'react'
import TabBar from '@/components/layout/TabBar'
import { getReportCoins, getCoinReport, coinReportTextUrl } from '@/lib/api'

interface StratStat {
  name: string; trades: number; wins: number; losses: number
  win_rate: number; total_pnl: number; avg_pnl: number; score: number
  best_trade: number; worst_trade: number
  tp1: number; tp2: number; sl: number; expired: number; tp2_rate: number
  best_params?: { params: Record<string, number>; win_rate: number; total_pnl: number; trades: number } | null
  param_variants?: any[]
}
interface Report {
  coin: string; total_trades: number
  strategies: StratStat[]; recommended: StratStat | null
}

export default function ReportsPage() {
  const [coins, setCoins]     = useState<string[]>([])
  const [coin, setCoin]       = useState('')
  const [report, setReport]   = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { getReportCoins().then(setCoins) }, [])

  const load = async (c: string) => {
    setCoin(c); setReport(null); setLoading(true)
    try { setReport(await getCoinReport(c)) } catch {}
    setLoading(false)
  }

  const fmtParams = (p?: Record<string, number>) =>
    p && Object.keys(p).length ? Object.entries(p).map(([k, v]) => `${k}=${v}`).join(', ') : 'standard defaults'

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Strategy Reports</h1>
          <p className="text-xs text-gray-500 mt-0.5">Best strategy &amp; parameters per coin, from your backtest history</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5 bg-surface-card border border-surface-border rounded-lg px-4 py-3">
          <span className="text-sm text-gray-400 font-semibold">Coin:</span>
          <select
            value={coin}
            onChange={e => load(e.target.value)}
            className="bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand"
          >
            <option value="">Select a coin…</option>
            {coins.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {coin && (
            <a
              href={coinReportTextUrl(coin)}
              target="_blank" rel="noreferrer"
              className="text-xs px-3 py-2 bg-brand hover:bg-brand-dark text-black rounded font-semibold"
            >
              ⬇ Download report (.txt)
            </a>
          )}
          {coins.length === 0 && <span className="text-xs text-gray-600">No backtest data yet — run a backtest first.</span>}
        </div>

        {loading && <div className="text-center py-12 text-gray-500">Analysing…</div>}

        {report && report.strategies.length > 0 && (
          <div className="space-y-5">
            {/* Recommendation */}
            {report.recommended && (() => {
              const r = report.recommended
              const grade = r.win_rate >= 60 && r.total_pnl >= 5 ? 'A'
                : r.win_rate >= 50 && r.total_pnl >= 0 ? 'B'
                : r.win_rate >= 40 ? 'C'
                : 'D'
              const gradeColor = grade === 'A' ? 'text-green-400' : grade === 'B' ? 'text-brand' : grade === 'C' ? 'text-yellow-400' : 'text-red-400'
              const second = report.strategies[1]
              const pnlEdge = second ? (r.total_pnl - second.total_pnl).toFixed(2) : null
              return (
              <div className="bg-gradient-to-br from-brand/10 via-surface-card to-surface-card border border-brand/40 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Best strategy for {report.coin}</p>
                    <p className="text-2xl font-bold text-brand">{r.name}</p>
                    {r.best_params?.params && (
                      <p className="text-xs text-gray-400 mt-1">Params: <span className="text-gray-200 font-mono">{fmtParams(r.best_params.params)}</span></p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-5xl font-black ${gradeColor}`}>{grade}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Performance grade</p>
                  </div>
                </div>

                {/* Key metrics row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {[
                    { label: 'Win Rate',   value: `${r.win_rate}%`,    color: r.win_rate >= 50 ? 'text-green-400' : 'text-yellow-400' },
                    { label: 'Net PnL',    value: `${r.total_pnl >= 0 ? '+' : ''}${r.total_pnl}%`, color: r.total_pnl >= 0 ? 'text-green-400' : 'text-red-400' },
                    { label: 'Avg / Trade',value: `${r.avg_pnl}%`,    color: r.avg_pnl >= 0 ? 'text-green-300' : 'text-red-400' },
                    { label: 'Score',      value: String(r.score),     color: 'text-brand' },
                  ].map(m => (
                    <div key={m.label} className="bg-surface/60 rounded-lg px-3 py-2.5 text-center">
                      <p className={`text-lg font-bold font-mono ${m.color}`}>{m.value}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Trade breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  {[
                    { label: 'Trades',     value: `${r.wins}W / ${r.losses}L`, sub: `${r.trades} total` },
                    { label: 'TP2 hit rate',value: `${r.tp2_rate}%`,           sub: `${r.tp2} premium exits` },
                    { label: 'Best trade', value: `+${r.best_trade}%`,         sub: 'single best' },
                    { label: 'Worst trade',value: `${r.worst_trade}%`,         sub: `${r.expired} expired` },
                  ].map(m => (
                    <div key={m.label} className="bg-surface/40 border border-surface-border/50 rounded-lg px-3 py-2.5">
                      <p className="text-xs text-gray-500">{m.label}</p>
                      <p className="text-sm font-semibold text-gray-200 mt-0.5">{m.value}</p>
                      <p className="text-xs text-gray-600">{m.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Win rate bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Win rate progress</span>
                    <span>{r.win_rate}%</span>
                  </div>
                  <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.min(r.win_rate, 100)}%` }} />
                  </div>
                </div>

                {pnlEdge && (
                  <p className="text-xs text-gray-500 mt-3">
                    {Number(pnlEdge) >= 0
                      ? <><span className="text-green-400 font-semibold">+{pnlEdge}% PnL edge</span> over #{2} {second?.name}</>
                      : <><span className="text-yellow-400 font-semibold">{pnlEdge}% PnL</span> vs #{2} {second?.name} — consider alternatives</>
                    }
                  </p>
                )}
              </div>
            )})()}

            {/* Ranking table */}
            <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
              <p className="text-sm font-semibold text-gray-300 px-4 pt-3">All strategies — ranked ({report.total_trades} trades analysed)</p>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs">
                  <thead className="border-b border-surface-border">
                    <tr className="text-gray-500 text-left">
                      {['#','Strategy','Score','Trades','Win Rate','W/L','Net PnL','Avg','TP1','TP2','SL','TP2 %','Best Params'].map(h => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.strategies.map((s, i) => (
                      <tr key={s.name} className="border-b border-surface-border hover:bg-surface-hover">
                        <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                        <td className="px-3 py-2 text-gray-200">{s.name}</td>
                        <td className="px-3 py-2 font-mono text-brand font-semibold">{s.score}</td>
                        <td className="px-3 py-2 font-mono">{s.trades}</td>
                        <td className="px-3 py-2 font-mono text-brand">{s.win_rate}%</td>
                        <td className="px-3 py-2 font-mono"><span className="text-green-400">{s.wins}</span>/<span className="text-red-400">{s.losses}</span></td>
                        <td className={`px-3 py-2 font-mono font-semibold ${s.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.total_pnl >= 0 ? '+' : ''}{s.total_pnl}%</td>
                        <td className="px-3 py-2 font-mono text-gray-400">{s.avg_pnl}%</td>
                        <td className="px-3 py-2 font-mono text-green-300">{s.tp1}</td>
                        <td className="px-3 py-2 font-mono text-green-400">{s.tp2}</td>
                        <td className="px-3 py-2 font-mono text-red-400">{s.sl}</td>
                        <td className="px-3 py-2 font-mono text-brand">{s.tp2_rate}%</td>
                        <td className="px-3 py-2 font-mono text-gray-400 max-w-xs truncate">{fmtParams(s.best_params?.params)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {report && report.strategies.length === 0 && (
          <div className="text-center py-12 text-gray-500">No data for {report.coin}.</div>
        )}
      </main>
    </div>
  )
}
