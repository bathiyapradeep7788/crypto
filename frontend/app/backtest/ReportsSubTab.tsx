'use client'
// Reports/Analyze embedded as a sub-tab in Backtest
import { useState, useEffect } from 'react'
import TabBar from '@/components/layout/TabBar'
import { getReportCoins, getCoinReport, coinReportTextUrl, getAllCoinsSummary } from '@/lib/api'

function gradeOf(wr: number) {
  if (wr >= 58) return 'A'
  if (wr >= 50) return 'B'
  if (wr >= 45) return 'C'
  return 'D'
}
const GRADE_COLOR: Record<string, string> = {
  A: 'text-green-400 bg-green-900/20 border-green-600/40',
  B: 'text-brand bg-brand/10 border-brand/30',
  C: 'text-yellow-400 bg-yellow-900/20 border-yellow-600/40',
  D: 'text-red-400 bg-red-900/20 border-red-600/40',
}

export default function ReportsSubTab({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'all' | 'coin'>('all')

  // All coins
  const [data,    setData]    = useState<any[]>([])
  const [total,   setTotal]   = useState(0)
  const [loadingAll, setLoadingAll] = useState(true)
  const [errorAll,   setErrorAll]   = useState('')
  const [minTr,   setMinTr]   = useState(10)

  // Per-coin
  const [coins,   setCoins]   = useState<string[]>([])
  const [coin,    setCoin]    = useState('')
  const [report,  setReport]  = useState<any>(null)
  const [loadingCoin, setLoadingCoin] = useState(false)

  const loadAll = async (mt: number) => {
    setLoadingAll(true); setErrorAll('')
    try {
      const d = await getAllCoinsSummary(mt)
      setData(d.coins ?? [])
      setTotal(d.total_analyzed ?? 0)
    } catch { setErrorAll('Run a backtest first.') }
    setLoadingAll(false)
  }

  useEffect(() => { loadAll(minTr) }, [])
  useEffect(() => { getReportCoins().then(setCoins).catch(() => {}) }, [])

  const loadCoin = async (c: string) => {
    setCoin(c); setReport(null); setLoadingCoin(true)
    try { setReport(await getCoinReport(c)) } catch {}
    setLoadingCoin(false)
  }

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-xs px-3 py-1.5 bg-surface-card border border-surface-border rounded text-gray-400 hover:text-white transition-colors">
              ← Back
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Analyze / Reports</h1>
              <p className="text-xs text-gray-500 mt-0.5">Strategy rankings from backtest DB — find best combos</p>
            </div>
          </div>
          <div className="flex bg-surface-card border border-surface-border rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setTab('all')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'all' ? 'bg-brand text-black' : 'text-gray-500 hover:text-gray-300'}`}>
              All Coins
            </button>
            <button onClick={() => setTab('coin')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'coin' ? 'bg-brand text-black' : 'text-gray-500 hover:text-gray-300'}`}>
              Per-Coin Deep Dive
            </button>
          </div>
        </div>

        {tab === 'all' && (
          <div className="space-y-5">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total Signals', value: total.toLocaleString(), color: 'text-white' },
                { label: 'Coins in DB',   value: data.length,            color: 'text-brand' },
                { label: 'A-Grade (≥58%)', value: data.filter(c => gradeOf(c.best_win_rate) === 'A').length, color: 'text-green-400' },
                { label: 'B-Grade (≥50%)', value: data.filter(c => gradeOf(c.best_win_rate) === 'B').length, color: 'text-brand' },
              ].map(s => (
                <div key={s.label} className="bg-surface-card border border-surface-border rounded-lg p-4 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{s.label}</p>
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">Min trades:</span>
              {[5, 10, 20, 50].map(v => (
                <button key={v} onClick={() => { setMinTr(v); loadAll(v) }}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${minTr === v ? 'bg-brand text-black' : 'bg-surface border border-surface-border text-gray-400 hover:text-white'}`}>
                  ≥{v}
                </button>
              ))}
            </div>

            {loadingAll && <div className="text-center py-20 text-gray-500 text-sm">Analyzing DB…</div>}
            {errorAll && <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400 text-sm">{errorAll}</div>}

            {!loadingAll && data.length > 0 && (
              <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-surface-border">
                  <p className="text-sm font-semibold text-white">All Coins — Ranked by Best Strategy Win Rate</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-surface-border bg-surface/50">
                      <tr className="text-gray-500 text-left">
                        {['#','Coin','Grade','Best Strategy','WR %','PnL %','Trades','Score'].map(h => (
                          <th key={h} className="px-3 py-2.5 font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((c: any, i: number) => {
                        const g  = gradeOf(c.best_win_rate)
                        const gc = GRADE_COLOR[g]
                        return (
                          <tr key={c.coin} className="border-b border-surface-border hover:bg-surface-hover transition-colors">
                            <td className="px-3 py-2.5 text-gray-500 font-mono">{i < 3 ? <span className="text-yellow-400 font-bold">#{i+1}</span> : `#${i+1}`}</td>
                            <td className="px-3 py-2.5 font-bold text-white">{c.coin.replace('USDT','')}</td>
                            <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${gc}`}>{g}</span></td>
                            <td className="px-3 py-2.5 text-gray-300 max-w-[200px] truncate">{c.best_strategy.replace(/_/g,' ')}</td>
                            <td className={`px-3 py-2.5 font-mono font-bold ${c.best_win_rate >= 50 ? 'text-green-400' : c.best_win_rate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>{c.best_win_rate}%</td>
                            <td className={`px-3 py-2.5 font-mono font-semibold ${c.best_total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{c.best_total_pnl >= 0 ? '+' : ''}{c.best_total_pnl}%</td>
                            <td className="px-3 py-2.5 font-mono text-gray-400">{c.best_trades}</td>
                            <td className="px-3 py-2.5 font-mono text-brand">{c.best_score}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'coin' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 bg-surface-card border border-surface-border rounded-lg px-4 py-3">
              <span className="text-sm text-gray-400 font-semibold">Coin:</span>
              <select value={coin} onChange={e => loadCoin(e.target.value)}
                className="bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand">
                <option value="">Select a coin…</option>
                {coins.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {coin && (
                <a href={coinReportTextUrl(coin)} target="_blank" rel="noreferrer"
                  className="text-xs px-3 py-2 bg-brand hover:bg-brand/80 text-black rounded font-semibold">
                  ⬇ Download .txt report
                </a>
              )}
            </div>

            {loadingCoin && <div className="text-center py-12 text-gray-500">Analyzing…</div>}

            {report && report.strategies?.length > 0 && (
              <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">{report.coin} — All Strategies ({report.total_trades} trades)</p>
                  {report.recommended && (
                    <span className="text-xs text-brand">Best: {report.recommended.name.replace(/_/g,' ')} ({report.recommended.win_rate}% WR)</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-surface-border bg-surface/50">
                      <tr className="text-gray-500 text-left">
                        {['#','Strategy','Score','Trades','Win Rate','W/L','Net PnL','Avg/Trade','TP1','TP2','SL'].map(h => (
                          <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.strategies.map((s: any, i: number) => (
                        <tr key={s.name} className={`border-b border-surface-border hover:bg-surface-hover ${i === 0 ? 'bg-brand/5' : ''}`}>
                          <td className="px-3 py-2 text-gray-500">{i === 0 ? '🏆' : i + 1}</td>
                          <td className="px-3 py-2 text-gray-200 font-medium">{s.name.replace(/_/g,' ')}</td>
                          <td className="px-3 py-2 font-mono text-brand font-semibold">{s.score}</td>
                          <td className="px-3 py-2 font-mono">{s.trades}</td>
                          <td className={`px-3 py-2 font-mono font-bold ${s.win_rate >= 50 ? 'text-green-400' : 'text-yellow-400'}`}>{s.win_rate}%</td>
                          <td className="px-3 py-2 font-mono"><span className="text-green-400">{s.wins}</span>/<span className="text-red-400">{s.losses}</span></td>
                          <td className={`px-3 py-2 font-mono font-semibold ${s.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.total_pnl >= 0 ? '+' : ''}{s.total_pnl}%</td>
                          <td className="px-3 py-2 font-mono text-gray-400">{s.avg_pnl}%</td>
                          <td className="px-3 py-2 font-mono text-green-300">{s.tp1}</td>
                          <td className="px-3 py-2 font-mono text-green-400">{s.tp2}</td>
                          <td className="px-3 py-2 font-mono text-red-400">{s.sl}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
