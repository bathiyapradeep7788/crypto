'use client'
import { useState, useEffect } from 'react'
import TabBar from '@/components/layout/TabBar'
import { getReportCoins, getCoinReport, coinReportTextUrl } from '@/lib/api'

interface StratStat {
  name: string; trades: number; wins: number; losses: number
  win_rate: number; total_pnl: number; avg_pnl: number; score: number
  best_trade: number; worst_trade: number
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
            {report.recommended && (
              <div className="bg-gradient-to-r from-brand/15 to-surface-card border border-brand/40 rounded-lg p-5">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Recommended for {report.coin}</p>
                <p className="text-2xl font-bold text-brand mt-1">{report.recommended.name}</p>
                <div className="flex flex-wrap gap-5 mt-3 text-sm">
                  <span className="text-gray-300">Win rate <b className="text-green-400">{report.recommended.win_rate}%</b></span>
                  <span className="text-gray-300">Net PnL <b className={report.recommended.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}>{report.recommended.total_pnl}%</b></span>
                  <span className="text-gray-300">{report.recommended.wins}W / {report.recommended.losses}L</span>
                  <span className="text-gray-300">{report.recommended.trades} trades</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">Best parameters: <span className="text-white font-mono">{fmtParams(report.recommended.best_params?.params)}</span></p>
              </div>
            )}

            {/* Ranking table */}
            <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
              <p className="text-sm font-semibold text-gray-300 px-4 pt-3">All strategies — ranked ({report.total_trades} trades analysed)</p>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs">
                  <thead className="border-b border-surface-border">
                    <tr className="text-gray-500 text-left">
                      {['#','Strategy','Score','Trades','Win Rate','W/L','Net PnL','Avg','Best','Worst','Best Params'].map(h => (
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
                        <td className="px-3 py-2 font-mono text-green-400">{s.best_trade}%</td>
                        <td className="px-3 py-2 font-mono text-red-400">{s.worst_trade}%</td>
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
