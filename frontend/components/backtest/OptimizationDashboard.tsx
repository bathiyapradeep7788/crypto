'use client'
import { useState, useEffect, useCallback } from 'react'
import { STRATEGY_LABELS } from '@/lib/constants'

const OPT_COINS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','DOGEUSDT',
  'MATICUSDT','UNIUSDT','LTCUSDT','APTUSDT','SUIUSDT',
  'NEARUSDT','OPUSDT','ARBUSDT','INJUSDT','TIAUSDT',
]

type BestRow = {
  coin: string
  best_strategy_name: string
  win_rate_percentage: number
  total_pnl_percentage: number
  max_drawdown_percentage: number
  total_trades: number
  tp_pct: number
  tp2_pct: number
  sl_pct: number
  updated_at: string
}

type PhaseStatus = 'idle' | 'running' | 'done' | 'error'

type CoinProgress = {
  coin: string
  fetchDone: boolean
  stratDone: boolean
  error?: string
  pnl?: number
  winRate?: number
  strategy?: string
}

const DELAY = 300  // ms between Binance pages

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchAllCandles(
  coin: string,
  onPage: (pct: number) => void
): Promise<void> {
  let since = 0
  let attempts = 0
  while (true) {
    const qs = new URLSearchParams({ coin, since: String(since) })
    const res = await fetch(`/api/optimize/fetch-candles?${qs}`)

    if (res.status === 429) {
      await delay(60_000)  // rate limit: wait 60s and retry
      continue
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(j.error || `Fetch failed: ${res.status}`)
    }

    const j = await res.json()
    onPage(j.progress ?? 0)

    if (j.done || !j.nextSince) break
    since = j.nextSince
    await delay(DELAY)

    attempts++
    if (attempts > 20) break  // safety: max 20 pages (~14k candles)
  }
}

async function runStrategies(coin: string): Promise<{
  pnl: number; winRate: number; strategy: string
}> {
  const res = await fetch(`/api/optimize/run-coin?coin=${coin}`)
  if (!res.ok) {
    const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(j.error || `Run failed`)
  }
  const j = await res.json()
  return {
    pnl:      j.best?.total_pnl ?? 0,
    winRate:  j.best?.win_rate  ?? 0,
    strategy: j.best?.label     ?? '—',
  }
}

// ── Main Component ────────────────────────────────────────────

export default function OptimizationDashboard() {
  const [phase, setPhase]           = useState<PhaseStatus>('idle')
  const [coinMap, setCoinMap]       = useState<Record<string, CoinProgress>>({})
  const [currentCoin, setCurrentCoin] = useState<string | null>(null)
  const [fetchPct, setFetchPct]     = useState(0)
  const [savedRows, setSavedRows]   = useState<BestRow[]>([])
  const [loadingRows, setLoadingRows] = useState(false)
  const [expandedCoin, setExpandedCoin] = useState<string | null>(null)

  // Load existing results on mount
  useEffect(() => {
    loadResults()
  }, [])

  async function loadResults() {
    setLoadingRows(true)
    try {
      const res = await fetch('/api/optimize/results')
      const j = await res.json()
      setSavedRows(j.rows ?? [])
    } catch {}
    setLoadingRows(false)
  }

  const runAll = useCallback(async () => {
    setPhase('running')
    const initial: Record<string, CoinProgress> = {}
    for (const coin of OPT_COINS) {
      initial[coin] = { coin, fetchDone: false, stratDone: false }
    }
    setCoinMap(initial)

    for (const coin of OPT_COINS) {
      setCurrentCoin(coin)
      setFetchPct(0)

      // Phase A: fetch candles
      try {
        await fetchAllCandles(coin, pct => setFetchPct(pct))
        setCoinMap(prev => ({ ...prev, [coin]: { ...prev[coin], fetchDone: true } }))
      } catch (e: any) {
        setCoinMap(prev => ({
          ...prev, [coin]: { ...prev[coin], fetchDone: true, error: `Fetch: ${e.message}` }
        }))
        continue
      }

      // Phase B: run strategies
      try {
        const { pnl, winRate, strategy } = await runStrategies(coin)
        setCoinMap(prev => ({
          ...prev, [coin]: { ...prev[coin], stratDone: true, pnl, winRate, strategy }
        }))
      } catch (e: any) {
        setCoinMap(prev => ({
          ...prev, [coin]: { ...prev[coin], stratDone: true, error: `Strat: ${e.message}` }
        }))
      }
    }

    setCurrentCoin(null)
    setPhase('done')
    await loadResults()
  }, [])

  const doneCount  = Object.values(coinMap).filter(c => c.stratDone).length
  const totalCoins = OPT_COINS.length
  const pct        = totalCoins > 0 ? Math.round(doneCount / totalCoins * 100) : 0

  // ── Stats summary ─────────────────────────────────────────
  const rows = savedRows
  const avgWR  = rows.length ? rows.reduce((s, r) => s + r.win_rate_percentage, 0) / rows.length : 0
  const totalPnl = rows.reduce((s, r) => s + r.total_pnl_percentage, 0)
  const profitable = rows.filter(r => r.total_pnl_percentage > 0).length

  return (
    <div className="space-y-5">

      {/* ── Header + Run Button ─────────────────────────────── */}
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white">Top Strategies Optimization</h2>
            <p className="text-xs text-gray-500 mt-1">
              20 coins × 10 strategies × TP/SL grid — 5-month 15m historical data from Binance
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {OPT_COINS.map(coin => {
                const cp = coinMap[coin]
                const isActive = currentCoin === coin
                const done = cp?.stratDone
                const err  = cp?.error
                return (
                  <span key={coin}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium border transition-all ${
                      isActive ? 'bg-brand/30 border-brand text-brand animate-pulse' :
                      err      ? 'bg-red-900/20 border-red-800/50 text-red-400' :
                      done     ? 'bg-green-900/20 border-green-800/40 text-green-400' :
                                 'bg-surface border-surface-border text-gray-600'
                    }`}>
                    {coin.replace('USDT', '')}
                    {isActive && ' ⟳'}
                    {done && !err && ' ✓'}
                    {err && ' ✗'}
                  </span>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={runAll}
              disabled={phase === 'running'}
              className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                phase === 'running'
                  ? 'bg-surface-border text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-brand to-blue-500 text-black hover:opacity-90 shadow-lg shadow-brand/20'
              }`}>
              {phase === 'running' ? `⟳ Running… ${doneCount}/${totalCoins}` : '🚀 Run Full Optimization'}
            </button>
            {phase !== 'running' && (
              <button
                onClick={loadResults}
                disabled={loadingRows}
                className="px-5 py-2 rounded-lg text-xs font-semibold bg-surface border border-surface-border text-gray-400 hover:text-white transition-all">
                {loadingRows ? '⟳ Loading…' : '↻ Refresh Results'}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {phase === 'running' && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                {currentCoin
                  ? <>Coin <span className="text-brand font-mono font-bold">{currentCoin.replace('USDT','')}</span>
                    {coinMap[currentCoin]?.fetchDone
                      ? ' — Running strategies…'
                      : ` — Fetching candles (${fetchPct}%)`}
                  </>
                  : 'Starting…'}
              </span>
              <span className="text-white font-semibold">{pct}%</span>
            </div>
            <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-brand to-blue-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {currentCoin && !coinMap[currentCoin]?.fetchDone && (
              <div className="w-full bg-surface rounded-full h-1 overflow-hidden">
                <div
                  className="h-1 rounded-full bg-blue-400/40 transition-all duration-300"
                  style={{ width: `${fetchPct}%` }}
                />
              </div>
            )}
            <p className="text-[10px] text-gray-600">
              Each coin: fetching ~14,400 candles → running 10 strategies + TP/SL grid search → saving best to DB
            </p>
          </div>
        )}

        {phase === 'done' && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-400">
            <span className="text-base">✅</span>
            <span>Optimization complete — {doneCount} coins processed and saved to database</span>
          </div>
        )}
      </div>

      {/* ── Summary Cards ──────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Coins Optimized',   value: `${rows.length}`,               color: 'text-brand'      },
            { label: 'Avg Win Rate',       value: `${avgWR.toFixed(1)}%`,         color: 'text-yellow-400' },
            { label: 'Profitable Coins',   value: `${profitable} / ${rows.length}`, color: 'text-green-400'  },
            { label: 'Combined PnL',       value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}%`, color: totalPnl >= 0 ? 'text-green-400' : 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-surface-card border border-surface-border rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Results Table ───────────────────────────────────── */}
      {(rows.length > 0 || loadingRows) && (
        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-surface-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Best Strategy Per Coin
              <span className="ml-2 text-xs text-gray-500 font-normal">(sorted by Total PnL)</span>
            </h3>
            {rows.length > 0 && (
              <span className="text-xs text-gray-500">{rows.length} coins</span>
            )}
          </div>

          {loadingRows ? (
            <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
              <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Loading results…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-surface-border bg-surface/50">
                    <th className="px-4 py-3 text-left font-medium">#</th>
                    <th className="px-4 py-3 text-left font-medium">Coin</th>
                    <th className="px-4 py-3 text-left font-medium">Best Strategy</th>
                    <th className="px-4 py-3 text-right font-medium">Win Rate</th>
                    <th className="px-4 py-3 text-right font-medium">Total PnL</th>
                    <th className="px-4 py-3 text-right font-medium">Max DD</th>
                    <th className="px-4 py-3 text-right font-medium">Trades</th>
                    <th className="px-4 py-3 text-center font-medium">TP1 / TP2 / SL</th>
                    <th className="px-4 py-3 text-center font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const pnlPos   = r.total_pnl_percentage >= 0
                    const wrGood   = r.win_rate_percentage >= 60
                    const wrOk     = r.win_rate_percentage >= 50
                    const mddRisk  = r.max_drawdown_percentage > 15
                    const label    = STRATEGY_LABELS[r.best_strategy_name] ?? r.best_strategy_name
                    return (
                      <tr key={r.coin}
                        className="border-b border-surface-border hover:bg-surface/60 transition-colors cursor-pointer"
                        onClick={() => setExpandedCoin(expandedCoin === r.coin ? null : r.coin)}>
                        <td className="px-4 py-3 text-gray-600 font-mono">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pnlPos ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="font-bold font-mono text-white text-sm">
                              {r.coin.replace('USDT', '')}
                            </span>
                            <span className="text-gray-600 text-[10px]">/ USDT</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-brand font-medium">{label}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                            wrGood ? 'bg-green-900/30 text-green-400' :
                            wrOk   ? 'bg-yellow-900/30 text-yellow-400' :
                                     'bg-red-900/20 text-red-400'
                          }`}>
                            {r.win_rate_percentage.toFixed(1)}%
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-bold font-mono text-sm ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                          {pnlPos ? '+' : ''}{r.total_pnl_percentage.toFixed(2)}%
                        </td>
                        <td className={`px-4 py-3 text-right font-mono ${mddRisk ? 'text-orange-400' : 'text-gray-400'}`}>
                          {r.max_drawdown_percentage.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">
                          {r.total_trades.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500 font-mono text-[10px]">
                          <span className="text-green-500">{r.tp_pct ?? '—'}</span>
                          {' / '}
                          <span className="text-blue-400">{r.tp2_pct ?? '—'}</span>
                          {' / '}
                          <span className="text-red-400">{r.sl_pct ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600 text-[10px]">
                          {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length === 0 && !loadingRows && (
            <div className="py-16 text-center text-gray-600">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-sm">No optimization results yet.</p>
              <p className="text-xs mt-1">Click <strong className="text-brand">Run Full Optimization</strong> to start.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-4 text-[10px] text-gray-600 px-1">
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5" />PnL Positive</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" />PnL Negative</span>
          <span><span className="inline-block px-1.5 py-0.5 rounded bg-green-900/30 text-green-400 mr-1">60%+</span>Strong Win Rate</span>
          <span><span className="inline-block px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-400 mr-1">50-60%</span>OK Win Rate</span>
          <span><span className="text-orange-400 mr-1">DD&gt;15%</span>High Drawdown Risk</span>
          <span className="text-gray-700">TP1 / TP2 / SL = optimized take-profit and stop-loss %</span>
        </div>
      )}
    </div>
  )
}
