'use client'
import { useState } from 'react'
import TabBar from '@/components/layout/TabBar'
import CoinSelector from '@/components/backtest/CoinSelector'
import StrategySelector from '@/components/backtest/StrategySelector'
import StrategyParams from '@/components/backtest/StrategyParams'
import ResultsTable from '@/components/backtest/ResultsTable'
import { useBacktest } from '@/hooks/useBacktest'
import { scanSignals } from '@/lib/api'
import { DEFAULT_PARAMS, COINS, COIN_LABELS } from '@/lib/constants'
import { useErrorToast } from '@/hooks/useErrorToast'

export default function BacktestPage() {
  const { run, status, progress, results, error } = useBacktest()
  const { addToast } = useErrorToast()

  const [mode, setMode] = useState<'manual' | 'scanner'>('manual')

  // ── Manual mode ──
  const [coins,       setCoins]       = useState<string[]>(['BTCUSDT', 'ETHUSDT'])
  const [startDt,     setStartDt]     = useState('2024-01-01T00:00')
  const [endDt,       setEndDt]       = useState('2024-06-01T00:00')
  const [strategies,  setStrategies]  = useState<string[]>(['rsi_macd'])
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [tpPct,  setTpPct]  = useState(2.0)
  const [tp2Pct, setTp2Pct] = useState(4.0)
  const [slPct,  setSlPct]  = useState(1.5)

  // ── Signal Scanner mode ──
  const [scanStartDt,  setScanStartDt]  = useState('2024-01-01T00:00')
  const [scanEndDt,    setScanEndDt]    = useState('2024-06-01T00:00')
  const [scanTpPct,    setScanTpPct]    = useState(2.0)
  const [scanTp2Pct,   setScanTp2Pct]  = useState(4.0)
  const [scanSlPct,    setScanSlPct]    = useState(1.5)
  const [scanCoins,    setScanCoins]    = useState<string[]>([...COINS])
  const [scanRunning,  setScanRunning]  = useState(false)
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 })
  const [scanResults,  setScanResults]  = useState<{ coin: string; found: number; error?: string }[]>([])
  const [scanDone,     setScanDone]     = useState(false)

  const soloBuiltIn =
    strategies.length === 1 && !strategies[0].startsWith('combo_') ? strategies[0] : null

  const setParam = (key: string, val: number) =>
    setParamValues(prev => ({ ...prev, [key]: val }))

  const buildParams = () => {
    if (!soloBuiltIn) return []
    return (DEFAULT_PARAMS[soloBuiltIn] ?? []).map(f => ({ key: f.key, value: paramValues[f.key] ?? f.default }))
  }

  const handleRun = () => {
    if (!coins.length)      return alert('Select at least one coin')
    if (!strategies.length) return alert('Select at least one strategy')
    run({
      coins,
      start_dt:   new Date(startDt).toISOString(),
      end_dt:     new Date(endDt).toISOString(),
      strategies,
      params:     buildParams(),
      tp_pct:     tpPct,
      tp2_pct:    tp2Pct,
      sl_pct:     slPct,
      interval:   '15m',
    })
  }

  const handleScan = async () => {
    if (!scanCoins.length) { addToast('Select at least one coin', 'warning'); return }
    setScanRunning(true)
    setScanResults([])
    setScanDone(false)
    setScanProgress({ done: 0, total: scanCoins.length })

    for (let i = 0; i < scanCoins.length; i++) {
      const coin = scanCoins[i]
      try {
        const r = await scanSignals({
          coin,
          start_dt: new Date(scanStartDt).toISOString(),
          end_dt:   new Date(scanEndDt).toISOString(),
          tp_pct:   scanTpPct,
          tp2_pct:  scanTp2Pct,
          sl_pct:   scanSlPct,
        })
        setScanResults(prev => [...prev, { coin, found: r.signals_found }])
      } catch (e: any) {
        setScanResults(prev => [...prev, { coin, found: 0, error: e.message }])
      }
      setScanProgress({ done: i + 1, total: scanCoins.length })
    }

    setScanRunning(false)
    setScanDone(true)
    addToast('Signal scan complete — view results on Dashboard', 'info')
  }

  const isRunning = status === 'running'

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Backtest Bot</h1>
            <p className="text-xs text-gray-500 mt-0.5">Simulate strategies on historical Binance 15m data</p>
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
            <div className="flex rounded-lg overflow-hidden border border-surface-border">
              <button onClick={() => setMode('manual')}
                className={`text-xs px-4 py-2 font-medium transition-colors ${mode==='manual' ? 'bg-brand text-black' : 'bg-surface-card text-gray-400 hover:text-white'}`}>
                Manual
              </button>
              <button onClick={() => setMode('scanner')}
                className={`text-xs px-4 py-2 font-medium transition-colors ${mode==='scanner' ? 'bg-gradient-to-r from-brand to-blue-500 text-black' : 'bg-surface-card text-gray-400 hover:text-white'}`}>
                📡 Signal Scanner
              </button>
            </div>
          </div>
        </div>

        {/* ── MANUAL MODE ── */}
        {mode === 'manual' && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-4 space-y-4">
              <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Date Range · 15m fixed</h3>
                {[{label:'Start',value:startDt,set:setStartDt},{label:'End',value:endDt,set:setEndDt}].map(({label,value,set}) => (
                  <div key={label}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input type="datetime-local" value={value} onChange={e => set(e.target.value)}
                      className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                  </div>
                ))}
                <p className="text-[10px] text-gray-600 border border-surface-border rounded px-2 py-1">
                  Timeframe: <span className="text-brand font-semibold">15m (locked)</span>
                </p>
              </div>
              <CoinSelector selected={coins} onChange={setCoins} />
            </div>

            <div className="col-span-8 space-y-4">
              <StrategySelector selected={strategies} onChange={setStrategies} />
              <StrategyParams
                strategyId={soloBuiltIn ?? ''}
                values={paramValues}
                onChange={setParam}
                tpPct={tpPct}
                tp2Pct={tp2Pct}
                slPct={slPct}
                onTp={setTpPct}
                onTp2={setTp2Pct}
                onSl={setSlPct}
              />
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

        {/* ── SIGNAL SCANNER MODE ── */}
        {mode === 'scanner' && (
          <div className="space-y-4">
            {/* Config */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Scan Configuration</h3>
              <div className="grid grid-cols-6 gap-3 items-end">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                  <input type="datetime-local" value={scanStartDt} onChange={e => setScanStartDt(e.target.value)}
                    className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">End Date</label>
                  <input type="datetime-local" value={scanEndDt} onChange={e => setScanEndDt(e.target.value)}
                    className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Timeframe</label>
                  <div className="bg-surface border border-brand/50 rounded px-2 py-1.5 text-sm text-brand font-semibold text-center">
                    15m (locked)
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={handleScan} disabled={scanRunning}
                    className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      scanRunning
                        ? 'bg-surface-border text-gray-500 cursor-not-allowed'
                        : 'bg-brand hover:bg-brand-dark text-black'
                    }`}>
                    {scanRunning
                      ? `⟳ Scanning ${scanProgress.done}/${scanProgress.total}…`
                      : '📡 Scan Signals'}
                  </button>
                  {scanDone && (
                    <a href="/dashboard"
                      className="text-center py-1.5 rounded-lg text-xs font-semibold bg-green-700/30 border border-green-700/50 text-green-400 hover:bg-green-700/50 transition-colors">
                      View Dashboard →
                    </a>
                  )}
                </div>
              </div>

              {/* TP/SL params */}
              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-surface-border">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">TP1 %</label>
                  <input type="number" step="0.5" value={scanTpPct} onChange={e => setScanTpPct(parseFloat(e.target.value))}
                    className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">TP2 %</label>
                  <input type="number" step="0.5" value={scanTp2Pct} onChange={e => setScanTp2Pct(parseFloat(e.target.value))}
                    className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">SL %</label>
                  <input type="number" step="0.5" value={scanSlPct} onChange={e => setScanSlPct(parseFloat(e.target.value))}
                    className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                </div>
              </div>
            </div>

            {/* Coin selector */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-300">Coins to Scan ({scanCoins.length} / {COINS.length})</h3>
                <div className="flex gap-2">
                  <button onClick={() => setScanCoins([...COINS])} className="text-xs text-brand hover:underline">All</button>
                  <button onClick={() => setScanCoins([])}         className="text-xs text-gray-500 hover:text-white">None</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COINS.map(c => (
                  <button key={c}
                    onClick={() => setScanCoins(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${
                      scanCoins.includes(c)
                        ? 'bg-brand/20 text-brand border border-brand/30'
                        : 'bg-surface text-gray-500 border border-surface-border hover:text-gray-300'
                    }`}>
                    {COIN_LABELS[c] ?? c.replace('USDT', '')}
                  </button>
                ))}
              </div>
            </div>

            {/* Progress bar */}
            {scanRunning && (
              <div className="bg-surface-card border border-surface-border rounded-lg p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-300">Scanning candles for signals…</span>
                  <span className="text-sm font-semibold text-brand">{scanProgress.done} / {scanProgress.total}</span>
                </div>
                <div className="w-full bg-surface rounded-full h-2">
                  <div className="bg-brand h-2 rounded-full transition-all duration-300"
                    style={{ width: scanProgress.total ? `${(scanProgress.done / scanProgress.total) * 100}%` : '0%' }} />
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Each coin scanned individually to stay within serverless limits. Please wait…
                </p>
              </div>
            )}

            {/* Scan results summary */}
            {scanResults.length > 0 && (
              <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-300">Scan Results</h3>
                  <span className="text-xs text-gray-500">
                    {scanResults.reduce((s, r) => s + r.found, 0)} total signals logged
                  </span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-gray-500 border-b border-surface-border bg-surface">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Coin</th>
                      <th className="px-4 py-2 text-left font-medium">Signals Found</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanResults.map(r => (
                      <tr key={r.coin} className="border-b border-surface-border hover:bg-surface-hover">
                        <td className="px-4 py-2 text-blue-400 font-bold font-mono">
                          {COIN_LABELS[r.coin] ?? r.coin.replace('USDT', '')}
                        </td>
                        <td className="px-4 py-2 text-white font-semibold">{r.found}</td>
                        <td className="px-4 py-2">
                          {r.error ? (
                            <span className="text-red-400">✗ {r.error}</span>
                          ) : (
                            <span className="text-green-400">✓ Logged</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
