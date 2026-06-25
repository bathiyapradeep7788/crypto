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
import { DEFAULT_PARAMS, INTERVALS } from '@/lib/constants'

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

export default function BacktestPage() {
  const { run, stop, status, progress, results, error } = useBacktestCtx()

  const [coins,       setCoins]       = useState<string[]>(['BTCUSDT', 'ETHUSDT'])
  const [startDt,     setStartDt]     = useState('2024-01-01T00:00')
  const [endDt,       setEndDt]       = useState('2024-06-01T00:00')
  const [interval,    setInterval]    = useState('1h')
  const [strategies,  setStrategies]  = useState<string[]>(['rsi_macd'])
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [combined,    setCombined]    = useState<CombinedStrategy[]>([])
  const [tpPct,  setTpPct]  = useState(2.0)
  const [tp2Pct, setTp2Pct] = useState(4.0)
  const [slPct,  setSlPct]  = useState(1.5)

  // Smart Filter state
  const [useTrendFilter,   setUseTrendFilter]   = useState(false)
  const [trendEmaPeriod,   setTrendEmaPeriod]   = useState(200)
  const [useSessionFilter, setUseSessionFilter] = useState(false)
  const [useAtrTpSl,       setUseAtrTpSl]       = useState(false)
  const [atrTpMult,        setAtrTpMult]        = useState(2.0)
  const [atrSlMult,        setAtrSlMult]        = useState(1.0)
  const [minConfluence,    setMinConfluence]     = useState(1)

  useEffect(() => { listCombined().then(setCombined).catch(() => {}) }, [])

  const paramStrategyIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of strategies) {
      if (s.startsWith('combo_')) {
        const c = combined.find(x => `combo_${x.id}` === s)
        if (c) {
          const mem = c.members && c.members.length ? c.members : [c.strategy_a, c.strategy_b].filter(Boolean)
          mem.forEach(m => ids.add(m))
        }
      } else {
        ids.add(s)
      }
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

  const handleRun = () => {
    if (coins.length === 0) return alert('Select at least one coin')
    if (strategies.length === 0) return alert('Select at least one strategy')
    run({
      coins,
      start_dt: new Date(startDt).toISOString(),
      end_dt:   new Date(endDt).toISOString(),
      strategies,
      params:   buildParams(),
      tp_pct:   tpPct,
      tp2_pct:  tp2Pct,
      sl_pct:   slPct,
      interval,
      use_trend_filter:   useTrendFilter,
      trend_ema_period:   trendEmaPeriod,
      use_session_filter: useSessionFilter,
      use_atr_tp_sl:      useAtrTpSl,
      atr_tp_mult:        atrTpMult,
      atr_sl_mult:        atrSlMult,
      min_confluence:     minConfluence,
    })
  }

  const isRunning = status === 'running'
  const activeFilterCount = [useTrendFilter, useSessionFilter, useAtrTpSl, minConfluence > 1].filter(Boolean).length

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Backtest Bot</h1>
            <p className="text-xs text-gray-500 mt-0.5">Simulate strategies against historical Binance data</p>
          </div>
          {isRunning && (
            <div className="flex items-center gap-2 text-sm text-brand">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Processing {progress.processed}/{progress.total} runs...
            </div>
          )}
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
                  <input
                    type="datetime-local"
                    value={value}
                    onChange={e => set(e.target.value)}
                    className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Interval</label>
                <select
                  value={interval}
                  onChange={e => setInterval(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand"
                >
                  {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
            </div>

            {/* ── Smart Filters ──────────────────────────────── */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300">Smart Filters</h3>
                {activeFilterCount > 0 && (
                  <span className="text-xs bg-brand/20 text-brand px-2 py-0.5 rounded-full font-semibold">
                    {activeFilterCount} active
                  </span>
                )}
              </div>

              {/* Trend Filter */}
              <Toggle
                label="Trend Filter (EMA)"
                sub="Only trade in direction of EMA trend — removes counter-trend losses"
                checked={useTrendFilter}
                onChange={setUseTrendFilter}
              />
              {useTrendFilter && (
                <div className="ml-12 space-y-1">
                  <label className="text-xs text-gray-500">EMA Period</label>
                  <div className="flex items-center gap-2">
                    {[50, 100, 200].map(v => (
                      <button
                        key={v}
                        onClick={() => setTrendEmaPeriod(v)}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                          trendEmaPeriod === v ? 'bg-brand text-black' : 'bg-surface text-gray-400 hover:text-white border border-surface-border'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Session Filter */}
              <Toggle
                label="Session Filter (UTC 08–20)"
                sub="Only trade during London + NY overlap — highest liquidity window"
                checked={useSessionFilter}
                onChange={setUseSessionFilter}
              />

              {/* ATR TP/SL */}
              <Toggle
                label="ATR-based TP / SL"
                sub="Dynamic targets that adapt to current volatility instead of fixed %"
                checked={useAtrTpSl}
                onChange={setUseAtrTpSl}
              />
              {useAtrTpSl && (
                <div className="ml-12 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">TP multiplier (×ATR)</label>
                    <input
                      type="number" step="0.5" min="0.5" max="10"
                      value={atrTpMult}
                      onChange={e => setAtrTpMult(Number(e.target.value))}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">SL multiplier (×ATR)</label>
                    <input
                      type="number" step="0.5" min="0.5" max="5"
                      value={atrSlMult}
                      onChange={e => setAtrSlMult(Number(e.target.value))}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>
              )}

              {/* Confluence / Voting */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm text-gray-200">Confluence Votes</p>
                    <p className="text-xs text-gray-500 mt-0.5">How many strategies must agree before a signal fires</p>
                  </div>
                  <span className={`text-sm font-bold font-mono px-2 py-0.5 rounded ${
                    minConfluence > 1 ? 'bg-brand/20 text-brand' : 'bg-surface text-gray-400'
                  }`}>
                    {minConfluence === 1 ? 'OFF' : `≥ ${minConfluence}`}
                  </span>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(v => (
                    <button
                      key={v}
                      onClick={() => setMinConfluence(v)}
                      className={`flex-1 py-1.5 rounded text-xs font-semibold transition-colors ${
                        minConfluence === v
                          ? 'bg-brand text-black'
                          : 'bg-surface text-gray-400 hover:text-white border border-surface-border'
                      }`}
                    >
                      {v === 1 ? 'Off' : `${v} agree`}
                    </button>
                  ))}
                </div>
                {minConfluence > 1 && strategies.length < minConfluence && (
                  <p className="text-xs text-yellow-400 mt-2">
                    Select at least {minConfluence} strategies for voting to work
                  </p>
                )}
              </div>
            </div>

            <CoinSelector selected={coins} onChange={setCoins} />
          </div>

          {/* Right panel */}
          <div className="col-span-8 space-y-4">
            <StrategySelector
              selected={strategies}
              onChange={setStrategies}
            />

            <StrategyParams
              strategyIds={paramStrategyIds}
              values={paramValues}
              onChange={setParam}
              tpPct={tpPct} tp2Pct={tp2Pct} slPct={slPct}
              onTp={setTpPct} onTp2={setTp2Pct} onSl={setSlPct}
            />

            {error && (
              <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleRun}
                disabled={isRunning}
                className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${
                  isRunning
                    ? 'bg-surface-border text-gray-500 cursor-not-allowed'
                    : 'bg-brand hover:bg-brand-dark text-black'
                }`}
              >
                {isRunning
                  ? `Running... (${progress.processed}/${progress.total})`
                  : `▶ Run Backtest${activeFilterCount > 0 ? ` (${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} on)` : ''}`
                }
              </button>
              {isRunning && (
                <button
                  onClick={stop}
                  className="px-6 py-3 rounded-lg font-semibold text-sm bg-red-600 hover:bg-red-700 text-white transition-all"
                >
                  ⏹ Stop
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
