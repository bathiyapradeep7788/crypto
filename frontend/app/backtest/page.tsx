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

export default function BacktestPage() {
  const { run, status, progress, results, error } = useBacktestCtx()

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

  // Keep a map of combined strategies so we can expand a combo into its two
  // underlying built-in strategies (for showing their parameters).
  useEffect(() => { listCombined().then(setCombined).catch(() => {}) }, [])

  // Every built-in strategy whose params should be shown/edited: each selected
  // built-in, plus the two sub-strategies of every selected combined strategy.
  const paramStrategyIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of strategies) {
      if (s.startsWith('combo_')) {
        const c = combined.find(x => `combo_${x.id}` === s)
        if (c) { ids.add(c.strategy_a); ids.add(c.strategy_b) }
      } else {
        ids.add(s)
      }
    }
    return Array.from(ids)
  }, [strategies, combined])

  const setParam = (key: string, val: number) =>
    setParamValues(prev => ({ ...prev, [key]: val }))

  // Send edited params for every involved strategy (flat key/value list).
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
    })
  }

  const isRunning = status === 'running'

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

            <button
              onClick={handleRun}
              disabled={isRunning}
              className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${
                isRunning
                  ? 'bg-surface-border text-gray-500 cursor-not-allowed'
                  : 'bg-brand hover:bg-brand-dark text-black'
              }`}
            >
              {isRunning ? `Running... (${progress.processed}/${progress.total})` : '▶ Run Backtest'}
            </button>

            {status === 'done' && <ResultsTable results={results} />}
          </div>
        </div>
      </main>
    </div>
  )
}
