'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TabBar from '@/components/layout/TabBar'
import { getReportCoins, getCoinReport, coinReportTextUrl, getAllCoinsSummary } from '@/lib/api'

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
interface CoinSummary {
  coin: string; total_trades: number
  best_strategy: string; best_win_rate: number; best_total_pnl: number
  best_trades: number; best_score: number
  overall_win_rate: number; overall_total_pnl: number
}

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

// ─── All Coins Tab ────────────────────────────────────────────────────────────
function AllCoinsTab() {
  const router = useRouter()
  const [data,    setData]    = useState<CoinSummary[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [minTr,   setMinTr]   = useState(10)

  const load = async (mt: number) => {
    setLoading(true); setError('')
    try {
      const d = await getAllCoinsSummary(mt)
      setData(d.coins ?? [])
      setTotal(d.total_analyzed ?? 0)
    } catch (e: any) {
      setError('DB load failed — run a backtest first.')
    }
    setLoading(false)
  }

  useEffect(() => { load(minTr) }, [])

  const aGrade  = data.filter(c => gradeOf(c.best_win_rate) === 'A')
  const bGrade  = data.filter(c => gradeOf(c.best_win_rate) === 'B')

  const startPortfolio = (coins: CoinSummary[]) => {
    const list = coins.map(c => c.coin).join(',')
    router.push(`/portfolio?coins=${list}`)
  }

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Signals Analyzed', value: total.toLocaleString(), color: 'text-white' },
          { label: 'Coins in DB',            value: data.length,            color: 'text-brand'  },
          { label: 'A-Grade Coins (≥58% WR)',value: aGrade.length,          color: 'text-green-400' },
          { label: 'B-Grade Coins (≥50% WR)',value: bGrade.length,          color: 'text-brand'  },
        ].map(s => (
          <div key={s.label} className="bg-surface-card border border-surface-border rounded-lg p-4 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Min trades filter:</span>
          {[5, 10, 20, 50].map(v => (
            <button key={v} onClick={() => { setMinTr(v); load(v) }}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                minTr === v ? 'bg-brand text-black' : 'bg-surface border border-surface-border text-gray-400 hover:text-white'}`}>
              ≥{v}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {aGrade.length > 0 && (
            <button onClick={() => startPortfolio(aGrade)}
              className="text-xs px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors">
              Paper Trade A-Grade Coins ({aGrade.length})
            </button>
          )}
          {(aGrade.length + bGrade.length) > 0 && (
            <button onClick={() => startPortfolio([...aGrade, ...bGrade])}
              className="text-xs px-4 py-2 bg-brand hover:bg-brand/80 text-black rounded-lg font-semibold transition-colors">
              Paper Trade A+B Coins ({aGrade.length + bGrade.length})
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center py-20 text-gray-500">
          <div className="text-sm mb-2">Analyzing DB...</div>
          <div className="text-xs text-gray-600">Fetching all backtest results — may take 5-10 seconds</div>
        </div>
      )}
      {error && <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400 text-sm">{error}</div>}

      {!loading && data.length > 0 && (
        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
            <p className="text-sm font-semibold text-white">All Coins — Ranked by Best Strategy Performance</p>
            <p className="text-xs text-gray-500">{data.length} coins · {total.toLocaleString()} total signals</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-surface-border bg-surface/50">
                <tr className="text-gray-500 text-left">
                  {['#','Coin','Grade','Best Strategy','WR %','PnL %','Trades','Score','Action'].map(h => (
                    <th key={h} className="px-3 py-2.5 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((c, i) => {
                  const g  = gradeOf(c.best_win_rate)
                  const gc = GRADE_COLOR[g]
                  const strategy = c.best_strategy.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                  return (
                    <tr key={c.coin} className={`border-b border-surface-border hover:bg-surface-hover transition-colors ${i < 3 ? 'bg-brand/3' : ''}`}>
                      <td className="px-3 py-2.5 text-gray-500 font-mono">
                        {i < 3 ? <span className="text-yellow-400 font-bold">#{i+1}</span> : `#${i+1}`}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-white">{c.coin.replace('USDT','')}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${gc}`}>{g}</span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-300 max-w-[200px] truncate">{strategy}</td>
                      <td className={`px-3 py-2.5 font-mono font-bold ${c.best_win_rate >= 50 ? 'text-green-400' : c.best_win_rate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {c.best_win_rate}%
                      </td>
                      <td className={`px-3 py-2.5 font-mono font-semibold ${c.best_total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {c.best_total_pnl >= 0 ? '+' : ''}{c.best_total_pnl}%
                      </td>
                      <td className="px-3 py-2.5 font-mono text-gray-400">{c.best_trades}</td>
                      <td className="px-3 py-2.5 font-mono text-brand">{c.best_score}</td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => startPortfolio([c])}
                          className="text-[10px] px-2 py-1 bg-surface border border-surface-border rounded hover:border-brand hover:text-brand transition-colors text-gray-500">
                          Paper Trade
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && data.length === 0 && !error && (
        <div className="text-center py-20 text-gray-500">
          <p className="text-sm">No backtest data found.</p>
          <p className="text-xs mt-2 text-gray-600">Go to Backtest Bot and run a backtest first.</p>
        </div>
      )}

      {/* Legend */}
      {!loading && data.length > 0 && (
        <div className="flex gap-4 text-xs text-gray-600 px-1">
          {[['A','≥58% WR','text-green-400'],['B','≥50% WR','text-brand'],['C','≥45% WR','text-yellow-400'],['D','<45% WR','text-red-400']].map(([g,d,c]) => (
            <span key={g}><span className={`font-bold ${c}`}>{g}</span>: {d}</span>
          ))}
          <span className="ml-auto">Score = (WR/100) × PnL — balances win rate + profitability</span>
        </div>
      )}
    </div>
  )
}

// ─── Per-Coin Tab ─────────────────────────────────────────────────────────────
function PerCoinTab() {
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 bg-surface-card border border-surface-border rounded-lg px-4 py-3">
        <span className="text-sm text-gray-400 font-semibold">Coin:</span>
        <select value={coin} onChange={e => load(e.target.value)}
          className="bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand">
          <option value="">Select a coin…</option>
          {coins.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {coin && (
          <a href={coinReportTextUrl(coin)} target="_blank" rel="noreferrer"
            className="text-xs px-3 py-2 bg-brand hover:bg-brand-dark text-black rounded font-semibold">
            ⬇ Download .txt report
          </a>
        )}
        {coins.length === 0 && <span className="text-xs text-gray-600">No data — run a backtest first.</span>}
      </div>

      {loading && <div className="text-center py-12 text-gray-500">Analysing…</div>}

      {report && report.strategies.length > 0 && (
        <div className="space-y-5">
          {report.recommended && (() => {
            const r = report.recommended!
            const g = r.win_rate >= 60 && r.total_pnl >= 5 ? 'A'
              : r.win_rate >= 50 && r.total_pnl >= 0 ? 'B'
              : r.win_rate >= 40 ? 'C' : 'D'
            const gc = g === 'A' ? 'text-green-400' : g === 'B' ? 'text-brand' : g === 'C' ? 'text-yellow-400' : 'text-red-400'
            const second = report.strategies[1]
            const pnlEdge = second ? (r.total_pnl - second.total_pnl).toFixed(2) : null
            return (
              <div className="bg-gradient-to-br from-brand/10 via-surface-card to-surface-card border border-brand/40 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Best strategy for {report.coin}</p>
                    <p className="text-2xl font-bold text-brand">{r.name.replace(/_/g,' ')}</p>
                    {r.best_params?.params && (
                      <p className="text-xs text-gray-400 mt-1">Params: <span className="text-gray-200 font-mono">{fmtParams(r.best_params.params)}</span></p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-5xl font-black ${gc}`}>{g}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Performance grade</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {[
                    { label: 'Win Rate',    value: `${r.win_rate}%`,    color: r.win_rate >= 50 ? 'text-green-400' : 'text-yellow-400' },
                    { label: 'Net PnL',     value: `${r.total_pnl >= 0 ? '+' : ''}${r.total_pnl}%`, color: r.total_pnl >= 0 ? 'text-green-400' : 'text-red-400' },
                    { label: 'Avg / Trade', value: `${r.avg_pnl}%`,    color: r.avg_pnl >= 0 ? 'text-green-300' : 'text-red-400' },
                    { label: 'Score',       value: String(r.score),     color: 'text-brand' },
                  ].map(m => (
                    <div key={m.label} className="bg-surface/60 rounded-lg px-3 py-2.5 text-center">
                      <p className={`text-lg font-bold font-mono ${m.color}`}>{m.value}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  {[
                    { label: 'Trades',      value: `${r.wins}W / ${r.losses}L`, sub: `${r.trades} total` },
                    { label: 'TP2 hit rate',value: `${r.tp2_rate}%`,            sub: `${r.tp2} premium exits` },
                    { label: 'Best trade',  value: `+${r.best_trade}%`,         sub: 'single best' },
                    { label: 'Worst trade', value: `${r.worst_trade}%`,         sub: `${r.expired} expired` },
                  ].map(m => (
                    <div key={m.label} className="bg-surface/40 border border-surface-border/50 rounded-lg px-3 py-2.5">
                      <p className="text-xs text-gray-500">{m.label}</p>
                      <p className="text-sm font-semibold text-gray-200 mt-0.5">{m.value}</p>
                      <p className="text-xs text-gray-600">{m.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Win rate</span><span>{r.win_rate}%</span>
                  </div>
                  <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.min(r.win_rate, 100)}%` }} />
                  </div>
                </div>
                {pnlEdge && (
                  <p className="text-xs text-gray-500 mt-3">
                    {Number(pnlEdge) >= 0
                      ? <><span className="text-green-400 font-semibold">+{pnlEdge}% PnL edge</span> over #{2} {second?.name}</>
                      : <><span className="text-yellow-400 font-semibold">{pnlEdge}%</span> vs #{2} {second?.name} — consider alternatives</>}
                  </p>
                )}
              </div>
            )
          })()}

          <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
            <p className="text-sm font-semibold text-gray-300 px-4 pt-3">All strategies — ranked ({report.total_trades} trades)</p>
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
                      <td className="px-3 py-2 text-gray-200">{s.name.replace(/_/g,' ')}</td>
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
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [tab, setTab] = useState<'all' | 'coin'>('all')

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Strategy Reports</h1>
            <p className="text-xs text-gray-500 mt-0.5">Analyze backtest DB → find best coin+strategy combos → start paper trading</p>
          </div>
          <div className="flex bg-surface-card border border-surface-border rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setTab('all')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'all' ? 'bg-brand text-black' : 'text-gray-500 hover:text-gray-300'}`}>
              All Coins Overview
            </button>
            <button onClick={() => setTab('coin')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'coin' ? 'bg-brand text-black' : 'text-gray-500 hover:text-gray-300'}`}>
              Per-Coin Deep Dive
            </button>
          </div>
        </div>

        {tab === 'all' ? <AllCoinsTab /> : <PerCoinTab />}
      </main>
    </div>
  )
}
