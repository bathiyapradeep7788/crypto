'use client'
import { useState, useEffect, useMemo } from 'react'
import TabBar                 from '@/components/layout/TabBar'
import CoinSelector           from '@/components/backtest/CoinSelector'
import StrategySelector       from '@/components/backtest/StrategySelector'
import StrategyParams         from '@/components/backtest/StrategyParams'
import ResultsTable           from '@/components/backtest/ResultsTable'
import { useBacktestCtx }     from '@/context/BacktestContext'
import { listCombined }       from '@/lib/api'
import { CombinedStrategy }   from '@/types'
import { DEFAULT_PARAMS, INTERVALS, COINS, COIN_BEST_SETTINGS } from '@/lib/constants'

function Toggle({ label, sub, checked, onChange }: {
  label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-surface-border'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <div>
        <p className="text-sm text-gray-200 group-hover:text-white transition-colors">{label}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </label>
  )
}

const GRADE_COLOR: Record<string, string> = {
  A: 'text-green-400 border-green-600/40 bg-green-900/10',
  B: 'text-brand border-brand/40 bg-brand/5',
  C: 'text-yellow-400 border-yellow-600/40 bg-yellow-900/10',
  D: 'text-red-400 border-red-600/40 bg-red-900/10',
}
function grade(wr: number) {
  if (wr >= 58) return 'A'
  if (wr >= 50) return 'B'
  if (wr >= 45) return 'C'
  return 'D'
}

export default function BacktestPage() {
  const { run, runPerCoin, stop, status, progress, results, error } = useBacktestCtx()

  // Smart Mode state
  const [smartMode,    setSmartMode]    = useState(true)
  const [smartCoins,   setSmartCoins]   = useState<string[]>(COINS.slice())

  // Normal mode state
  const [coins,       setCoins]       = useState<string[]>(['BTCUSDT', 'ETHUSDT'])
  const [strategies,  setStrategies]  = useState<string[]>(['rsi_macd'])
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [combined,    setCombined]    = useState<CombinedStrategy[]>([])
  const [minConfluence, setMinConfluence] = useState(1)

  // Shared
  const [startDt,  setStartDt]  = useState('2024-01-01T00:00')
  const [endDt,    setEndDt]    = useState('2024-12-31T00:00')
  const [interval, setInterval] = useState('1h')
  const [tpPct,    setTpPct]    = useState(2.0)
  const [tp2Pct,   setTp2Pct]   = useState(4.0)
  const [slPct,    setSlPct]    = useState(1.5)

  // Smart Filter (shared)
  const [useTrendFilter,   setUseTrendFilter]   = useState(true)
  const [trendEmaPeriod,   setTrendEmaPeriod]   = useState(200)
  const [useSessionFilter, setUseSessionFilter] = useState(true)
  const [useAtrTpSl,       setUseAtrTpSl]       = useState(false)
  const [atrTpMult,        setAtrTpMult]        = useState(2.0)
  const [atrSlMult,        setAtrSlMult]        = useState(1.0)

  useEffect(() => { listCombined().then(setCombined).catch(() => {}) }, [])

  const paramStrategyIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of strategies) {
      if (s.startsWith('combo_')) {
        const c = combined.find(x => `combo_${x.id}` === s)
        if (c) {
          const mem = c.members?.length ? c.members : [c.strategy_a, c.strategy_b].filter(Boolean)
          mem.forEach(m => ids.add(m))
        }
      } else { ids.add(s) }
    }
    return Array.from(ids)
  }, [strategies, combined])

  const setParam = (key: string, val: number) =>
    setParamValues(prev => ({ ...prev, [key]: val }))

  const buildParams = () => {
    const out: { key: string; value: number }[] = []
    const seen = new Set<string>()
    for (const id of paramStrategyIds) {
      for (const f of DEFAULT_PARAMS[id] ?? []) {
        if (seen.has(f.key)) continue
        seen.add(f.key)
        out.push({ key: f.key, value: paramValues[f.key] ?? f.default })
      }
    }
    return out
  }

  const baseConfig = {
    start_dt: new Date(startDt).toISOString(),
    end_dt:   new Date(endDt).toISOString(),
    params:   buildParams(),
    tp_pct:   tpPct, tp2_pct: tp2Pct, sl_pct: slPct,
    interval,
    use_trend_filter:   useTrendFilter,
    trend_ema_period:   trendEmaPeriod,
    use_session_filter: useSessionFilter,
    use_atr_tp_sl:      useAtrTpSl,
    atr_tp_mult:        atrTpMult,
    atr_sl_mult:        atrSlMult,
  }

  const handleRun = () => {
    if (smartMode) {
      if (smartCoins.length === 0) return alert('Select at least one coin')
      runPerCoin(smartCoins, baseConfig)
    } else {
      if (coins.length === 0) return alert('Select at least one coin')
      if (strategies.length === 0) return alert('Select at least one strategy')
      run({ ...baseConfig, coins, strategies, min_confluence: minConfluence })
    }
  }

  const isRunning = status === 'running'
  const activeFilterCount = [useTrendFilter, useSessionFilter, useAtrTpSl].filter(Boolean).length

  const toggleSmartCoin = (c: string) =>
    setSmartCoins(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Backtest Bot</h1>
            <p className="text-xs text-gray-500 mt-0.5">Simulate strategies against historical Binance data</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Smart Mode toggle */}
            <div className="flex items-center gap-2 bg-surface-card border border-surface-border rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400">Manual</span>
              <div onClick={() => setSmartMode(!smartMode)}
                className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${smartMode ? 'bg-brand' : 'bg-gray-700'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${smartMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className={`text-xs font-semibold ${smartMode ? 'text-brand' : 'text-gray-400'}`}>Smart Mode</span>
            </div>
            {isRunning && (
              <div className="flex items-center gap-2 text-sm text-brand">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                {smartMode
                  ? `${progress.currentCoin ?? '...'} (${progress.processed}/${progress.total} coins)`
                  : `${progress.processed}/${progress.total} strategies`
                }
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Left panel */}
          <div className="col-span-4 space-y-4">

            {/* Date range */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Date Range</h3>
              {[
                { label: 'Start', value: startDt, set: setStartDt },
                { label: 'End',   value: endDt,   set: setEndDt   },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input type="datetime-local" value={value} onChange={e => set(e.target.value)}
                    className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Interval</label>
                <select value={interval} onChange={e => setInterval(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand">
                  {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
              {/* TP/SL */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'TP1 %', val: tpPct,  set: setTpPct  },
                  { label: 'TP2 %', val: tp2Pct, set: setTp2Pct },
                  { label: 'SL %',  val: slPct,  set: setSlPct  },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                    <input type="number" step="0.1" value={f.val} onChange={e => f.set(parseFloat(e.target.value))}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                  </div>
                ))}
              </div>
            </div>

            {/* Smart Filters */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300">Smart Filters</h3>
                {activeFilterCount > 0 && (
                  <span className="text-xs bg-brand/20 text-brand px-2 py-0.5 rounded-full font-semibold">{activeFilterCount} active</span>
                )}
              </div>

              <Toggle label="Trend Filter (EMA)" sub="Only trade in direction of EMA trend"
                checked={useTrendFilter} onChange={setUseTrendFilter} />
              {useTrendFilter && (
                <div className="ml-12 space-y-1">
                  <label className="text-xs text-gray-500">EMA Period</label>
                  <div className="flex items-center gap-2">
                    {[50, 100, 200].map(v => (
                      <button key={v} onClick={() => setTrendEmaPeriod(v)}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                          trendEmaPeriod === v ? 'bg-brand text-black' : 'bg-surface text-gray-400 hover:text-white border border-surface-border'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Toggle label="Session Filter (UTC 08-20)" sub="London + NY overlap only"
                checked={useSessionFilter} onChange={setUseSessionFilter} />

              <Toggle label="ATR-based TP / SL" sub="Dynamic targets adapting to volatility"
                checked={useAtrTpSl} onChange={setUseAtrTpSl} />
              {useAtrTpSl && (
                <div className="ml-12 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">TP mult (xATR)</label>
                    <input type="number" step="0.5" min="0.5" max="10" value={atrTpMult}
                      onChange={e => setAtrTpMult(Number(e.target.value))}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-brand" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">SL mult (xATR)</label>
                    <input type="number" step="0.5" min="0.5" max="5" value={atrSlMult}
                      onChange={e => setAtrSlMult(Number(e.target.value))}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-brand" />
                  </div>
                </div>
              )}

              {/* Confluence — only in manual mode */}
              {!smartMode && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm text-gray-200">Confluence Votes</p>
                      <p className="text-xs text-gray-500 mt-0.5">Strategies that must agree</p>
                    </div>
                    <span className={`text-sm font-bold font-mono px-2 py-0.5 rounded ${minConfluence > 1 ? 'bg-brand/20 text-brand' : 'bg-surface text-gray-400'}`}>
                      {minConfluence === 1 ? 'OFF' : `>= ${minConfluence}`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {[1,2,3,4].map(v => (
                      <button key={v} onClick={() => setMinConfluence(v)}
                        className={`flex-1 py-1.5 rounded text-xs font-semibold transition-colors ${minConfluence === v ? 'bg-brand text-black' : 'bg-surface text-gray-400 hover:text-white border border-surface-border'}`}>
                        {v === 1 ? 'Off' : `${v} agree`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {smartMode && (
                <p className="text-xs text-brand/70">Smart Mode: confluence auto-set per coin from backtest results</p>
              )}
            </div>

            {/* Coin selector */}
            {!smartMode && <CoinSelector selected={coins} onChange={setCoins} />}
          </div>

          {/* Right panel */}
          <div className="col-span-8 space-y-4">

            {smartMode ? (
              /* ── SMART MODE: per-coin grid ── */
              <div className="bg-surface-card border border-surface-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-200">Coin Selection — Smart Mode</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Each coin uses its own best strategy combo. Click to toggle.</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSmartCoins(COINS.slice())}
                      className="text-xs px-3 py-1 rounded bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20 transition-colors">
                      All 20
                    </button>
                    <button onClick={() => setSmartCoins([])}
                      className="text-xs px-3 py-1 rounded bg-surface border border-surface-border text-gray-400 hover:text-white transition-colors">
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {COINS.map(c => {
                    const s    = COIN_BEST_SETTINGS[c]
                    const sel  = smartCoins.includes(c)
                    const g    = s ? grade(s.win_rate) : 'D'
                    const gc   = GRADE_COLOR[g]
                    return (
                      <div key={c} onClick={() => toggleSmartCoin(c)}
                        className={`cursor-pointer rounded-lg p-3 border transition-all ${
                          sel ? 'border-brand bg-brand/5' : 'border-surface-border hover:border-gray-500 opacity-50'}`}>
                        <div className="flex items-start justify-between">
                          <p className="text-xs font-bold text-white">{c.replace('USDT','')}</p>
                          <span className={`text-xs font-black px-1 rounded border ${gc}`}>{g}</span>
                        </div>
                        {s ? (
                          <>
                            <p className="text-xs text-green-400 mt-1">{s.win_rate}% WR</p>
                            <p className="text-xs text-gray-500">+{s.total_pnl}% PnL</p>
                            <p className="text-xs text-gray-600 mt-1 truncate">{s.strategies.slice(0,2).join('+').replace(/_/g,' ')}</p>
                            <p className="text-xs text-gray-600">conf={s.confluence}</p>
                          </>
                        ) : (
                          <p className="text-xs text-gray-600 mt-1">No data</p>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-600 mt-3">
                  {smartCoins.length} coins selected — backtest runs coin-by-coin with best strategies automatically
                </p>
              </div>
            ) : (
              /* ── MANUAL MODE ── */
              <>
                <StrategySelector selected={strategies} onChange={setStrategies} />
                <StrategyParams
                  strategyIds={paramStrategyIds} values={paramValues} onChange={setParam}
                  tpPct={tpPct} tp2Pct={tp2Pct} slPct={slPct}
                  onTp={setTpPct} onTp2={setTp2Pct} onSl={setSlPct}
                />
              </>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
            )}

            <div className="flex gap-3">
              <button onClick={handleRun} disabled={isRunning}
                className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
                  isRunning ? 'bg-surface-border text-gray-500 cursor-not-allowed' : 'bg-brand hover:bg-brand-dark text-black'}`}>
                {isRunning
                  ? (smartMode
                      ? `Running ${progress.currentCoin ?? '...'} (${progress.processed}/${progress.total})`
                      : `Running... (${progress.processed}/${progress.total})`)
                  : smartMode
                    ? `Run Smart Backtest (${smartCoins.length} coins)`
                    : `Run Backtest${activeFilterCount > 0 ? ` (${activeFilterCount} filter${activeFilterCount>1?'s':''})` : ''}`
                }
              </button>
              {isRunning && (
                <button onClick={stop}
                  className="px-6 py-3 rounded-lg font-semibold text-sm bg-red-600 hover:bg-red-700 text-white transition-all">
                  Stop
                </button>
              )}
            </div>

            {(status === 'done' || (status === 'idle' && results.length > 0)) && <ResultsTable results={results} />}
          </div>
        </div>
      </main>
    </div>
  )
}
