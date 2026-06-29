'use client'
import { useState, useEffect, useCallback } from 'react'
import { STRATEGY_LABELS } from '@/lib/constants'

// ── Constants ──────────────────────────────────────────────────

const OPT_COINS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','DOGEUSDT',
  'MATICUSDT','UNIUSDT','LTCUSDT','APTUSDT','SUIUSDT',
  'NEARUSDT','OPUSDT','ARBUSDT','INJUSDT','TIAUSDT',
]

const PAGE_DELAY   = 350    // ms between Binance pagination calls
const RETRY_DELAY  = 62_000 // ms to wait on rate-limit (429)
const MAX_PAGES    = 22     // safety cap per coin (~22k candles max)

// ── Types ──────────────────────────────────────────────────────

type GlobalPhase = 'idle' | 'step1' | 'step2' | 'step3' | 'done' | 'error'

type CoinState = {
  coin:        string
  fetchPct:    number    // 0-100 candle fetch progress
  fetchDone:   boolean
  stratDone:   boolean
  winRate?:    number
  pnl?:        number
  strategy?:   string
  error?:      string
}

type BestRow = {
  coin:                    string
  best_strategy_name:      string
  win_rate_percentage:     number
  total_pnl_percentage:    number
  max_drawdown_percentage: number
  total_trades:            number
  tp_pct:                  number
  tp2_pct:                 number
  sl_pct:                  number
  updated_at:              string
}

// ── Helpers ────────────────────────────────────────────────────

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchCoinCandles(
  coin: string,
  isFirst: boolean,
  onProgress: (pct: number) => void
): Promise<void> {
  let since = 0
  let pages = 0

  while (pages < MAX_PAGES) {
    const qs = new URLSearchParams({
      coin,
      since:  String(since),
      ...(isFirst && pages === 0 ? { reset: 'true' } : {}),
    })

    const res = await fetch(`/api/optimize/fetch-candles?${qs}`)

    // Rate-limit: wait 62s and retry same page
    if (res.status === 429) {
      onProgress(-1)   // signal "rate limited" to UI
      await wait(RETRY_DELAY)
      continue
    }

    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error ?? `HTTP ${res.status}`)
    }

    const j = await res.json()
    onProgress(j.progress ?? 0)

    if (j.done || !j.nextSince) break
    since = j.nextSince
    pages++
    await wait(PAGE_DELAY)
  }
}

async function runCoinStrategies(coin: string): Promise<{
  pnl: number; winRate: number; strategy: string
}> {
  const res = await fetch(`/api/optimize/run-coin?coin=${coin}`)
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j.error ?? `HTTP ${res.status}`)
  }
  const j = await res.json()
  return {
    pnl:      j.best?.total_pnl ?? 0,
    winRate:  j.best?.win_rate  ?? 0,
    strategy: j.best?.label     ?? '—',
  }
}

async function loadResults(): Promise<BestRow[]> {
  const res = await fetch('/api/optimize/results')
  if (!res.ok) return []
  const j = await res.json()
  return j.rows ?? []
}

// ── Coin Badge ──────────────────────────────────────────────────

function CoinBadge({ cs, active }: { cs: CoinState; active: boolean }) {
  const base = 'text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold border transition-all'
  const cls =
    active          ? `${base} bg-brand/25 border-brand/60 text-brand animate-pulse` :
    cs.error        ? `${base} bg-red-900/20 border-red-700/40 text-red-400` :
    cs.stratDone    ? `${base} bg-green-900/20 border-green-700/30 text-green-400` :
    cs.fetchDone    ? `${base} bg-blue-900/20 border-blue-700/30 text-blue-400` :
                      `${base} bg-surface border-surface-border text-gray-600`
  const suffix =
    active       ? ' ⟳' :
    cs.error     ? ' ✗' :
    cs.stratDone ? ' ✓' :
    cs.fetchDone ? ' ◑' : ''

  return (
    <span className={cls} title={cs.error}>
      {cs.coin.replace('USDT', '')}{suffix}
    </span>
  )
}

// ── Step Indicator ──────────────────────────────────────────────

function StepBar({ phase }: { phase: GlobalPhase }) {
  const steps = [
    { id: 'step1', label: 'Step 1 / 3', desc: 'Clear DB & Fetch 5-Month Candles' },
    { id: 'step2', label: 'Step 2 / 3', desc: 'Run 10 Strategies + TP/SL Grid' },
    { id: 'step3', label: 'Step 3 / 3', desc: 'Render Final Report' },
  ]
  const order: Record<string, number> = { idle: -1, step1: 0, step2: 1, step3: 2, done: 3, error: 3 }
  const cur = order[phase] ?? -1

  return (
    <div className="flex items-center gap-0 w-full">
      {steps.map((s, i) => {
        const done    = cur > i
        const active  = cur === i
        const pending = cur < i
        return (
          <div key={s.id} className="flex items-center flex-1">
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg flex-1 border transition-all ${
              active  ? 'bg-brand/10 border-brand/40 text-brand' :
              done    ? 'bg-green-900/15 border-green-700/30 text-green-400' :
                        'bg-surface border-surface-border text-gray-600'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                active  ? 'bg-brand text-black' :
                done    ? 'bg-green-600 text-white' :
                          'bg-surface-border text-gray-500'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <div>
                <div className="text-[10px] font-semibold leading-tight">{s.label}</div>
                <div className={`text-[9px] leading-tight ${active ? 'text-brand/80' : done ? 'text-green-500/70' : 'text-gray-600'}`}>
                  {s.desc}
                </div>
              </div>
              {active && (
                <svg className="animate-spin w-3.5 h-3.5 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px w-3 flex-shrink-0 ${cur > i ? 'bg-green-600' : 'bg-surface-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────

export default function OptimizationDashboard() {
  const [phase,       setPhase]       = useState<GlobalPhase>('idle')
  const [coinMap,     setCoinMap]     = useState<Record<string, CoinState>>({})
  const [activeCoin,  setActiveCoin]  = useState<string | null>(null)
  const [fetchPct,    setFetchPct]    = useState(0)
  const [rateLimited, setRateLimited] = useState(false)
  const [step1Done,   setStep1Done]   = useState(0)   // coins with fetch done
  const [step2Done,   setStep2Done]   = useState(0)   // coins with strat done
  const [results,     setResults]     = useState<BestRow[]>([])
  const [loadingDB,   setLoadingDB]   = useState(false)
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null)

  // Load saved results on mount
  useEffect(() => { refreshResults() }, [])

  async function refreshResults() {
    setLoadingDB(true)
    const rows = await loadResults()
    setResults(rows)
    setLoadingDB(false)
  }

  const runOptimization = useCallback(async () => {
    // ── Reset UI state ──────────────────────────────────────────
    setPhase('step1')
    setErrorMsg(null)
    setStep1Done(0)
    setStep2Done(0)
    setFetchPct(0)
    setRateLimited(false)

    const initial: Record<string, CoinState> = {}
    OPT_COINS.forEach(c => { initial[c] = { coin: c, fetchPct: 0, fetchDone: false, stratDone: false } })
    setCoinMap(initial)

    // ════════════════════════════════════════════════════════════
    //  STEP 1: Clear DB + Fetch 5-month candles for all 20 coins
    // ════════════════════════════════════════════════════════════
    for (let i = 0; i < OPT_COINS.length; i++) {
      const coin    = OPT_COINS[i]
      const isFirst = i === 0   // only first call sends reset=true → clears DB

      setActiveCoin(coin)
      setFetchPct(0)

      try {
        await fetchCoinCandles(coin, isFirst, pct => {
          if (pct === -1) {
            setRateLimited(true)
          } else {
            setRateLimited(false)
            setFetchPct(pct)
            setCoinMap(prev => ({
              ...prev,
              [coin]: { ...prev[coin], fetchPct: pct },
            }))
          }
        })

        setCoinMap(prev => ({
          ...prev,
          [coin]: { ...prev[coin], fetchDone: true, fetchPct: 100 },
        }))
        setStep1Done(i + 1)
      } catch (e: any) {
        setCoinMap(prev => ({
          ...prev,
          [coin]: { ...prev[coin], fetchDone: true, error: `Fetch: ${e.message}` },
        }))
        setStep1Done(i + 1)
        // Non-fatal: continue with next coin
      }
    }

    setActiveCoin(null)

    // ════════════════════════════════════════════════════════════
    //  STEP 2: Run 10 strategies on stored candles — all 20 coins
    // ════════════════════════════════════════════════════════════
    setPhase('step2')

    for (let i = 0; i < OPT_COINS.length; i++) {
      const coin = OPT_COINS[i]
      const cs   = coinMap[coin]

      // Skip coins that failed in Step 1
      if (cs?.error && !cs.fetchDone) {
        setStep2Done(i + 1)
        continue
      }

      setActiveCoin(coin)

      try {
        const { pnl, winRate, strategy } = await runCoinStrategies(coin)
        setCoinMap(prev => ({
          ...prev,
          [coin]: { ...prev[coin], stratDone: true, pnl, winRate, strategy },
        }))
      } catch (e: any) {
        setCoinMap(prev => ({
          ...prev,
          [coin]: { ...prev[coin], stratDone: true, error: `Strat: ${e.message}` },
        }))
      }
      setStep2Done(i + 1)
    }

    setActiveCoin(null)

    // ════════════════════════════════════════════════════════════
    //  STEP 3: Load final results from Supabase → render table
    // ════════════════════════════════════════════════════════════
    setPhase('step3')
    await wait(400)   // brief pause so user sees "Step 3" flash

    const rows = await loadResults()
    setResults(rows)
    setPhase('done')
  }, [coinMap])

  // ── Derived stats ─────────────────────────────────────────────
  const total      = OPT_COINS.length
  const s1Pct      = Math.round((step1Done / total) * 100)
  const s2Pct      = Math.round((step2Done / total) * 100)
  const isRunning  = phase === 'step1' || phase === 'step2' || phase === 'step3'

  const avgWR      = results.length ? results.reduce((s, r) => s + r.win_rate_percentage, 0) / results.length : 0
  const totalPnl   = results.reduce((s, r) => s + r.total_pnl_percentage, 0)
  const profitable = results.filter(r => r.total_pnl_percentage > 0).length

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Control Panel ───────────────────────────────────── */}
      <div className="bg-surface-card border border-surface-border rounded-xl p-5 space-y-4">

        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white">Top Strategies Optimization</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              20 coins × 10 strategies × TP/SL grid — 5-month 15m data · auto-clears DB before each run
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={runOptimization}
              disabled={isRunning}
              className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                isRunning
                  ? 'bg-surface-border text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-brand to-blue-500 text-black shadow-lg shadow-brand/20 hover:opacity-90'
              }`}>
              {isRunning ? '⟳ Running…' : '🚀 Run Full Optimization'}
            </button>
            {!isRunning && (
              <button
                onClick={refreshResults}
                disabled={loadingDB}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-surface border border-surface-border text-gray-400 hover:text-white transition-all">
                {loadingDB ? '⟳' : '↻ Refresh'}
              </button>
            )}
          </div>
        </div>

        {/* Step bar — always visible during run */}
        {(isRunning || phase === 'done') && (
          <StepBar phase={phase} />
        )}

        {/* ── Step 1 progress ─────────────────────────────────── */}
        {phase === 'step1' && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">
                {step1Done === 0
                  ? <span className="text-yellow-400 font-medium">🗑 Clearing old DB data…</span>
                  : <>
                      Fetching <span className="text-brand font-mono font-bold">{activeCoin?.replace('USDT','')}</span>
                      {rateLimited
                        ? <span className="text-orange-400 ml-2">⏳ Rate limited — waiting 60s…</span>
                        : <span className="text-gray-600 ml-2">page {fetchPct}% done</span>}
                    </>
                }
              </span>
              <span className="text-brand font-semibold">{step1Done} / {total} coins</span>
            </div>
            {/* Overall coin progress */}
            <div className="w-full bg-surface rounded-full h-2.5 overflow-hidden">
              <div
                className="h-2.5 rounded-full bg-gradient-to-r from-brand to-blue-500 transition-all duration-500"
                style={{ width: `${s1Pct}%` }}
              />
            </div>
            {/* Current coin page progress */}
            {activeCoin && !rateLimited && (
              <div className="w-full bg-surface rounded-full h-1 overflow-hidden">
                <div
                  className="h-1 rounded-full bg-blue-400/50 transition-all duration-300"
                  style={{ width: `${fetchPct}%` }}
                />
              </div>
            )}
            <p className="text-[10px] text-gray-600">
              Fetching ~14,400 candles per coin (1000 per request) · rate-limit safe · saved to Supabase
            </p>
          </div>
        )}

        {/* ── Step 2 progress ─────────────────────────────────── */}
        {phase === 'step2' && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">
                Analysing <span className="text-brand font-mono font-bold">{activeCoin?.replace('USDT','') ?? '…'}</span>
                <span className="text-gray-600 ml-2">10 strategies + TP/SL grid</span>
              </span>
              <span className="text-green-400 font-semibold">{step2Done} / {total} coins</span>
            </div>
            <div className="w-full bg-surface rounded-full h-2.5 overflow-hidden">
              <div
                className="h-2.5 rounded-full bg-gradient-to-r from-green-600 to-emerald-400 transition-all duration-500"
                style={{ width: `${s2Pct}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-600">
              36 TP/SL combos × 10 strategies per coin · best result (MDD &lt; 20%) saved to Supabase
            </p>
          </div>
        )}

        {/* ── Step 3 ─────────────────────────────────────────── */}
        {phase === 'step3' && (
          <div className="flex items-center gap-3 text-sm text-blue-400 py-1">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Loading final results from database…
          </div>
        )}

        {/* ── Done ──────────────────────────────────────────── */}
        {phase === 'done' && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <span className="text-lg">✅</span>
            <span>Optimization complete — {results.length} coins analysed and saved to Supabase</span>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────── */}
        {errorMsg && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3 text-sm text-red-400">
            {errorMsg}
          </div>
        )}

        {/* ── Coin badge grid ────────────────────────────────── */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {OPT_COINS.map(coin => (
            <CoinBadge
              key={coin}
              cs={coinMap[coin] ?? { coin, fetchPct: 0, fetchDone: false, stratDone: false }}
              active={activeCoin === coin}
            />
          ))}
        </div>
        {isRunning && (
          <div className="flex gap-4 text-[10px] text-gray-600">
            <span><span className="text-brand mr-1">⟳</span>Active</span>
            <span><span className="text-blue-400 mr-1">◑</span>Candles fetched</span>
            <span><span className="text-green-400 mr-1">✓</span>Strategy done</span>
            <span><span className="text-red-400 mr-1">✗</span>Error</span>
          </div>
        )}
      </div>

      {/* ── Summary Cards ──────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Coins Optimized',  value: `${results.length}`,                         color: 'text-brand'      },
            { label: 'Avg Win Rate',     value: `${avgWR.toFixed(1)}%`,                      color: 'text-yellow-400' },
            { label: 'Profitable Coins', value: `${profitable} / ${results.length}`,          color: 'text-green-400'  },
            {
              label: 'Combined PnL',
              value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}%`,
              color: totalPnl >= 0 ? 'text-green-400' : 'text-red-400',
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-surface-card border border-surface-border rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Results Table ──────────────────────────────────────── */}
      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-surface-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            Best Strategy Per Coin
            <span className="ml-2 text-xs text-gray-500 font-normal">(sorted by Total PnL)</span>
          </h3>
          {results.length > 0 && (
            <span className="text-xs text-gray-500">{results.length} coins</span>
          )}
        </div>

        {loadingDB ? (
          <div className="flex items-center justify-center py-12 gap-2 text-sm text-gray-500">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Loading results…
          </div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-5xl mb-4 opacity-30">📊</div>
            <p className="text-sm text-gray-500">No optimization results yet.</p>
            <p className="text-xs text-gray-600 mt-1">
              Click <span className="text-brand font-semibold">🚀 Run Full Optimization</span> to start.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-surface-border bg-surface/40">
                  <th className="px-4 py-3 text-left font-medium w-8">#</th>
                  <th className="px-4 py-3 text-left font-medium">Coin</th>
                  <th className="px-4 py-3 text-left font-medium">Best Strategy</th>
                  <th className="px-4 py-3 text-right font-medium">Win Rate</th>
                  <th className="px-4 py-3 text-right font-medium">Total PnL %</th>
                  <th className="px-4 py-3 text-right font-medium">Max DD %</th>
                  <th className="px-4 py-3 text-right font-medium">Trades</th>
                  <th className="px-4 py-3 text-center font-medium">TP1 / TP2 / SL</th>
                  <th className="px-4 py-3 text-center font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => {
                  const pos     = r.total_pnl_percentage >= 0
                  const wrGood  = r.win_rate_percentage >= 60
                  const wrOk    = r.win_rate_percentage >= 50
                  const mddHigh = r.max_drawdown_percentage > 15
                  const label   = STRATEGY_LABELS[r.best_strategy_name] ?? r.best_strategy_name

                  return (
                    <tr key={r.coin}
                      className="border-b border-surface-border hover:bg-surface/50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 font-mono">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pos ? 'bg-green-500' : 'bg-red-500'}`} />
                          <span className="font-bold font-mono text-white text-sm">
                            {r.coin.replace('USDT', '')}
                          </span>
                          <span className="text-gray-600 text-[10px]">/USDT</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-brand font-medium">{label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                          wrGood ? 'bg-green-900/30 text-green-400' :
                          wrOk   ? 'bg-yellow-900/30 text-yellow-400' :
                                   'bg-red-900/20 text-red-400'
                        }`}>
                          {r.win_rate_percentage.toFixed(1)}%
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold font-mono text-sm ${pos ? 'text-green-400' : 'text-red-400'}`}>
                        {pos ? '+' : ''}{r.total_pnl_percentage.toFixed(2)}%
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${mddHigh ? 'text-orange-400' : 'text-gray-400'}`}>
                        {r.max_drawdown_percentage.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {r.total_trades.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[10px]">
                        <span className="text-green-500">{r.tp_pct ?? '—'}</span>
                        <span className="text-gray-600"> / </span>
                        <span className="text-blue-400">{r.tp2_pct ?? '—'}</span>
                        <span className="text-gray-600"> / </span>
                        <span className="text-red-400">{r.sl_pct ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600 text-[10px]">
                        {r.updated_at ? new Date(r.updated_at).toLocaleDateString('en-GB') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Legend ─────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-gray-600 px-1">
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5 align-middle" />PnL Positive</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5 align-middle" />PnL Negative</span>
          <span><span className="text-green-400 mr-1">60%+</span>Strong Win Rate</span>
          <span><span className="text-yellow-400 mr-1">50–60%</span>OK Win Rate</span>
          <span><span className="text-orange-400 mr-1">DD &gt; 15%</span>High Drawdown Risk</span>
          <span className="text-gray-700">TP1/TP2/SL = optimized take-profit & stop-loss %</span>
        </div>
      )}
    </div>
  )
}
