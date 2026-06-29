'use client'
import { useState } from 'react'
import TabBar from '@/components/layout/TabBar'
import CoinSelector from '@/components/backtest/CoinSelector'
import StrategySelector from '@/components/backtest/StrategySelector'
import StrategyParams from '@/components/backtest/StrategyParams'
import ResultsTable from '@/components/backtest/ResultsTable'
import OptimizationDashboard from '@/components/backtest/OptimizationDashboard'
import { useBacktest } from '@/hooks/useBacktest'
import { getBestPerCoin, optimizeAllCoins, OptimizeResult } from '@/lib/api'
import { DEFAULT_PARAMS, INTERVALS, COINS, STRATEGY_LABELS } from '@/lib/constants'
import { useErrorToast } from '@/hooks/useErrorToast'

type BestResult = {
  coin: string
  best_strategy: string
  best_strategy_label: string
  win_rate: number
  total_pnl_pct: number
  total_trades: number
  all_strategies: { strategy: string; win_rate: number; total_pnl_pct: number; total_trades: number }[]
}

export default function BacktestPage() {
  const { run, status, progress, results, error } = useBacktest()
  const { addToast } = useErrorToast()

  // Mode toggle
  const [mode, setMode] = useState<'manual' | 'best' | 'optimize'>('manual')

  // Manual mode state
  const [coins,       setCoins]       = useState<string[]>(['BTCUSDT', 'ETHUSDT'])
  const [startDt,     setStartDt]     = useState('2024-01-01T00:00')
  const [endDt,       setEndDt]       = useState('2024-06-01T00:00')
  const [interval,    setInterval]    = useState('15m')
  const [strategies,  setStrategies]  = useState<string[]>(['rsi_macd'])
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [tpPct,  setTpPct]  = useState(2.0)
  const [tp2Pct, setTp2Pct] = useState(4.0)
  const [slPct,  setSlPct]  = useState(1.5)

  // Best-strategy mode state
  const [bestCoins,    setBestCoins]    = useState<string[]>([...COINS])
  const [bestStartDt,  setBestStartDt]  = useState('2024-01-01T00:00')
  const [bestEndDt,    setBestEndDt]    = useState('2024-06-01T00:00')
  const [bestInterval, setBestInterval] = useState('15m')
  const [bestTpPct,    setBestTpPct]    = useState(2.0)
  const [bestTp2Pct,   setBestTp2Pct]  = useState(4.0)
  const [bestSlPct,    setBestSlPct]    = useState(1.5)
  const [bestLoading,   setBestLoading]   = useState(false)
  const [bestResults,   setBestResults]   = useState<BestResult[]>([])
  const [bestProgress,  setBestProgress]  = useState({ done: 0, total: 0 })
  const [expandedCoin,  setExpandedCoin]  = useState<string | null>(null)

  // Optimize & Save mode state
  const [optLoading,  setOptLoading]  = useState(false)
  const [optResults,  setOptResults]  = useState<OptimizeResult[]>([])
  const [optProgress, setOptProgress] = useState({ done: 0, total: 0 })
  const [optSaved,    setOptSaved]    = useState(false)

  const soloBuiltIn =
    strategies.length === 1 && !strategies[0].startsWith('combo_') ? strategies[0] : null

  const setParam = (key: string, val: number) =>
    setParamValues(prev => ({ ...prev, [key]: val }))

  const buildParams = () => {
    if (!soloBuiltIn) return []
    return (DEFAULT_PARAMS[soloBuiltIn] ?? []).map(f => ({ key: f.key, value: paramValues[f.key] ?? f.default }))
  }

  const handleRun = () => {
    if (!coins.length) return alert('Select at least one coin')
    if (!strategies.length) return alert('Select at least one strategy')
    run({ coins, start_dt: new Date(startDt).toISOString(), end_dt: new Date(endDt).toISOString(),
      strategies, params: buildParams(), tp_pct: tpPct, tp2_pct: tp2Pct, sl_pct: slPct, interval })
  }

  const handleBestRun = async (allCoins: boolean) => {
    const coinsToRun = allCoins ? [...COINS] : bestCoins
    if (!coinsToRun.length) { addToast('Select at least one coin', 'warning'); return }
    setBestLoading(true)
    setBestResults([])
    setBestProgress({ done: 0, total: coinsToRun.length })
    try {
      const data = await getBestPerCoin({
        coins:    coinsToRun,
        start_dt: new Date(bestStartDt).toISOString(),
        end_dt:   new Date(bestEndDt).toISOString(),
        interval: bestInterval,
        tp_pct:   bestTpPct,
        tp2_pct:  bestTp2Pct,
        sl_pct:   bestSlPct,
        onProgress: (done, total, result) => {
          setBestProgress({ done, total })
          setBestResults(prev => [...prev, result])
        },
      })
      if (data.results.some((r: any) => r.error)) {
        addToast('Some coins had errors — check results', 'warning')
      }
    } catch (e: any) { addToast(`Best-strategy error: ${e.message}`, 'error') }
    setBestLoading(false)
  }

  const handleOptimizeSave = async () => {
    const coinsToRun = [...COINS]
    setOptLoading(true)
    setOptResults([])
    setOptSaved(false)
    setOptProgress({ done: 0, total: coinsToRun.length })
    try {
      await optimizeAllCoins({
        coins:    coinsToRun,
        start_dt: new Date(bestStartDt).toISOString(),
        end_dt:   new Date(bestEndDt).toISOString(),
        interval: bestInterval,
        save:     true,
        onProgress: (done, total, result) => {
          setOptProgress({ done, total })
          setOptResults(prev => [...prev, result])
        },
      })
      setOptSaved(true)
    } catch (e: any) { addToast(`Optimise error: ${e.message}`, 'error') }
    setOptLoading(false)
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
          <div className="flex items-center gap-2">
            {isRunning && (
              <div className="flex items-center gap-2 text-sm text-brand mr-4">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                {progress.processed}/{progress.total} runs…
              </div>
            )}
            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-surface-border">
              <button onClick={() => setMode('manual')}
                className={`text-xs px-4 py-2 font-medium transition-colors ${mode==='manual' ? 'bg-brand text-black' : 'bg-surface-card text-gray-400 hover:text-white'}`}>
                Manual
              </button>
              <button onClick={() => setMode('best')}
                className={`text-xs px-4 py-2 font-medium transition-colors ${mode==='best' ? 'bg-brand text-black' : 'bg-surface-card text-gray-400 hover:text-white'}`}>
                ⭐ Find Best
              </button>
              <button onClick={() => setMode('optimize')}
                className={`text-xs px-4 py-2 font-medium transition-colors ${mode==='optimize' ? 'bg-gradient-to-r from-brand to-blue-500 text-black' : 'bg-surface-card text-gray-400 hover:text-white'}`}>
                🚀 Optimization
              </button>
            </div>
          </div>
        </div>

        {/* ── MANUAL MODE ── */}
        {mode === 'manual' && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-4 space-y-4">
              <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Date Range</h3>
                {[{label:'Start',value:startDt,set:setStartDt},{label:'End',value:endDt,set:setEndDt}].map(({label,value,set}) => (
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
              </div>
              <CoinSelector selected={coins} onChange={setCoins} />
            </div>

            <div className="col-span-8 space-y-4">
              <StrategySelector selected={strategies} onChange={setStrategies} />
              {!soloBuiltIn && (
                <p className="text-xs text-gray-500 italic px-1">
                  {strategies.length > 1 ? `Running ${strategies.length} strategies — each uses standard parameters.` : 'Combined/multiple — standard parameters used.'}
                </p>
              )}
              <StrategyParams strategyId={soloBuiltIn??''} values={paramValues} onChange={setParam}
                tpPct={tpPct} tp2Pct={tp2Pct} slPct={slPct} onTp={setTpPct} onTp2={setTp2Pct} onSl={setSlPct} />
              {error && (
                <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
              )}
              <button onClick={handleRun} disabled={isRunning}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${isRunning ? 'bg-surface-border text-gray-500 cursor-not-allowed' : 'bg-brand hover:bg-brand-dark text-black'}`}>
                {isRunning ? `Running… (${progress.processed}/${progress.total})` : '▶ Run Backtest'}
              </button>
              {status === 'done' && <ResultsTable results={results} />}
            </div>
          </div>
        )}

        {/* ── FIND BEST STRATEGY MODE ── */}
        {mode === 'best' && (
          <div className="space-y-4">
            {/* Config row */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-4 grid grid-cols-7 gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Start</label>
                <input type="datetime-local" value={bestStartDt} onChange={e => setBestStartDt(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">End</label>
                <input type="datetime-local" value={bestEndDt} onChange={e => setBestEndDt(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Interval</label>
                <select value={bestInterval} onChange={e => setBestInterval(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand">
                  {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">TP1%</label>
                <input type="number" step="0.5" value={bestTpPct} onChange={e => setBestTpPct(parseFloat(e.target.value))}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">TP2%</label>
                <input type="number" step="0.5" value={bestTp2Pct} onChange={e => setBestTp2Pct(parseFloat(e.target.value))}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">SL%</label>
                <input type="number" step="0.5" value={bestSlPct} onChange={e => setBestSlPct(parseFloat(e.target.value))}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => handleBestRun(true)} disabled={bestLoading || optLoading}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${bestLoading ? 'bg-surface-border text-gray-500 cursor-not-allowed' : 'bg-brand hover:bg-brand-dark text-black'}`}>
                  {bestLoading ? '⟳ Running…' : '⭐ Preview All 20'}
                </button>
                <button onClick={handleOptimizeSave} disabled={bestLoading || optLoading}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${optLoading ? 'bg-surface-border text-gray-500 cursor-not-allowed' : 'bg-green-700 hover:bg-green-600 text-white'}`}>
                  {optLoading ? `⟳ Optimising… ${optProgress.done}/${optProgress.total}` : '💾 Optimise & Save All'}
                </button>
                <button onClick={() => handleBestRun(false)} disabled={bestLoading || optLoading}
                  className="py-1.5 rounded-lg text-xs font-semibold bg-surface-card border border-surface-border text-gray-300 hover:text-white transition-all">
                  Selected Coins
                </button>
              </div>
            </div>

            {/* Coin selector for selected-coins run */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-300">Coins for "Selected" run ({bestCoins.length})</h3>
                <div className="flex gap-2">
                  <button onClick={() => setBestCoins([...COINS])} className="text-xs text-brand hover:underline">All</button>
                  <button onClick={() => setBestCoins([])} className="text-xs text-gray-500 hover:text-white">None</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {COINS.map(c => (
                  <button key={c} onClick={() => setBestCoins(p => p.includes(c) ? p.filter(x=>x!==c) : [...p,c])}
                    className={`text-xs px-2 py-1 rounded transition-colors ${bestCoins.includes(c) ? 'bg-brand/20 text-brand border border-brand/30' : 'bg-surface text-gray-500 border border-surface-border hover:text-gray-300'}`}>
                    {c.replace('USDT','')}
                  </button>
                ))}
              </div>
            </div>

            {/* Best results table */}
            {bestLoading && (
              <div className="bg-surface-card border border-surface-border rounded-lg p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-300">Running 10 strategies per coin…</span>
                  <span className="text-sm font-semibold text-brand">{bestProgress.done} / {bestProgress.total} coins</span>
                </div>
                <div className="w-full bg-surface rounded-full h-2">
                  <div className="bg-brand h-2 rounded-full transition-all duration-300"
                    style={{ width: bestProgress.total ? `${bestProgress.done / bestProgress.total * 100}%` : '0%' }} />
                </div>
                <p className="text-xs text-gray-600 mt-2">Each coin runs sequentially to avoid timeout. Please wait…</p>
              </div>
            )}

            {bestResults.length > 0 && (
              <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-surface-border">
                  <h3 className="text-sm font-semibold text-gray-300">Best Strategy Per Coin</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-gray-500 border-b border-surface-border">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Coin</th>
                        <th className="px-3 py-2 text-left font-medium">Best Strategy</th>
                        <th className="px-3 py-2 text-left font-medium">Win Rate</th>
                        <th className="px-3 py-2 text-left font-medium">Total PnL</th>
                        <th className="px-3 py-2 text-left font-medium">Trades</th>
                        <th className="px-3 py-2 text-left font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bestResults.map(r => (
                        <>
                          <tr key={r.coin} className="border-b border-surface-border hover:bg-surface-hover">
                            <td className="px-3 py-2 text-blue-400 font-semibold font-mono">{r.coin.replace('USDT','')}</td>
                            <td className="px-3 py-2 text-brand font-medium">{r.best_strategy_label}</td>
                            <td className="px-3 py-2 text-white font-semibold">{r.win_rate.toFixed(1)}%</td>
                            <td className={`px-3 py-2 font-semibold font-mono ${r.total_pnl_pct>=0?'text-green-400':'text-red-400'}`}>
                              {r.total_pnl_pct>=0?'+':''}{r.total_pnl_pct.toFixed(2)}%
                            </td>
                            <td className="px-3 py-2 text-gray-400">{r.total_trades}</td>
                            <td className="px-3 py-2">
                              <button onClick={() => setExpandedCoin(expandedCoin===r.coin ? null : r.coin)}
                                className="text-xs text-gray-500 hover:text-brand transition-colors">
                                {expandedCoin===r.coin ? '▲ Hide' : '▼ All strategies'}
                              </button>
                            </td>
                          </tr>
                          {expandedCoin === r.coin && (
                            <tr key={`${r.coin}-exp`} className="border-b border-surface-border bg-surface">
                              <td colSpan={6} className="px-6 py-3">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-600">
                                      <th className="text-left pb-1 pr-4">Strategy</th>
                                      <th className="text-left pb-1 pr-4">Win Rate</th>
                                      <th className="text-left pb-1 pr-4">PnL%</th>
                                      <th className="text-left pb-1">Trades</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.all_strategies.sort((a,b) => b.win_rate - a.win_rate).map(s => (
                                      <tr key={s.strategy} className={s.strategy===r.best_strategy ? 'text-brand' : 'text-gray-500'}>
                                        <td className="pr-4 py-0.5">{STRATEGY_LABELS[s.strategy] ?? s.strategy}{s.strategy===r.best_strategy?' ⭐':''}</td>
                                        <td className="pr-4">{s.win_rate.toFixed(1)}%</td>
                                        <td className={`pr-4 ${s.total_pnl_pct>=0?'text-green-500':'text-red-500'}`}>{s.total_pnl_pct>=0?'+':''}{s.total_pnl_pct.toFixed(2)}%</td>
                                        <td>{s.total_trades}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── OPTIMIZATION DASHBOARD MODE ── */}
        {mode === 'optimize' && <OptimizationDashboard />}

        {/* ── OPTIMISE & SAVE RESULTS ── */}
        {(optLoading || optResults.length > 0) && mode === 'best' && (
          <div className="space-y-3 mt-4">
            {optLoading && (
              <div className="bg-surface-card border border-surface-border rounded-lg p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-300">Optimising + saving to DB…</span>
                  <span className="text-sm font-semibold text-green-400">
                    {optProgress.done} / {optProgress.total} coins
                  </span>
                </div>
                <div className="w-full bg-surface rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: optProgress.total ? `${optProgress.done / optProgress.total * 100}%` : '0%' }} />
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Each coin: all 10 strategies + TP/SL grid search + saving to DB
                </p>
              </div>
            )}

            {optResults.length > 0 && (
              <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-300">
                    Optimised Results {optSaved && <span className="text-green-400 ml-2 text-xs">✓ Saved to DB</span>}
                  </h3>
                  {optSaved && (
                    <a href="/dashboard"
                      className="text-xs px-3 py-1 bg-green-700/30 border border-green-700/50 rounded text-green-400 hover:bg-green-700/50 transition-colors">
                      View Dashboard →
                    </a>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-gray-500 border-b border-surface-border">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Coin</th>
                        <th className="px-3 py-2 text-left font-medium">Best Strategy</th>
                        <th className="px-3 py-2 text-left font-medium">TP1 / TP2 / SL</th>
                        <th className="px-3 py-2 text-left font-medium">Win Rate</th>
                        <th className="px-3 py-2 text-left font-medium">Total PnL</th>
                        <th className="px-3 py-2 text-left font-medium">Trades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optResults.map(r => (
                        <tr key={r.coin} className="border-b border-surface-border hover:bg-surface-hover">
                          <td className="px-3 py-2 text-blue-400 font-semibold font-mono">
                            {r.coin.replace('USDT', '')}
                          </td>
                          <td className="px-3 py-2 text-brand">
                            {r.error ? <span className="text-red-400">{r.error}</span> : r.best_strategy_label}
                          </td>
                          <td className="px-3 py-2 text-gray-400 font-mono">
                            {r.optimized_params
                              ? `${r.optimized_params.tp_pct} / ${r.optimized_params.tp2_pct} / ${r.optimized_params.sl_pct}`
                              : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`font-bold ${r.win_rate >= 60 ? 'text-green-400' : r.win_rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {r.win_rate.toFixed(1)}%
                            </span>
                          </td>
                          <td className={`px-3 py-2 font-semibold font-mono ${r.total_pnl_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {r.total_pnl_pct >= 0 ? '+' : ''}{r.total_pnl_pct.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-gray-400">{r.total_trades}</td>
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
