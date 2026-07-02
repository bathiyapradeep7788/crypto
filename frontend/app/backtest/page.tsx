'use client'
import { useState, useEffect } from 'react'
import TabBar from '@/components/layout/TabBar'
import CoinSelector from '@/components/backtest/CoinSelector'
import StrategySelector from '@/components/backtest/StrategySelector'
import StrategyParams from '@/components/backtest/StrategyParams'
import ResultsTable from '@/components/backtest/ResultsTable'
import { useBacktest } from '@/hooks/useBacktest'
import { scanSignals, listMethods, createCombined } from '@/lib/api'
import { DEFAULT_PARAMS, COINS, COIN_LABELS, STRATEGIES } from '@/lib/constants'
import { useErrorToast } from '@/hooks/useErrorToast'

const MONTHS = [
  { label: 'Jan 2025', start: '2025-01-01T00:00', end: '2025-02-01T00:00' },
  { label: 'Feb 2025', start: '2025-02-01T00:00', end: '2025-03-01T00:00' },
  { label: 'Mar 2025', start: '2025-03-01T00:00', end: '2025-04-01T00:00' },
  { label: 'Apr 2025', start: '2025-04-01T00:00', end: '2025-05-01T00:00' },
  { label: 'May 2025', start: '2025-05-01T00:00', end: '2025-06-01T00:00' },
]

type CoinStatus = 'idle' | 'scanning' | 'done' | 'error'
type CoinResult = { signals: number; error?: string }
type Method = { id: string; label: string; type: string }

const coinShort = (c: string) => COIN_LABELS[c] ?? c.replace('USDT', '')

export default function BacktestPage() {
  const { run, status, progress, results, error } = useBacktest()
  const { addToast } = useErrorToast()

  const [mode, setMode] = useState<'manual' | 'scanner'>('scanner')

  // ── Manual mode ──
  const [coins,       setCoins]       = useState<string[]>(['BTCUSDT', 'ETHUSDT'])
  const [startDt,     setStartDt]     = useState('2024-01-01T00:00')
  const [endDt,       setEndDt]       = useState('2024-06-01T00:00')
  const [strategies,  setStrategies]  = useState<string[]>(['rsi_macd'])
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [tpPct,  setTpPct]  = useState(2.0)
  const [tp2Pct, setTp2Pct] = useState(4.0)
  const [slPct,  setSlPct]  = useState(1.5)

  // ── Scanner: coins (editable list) ──
  const [coinList,   setCoinList]   = useState<string[]>([...COINS])
  const [scanCoins,  setScanCoins]  = useState<string[]>([...COINS])
  const [newCoin,    setNewCoin]    = useState('')

  // ── Scanner: methods (strategies + combos) ──
  const [methods,       setMethods]       = useState<Method[]>(STRATEGIES.map(s => ({ ...s, type: 'builtin' })))
  const [scanStrats,    setScanStrats]    = useState<string[]>(STRATEGIES.map(s => s.id))
  const [paramsOpen,    setParamsOpen]    = useState<string | null>(null)
  const [stratParams,   setStratParams]   = useState<Record<string, Record<string, number>>>({})
  const [comboOpen,     setComboOpen]     = useState(false)
  const [comboName,     setComboName]     = useState('')
  const [comboA,        setComboA]        = useState('rsi_macd')
  const [comboB,        setComboB]        = useState('ema_crossover')
  const [comboSaving,   setComboSaving]   = useState(false)

  // ── Scanner: run state ──
  const [scanTpPct,    setScanTpPct]    = useState(2.0)
  const [scanTp2Pct,   setScanTp2Pct]   = useState(4.0)
  const [scanSlPct,    setScanSlPct]    = useState(1.5)
  const [scanning,     setScanning]     = useState(false)
  const [scanDone,     setScanDone]     = useState(false)
  const [currentMonth, setCurrentMonth] = useState('')
  const [currentCoin,  setCurrentCoin]  = useState('')
  const [currentStrat, setCurrentStrat] = useState('')
  const [coinStatus,   setCoinStatus]   = useState<Record<string, CoinStatus>>({})
  const [coinResults,  setCoinResults]  = useState<Record<string, CoinResult>>({})
  const [monthDone,    setMonthDone]    = useState<string[]>([])
  const [totalSignals, setTotalSignals] = useState(0)
  const [doneCount,    setDoneCount]    = useState(0)
  const [totalCount,   setTotalCount]   = useState(0)

  const loadMethods = async () => {
    try {
      const r = await listMethods()
      setMethods(r.methods)
    } catch { /* keep built-in fallback */ }
  }
  useEffect(() => { loadMethods() }, [])

  const soloBuiltIn = strategies.length === 1 && !strategies[0].startsWith('combo_') ? strategies[0] : null
  const setParam = (key: string, val: number) => setParamValues(prev => ({ ...prev, [key]: val }))
  const buildParams = () => {
    if (!soloBuiltIn) return []
    return (DEFAULT_PARAMS[soloBuiltIn] ?? []).map(f => ({ key: f.key, value: paramValues[f.key] ?? f.default }))
  }

  const handleRun = () => {
    if (!coins.length)      return alert('Select at least one coin')
    if (!strategies.length) return alert('Select at least one strategy')
    run({ coins, start_dt: new Date(startDt).toISOString(), end_dt: new Date(endDt).toISOString(),
      strategies, params: buildParams(), tp_pct: tpPct, tp2_pct: tp2Pct, sl_pct: slPct, interval: '15m' })
  }

  // ── Coin add/remove ──
  const handleAddCoin = () => {
    let sym = newCoin.trim().toUpperCase()
    if (!sym) return
    if (!sym.endsWith('USDT')) sym += 'USDT'
    if (coinList.includes(sym)) { addToast(`${sym} already in list`, 'warning'); return }
    setCoinList(prev => [...prev, sym])
    setScanCoins(prev => [...prev, sym])
    setNewCoin('')
  }
  const handleRemoveCoin = (c: string) => {
    setCoinList(prev => prev.filter(x => x !== c))
    setScanCoins(prev => prev.filter(x => x !== c))
  }

  // ── Strategy param edit ──
  const setStratParam = (sid: string, key: string, val: number) =>
    setStratParams(prev => ({ ...prev, [sid]: { ...(prev[sid] ?? {}), [key]: val } }))

  // ── Custom method (combined strategy) ──
  const handleCreateCombo = async () => {
    if (!comboName.trim()) { addToast('Method name required', 'warning'); return }
    if (comboA === comboB) { addToast('Pick two different strategies', 'warning'); return }
    setComboSaving(true)
    try {
      await createCombined({ name: comboName.trim(), strategy_a: comboA, strategy_b: comboB })
      await loadMethods()
      setComboOpen(false)
      setComboName('')
      addToast('Custom method created', 'info')
    } catch (e: any) {
      addToast(`Create failed: ${e.message}`, 'error')
    }
    setComboSaving(false)
  }

  const handleScan = async () => {
    if (!scanCoins.length)  { addToast('Select at least one coin', 'warning'); return }
    if (!scanStrats.length) { addToast('Select at least one strategy', 'warning'); return }
    setScanning(true)
    setScanDone(false)
    setMonthDone([])
    setTotalSignals(0)
    setDoneCount(0)
    setCurrentMonth('')
    setCurrentCoin('')
    setCurrentStrat('')
    setCoinResults({})

    const total = scanCoins.length * MONTHS.length
    setTotalCount(total)

    const initStatus: Record<string, CoinStatus> = {}
    scanCoins.forEach(c => { initStatus[c] = 'idle' })
    setCoinStatus(initStatus)

    // Only send params the user actually changed
    const changedParams: Record<string, Record<string, number>> = {}
    for (const sid of scanStrats) {
      const overrides = stratParams[sid]
      if (overrides && Object.keys(overrides).length) changedParams[sid] = overrides
    }

    let grandTotal = 0
    let done = 0

    for (const month of MONTHS) {
      setCurrentMonth(month.label)

      for (const coin of scanCoins) {
        setCurrentCoin(coin)
        setCoinStatus(prev => ({ ...prev, [coin]: 'scanning' }))

        const stratAnim = methods.filter(m => scanStrats.includes(m.id)).map(m => m.label)
        let si = 0
        const animInterval = setInterval(() => {
          setCurrentStrat(stratAnim[si % stratAnim.length])
          si++
        }, 400)

        try {
          const r = await scanSignals({
            coin,
            start_dt: new Date(month.start).toISOString(),
            end_dt:   new Date(month.end).toISOString(),
            tp_pct:   scanTpPct,
            tp2_pct:  scanTp2Pct,
            sl_pct:   scanSlPct,
            strategies: scanStrats,
            strategyParams: changedParams,
          })
          clearInterval(animInterval)
          grandTotal += r.signals_found
          setTotalSignals(grandTotal)
          setCoinResults(prev => ({
            ...prev,
            [coin]: { signals: (prev[coin]?.signals ?? 0) + r.signals_found }
          }))
          setCoinStatus(prev => ({ ...prev, [coin]: 'done' }))
        } catch (e: any) {
          clearInterval(animInterval)
          setCoinResults(prev => ({ ...prev, [coin]: { signals: 0, error: e.message } }))
          setCoinStatus(prev => ({ ...prev, [coin]: 'error' }))
        }

        done++
        setDoneCount(done)
        setCurrentStrat('')
      }

      setMonthDone(prev => [...prev, month.label])
    }

    setScanning(false)
    setScanDone(true)
    setCurrentMonth('')
    setCurrentCoin('')
    addToast(`Scan complete — ${grandTotal} signals saved`, 'info')
  }

  const isRunning = status === 'running'

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">

        {/* Header + mode toggle */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Backtest Bot</h1>
            <p className="text-xs text-gray-500 mt-0.5">15m timeframe · custom coins · custom strategies</p>
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
              <button onClick={() => setMode('scanner')}
                className={`text-xs px-4 py-2 font-medium transition-colors ${mode==='scanner' ? 'bg-brand text-black' : 'bg-surface-card text-gray-400 hover:text-white'}`}>
                📡 Signal Scanner
              </button>
              <button onClick={() => setMode('manual')}
                className={`text-xs px-4 py-2 font-medium transition-colors ${mode==='manual' ? 'bg-brand text-black' : 'bg-surface-card text-gray-400 hover:text-white'}`}>
                Manual
              </button>
            </div>
          </div>
        </div>

        {/* ── SIGNAL SCANNER MODE ── */}
        {mode === 'scanner' && (
          <div className="space-y-4">

            {/* Config row */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Scan Config · 15m locked · Jan–May 2025</h3>
                <div className="flex gap-2">
                  <button onClick={handleScan} disabled={scanning}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                      scanning ? 'bg-surface-border text-gray-500 cursor-not-allowed'
                               : 'bg-brand hover:bg-brand-dark text-black'}`}>
                    {scanning ? `Scanning… ${doneCount}/${totalCount}` : '📡 Start Scan'}
                  </button>
                  {scanDone && (
                    <a href="/dashboard"
                      className="px-5 py-2 rounded-lg text-sm font-bold bg-green-700/30 border border-green-700/50 text-green-400 hover:bg-green-700/50 transition-colors">
                      View Dashboard →
                    </a>
                  )}
                </div>
              </div>

              {/* TP/SL */}
              <div className="grid grid-cols-3 gap-3">
                {[['TP1 %', scanTpPct, setScanTpPct], ['TP2 %', scanTp2Pct, setScanTp2Pct], ['SL %', scanSlPct, setScanSlPct]].map(([label, val, set]) => (
                  <div key={label as string}>
                    <label className="block text-xs text-gray-500 mb-1">{label as string}</label>
                    <input type="number" step="0.5" value={val as number}
                      onChange={e => (set as (v: number) => void)(parseFloat(e.target.value))}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                  </div>
                ))}
              </div>
            </div>

            {/* Coin selector grid — editable */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Coins ({scanCoins.length}/{coinList.length})</h3>
                <div className="flex items-center gap-2">
                  <input value={newCoin} onChange={e => setNewCoin(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddCoin()}
                    placeholder="Add coin e.g. AVAX"
                    disabled={scanning}
                    className="w-36 bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-brand" />
                  <button onClick={handleAddCoin} disabled={scanning}
                    className="text-xs px-3 py-1 rounded bg-brand/20 border border-brand/40 text-brand hover:bg-brand/30">＋ Add</button>
                  <button onClick={() => setScanCoins([...coinList])} className="text-xs text-brand hover:underline">All</button>
                  <button onClick={() => setScanCoins([])}            className="text-xs text-gray-500 hover:text-white">None</button>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {coinList.map(c => {
                  const st = coinStatus[c]
                  const res = coinResults[c]
                  const selected = scanCoins.includes(c)
                  return (
                    <div key={c} className="relative group">
                      <button
                        onClick={() => !scanning && setScanCoins(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                        disabled={scanning}
                        className={`w-full relative p-3 rounded-lg border text-left transition-all ${
                          st === 'scanning' ? 'border-brand bg-brand/10 animate-pulse' :
                          st === 'done'     ? 'border-green-600 bg-green-900/20' :
                          st === 'error'    ? 'border-red-600 bg-red-900/20' :
                          selected          ? 'border-brand/40 bg-brand/5' :
                                              'border-surface-border bg-surface opacity-40'
                        }`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-bold ${
                            st === 'scanning' ? 'text-brand' :
                            st === 'done'     ? 'text-green-400' :
                            st === 'error'    ? 'text-red-400' :
                            selected          ? 'text-white' : 'text-gray-600'
                          }`}>
                            {coinShort(c)}
                          </span>
                          <span className="text-[10px]">
                            {st === 'scanning' ? '⟳' : st === 'done' ? '✓' : st === 'error' ? '✗' : selected ? '●' : '○'}
                          </span>
                        </div>
                        {res && (
                          <div className="text-[10px] mt-1 font-mono">
                            {res.error
                              ? <span className="text-red-500">err</span>
                              : <span className="text-gray-400">{res.signals.toLocaleString()} sigs</span>}
                          </div>
                        )}
                        {st === 'scanning' && currentCoin === c && (
                          <div className="text-[9px] text-brand mt-0.5 truncate">{currentStrat}</div>
                        )}
                      </button>
                      {!scanning && (
                        <button onClick={() => handleRemoveCoin(c)}
                          title={`Remove ${coinShort(c)}`}
                          className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4 h-4 items-center justify-center rounded-full bg-red-900 border border-red-700 text-red-300 text-[9px] hover:bg-red-700">
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Strategy / method selector — editable params */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">
                  Strategies &amp; Methods ({scanStrats.length}/{methods.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => setComboOpen(v => !v)} disabled={scanning}
                    className="text-xs px-3 py-1 rounded bg-purple-900/30 border border-purple-700/50 text-purple-300 hover:bg-purple-900/50">
                    ＋ Custom Method
                  </button>
                  <button onClick={() => setScanStrats(methods.map(m => m.id))} className="text-xs text-brand hover:underline">All</button>
                  <button onClick={() => setScanStrats([])} className="text-xs text-gray-500 hover:text-white">None</button>
                </div>
              </div>

              {/* Custom method creation form */}
              {comboOpen && (
                <div className="mb-3 p-3 rounded-lg border border-purple-800/50 bg-purple-900/10 grid grid-cols-4 gap-2 items-end">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Method Name</label>
                    <input value={comboName} onChange={e => setComboName(e.target.value)}
                      placeholder="e.g. RSI+EMA Combo"
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Strategy A</label>
                    <select value={comboA} onChange={e => setComboA(e.target.value)}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-white">
                      {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">Strategy B (AND logic)</label>
                    <select value={comboB} onChange={e => setComboB(e.target.value)}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-xs text-white">
                      {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <button onClick={handleCreateCombo} disabled={comboSaving}
                    className="text-xs px-3 py-1.5 rounded bg-purple-700 text-white font-semibold hover:bg-purple-600 disabled:opacity-50">
                    {comboSaving ? 'Saving…' : 'Create'}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {methods.map(m => {
                  const selected = scanStrats.includes(m.id)
                  const fields = DEFAULT_PARAMS[m.id] ?? []
                  const open = paramsOpen === m.id
                  return (
                    <div key={m.id} className={`rounded-lg border transition-all ${
                      selected ? (m.type === 'combo' ? 'border-purple-700/60 bg-purple-900/10' : 'border-brand/40 bg-brand/5')
                               : 'border-surface-border bg-surface opacity-50'}`}>
                      <div className="flex items-center justify-between px-3 py-2">
                        <button disabled={scanning}
                          onClick={() => setScanStrats(prev => prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                          className="flex items-center gap-2 text-left flex-1">
                          <span className="text-[10px]">{selected ? '●' : '○'}</span>
                          <span className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-500'}`}>{m.label}</span>
                          {m.type === 'combo' && <span className="text-[9px] px-1.5 rounded-full bg-purple-900/50 text-purple-300 border border-purple-700/50">combo</span>}
                          {scanning && currentStrat === m.label && <span className="text-[9px] text-brand animate-pulse">scanning…</span>}
                        </button>
                        {fields.length > 0 && (
                          <button onClick={() => setParamsOpen(open ? null : m.id)}
                            className="text-[10px] px-2 py-0.5 rounded border border-surface-border text-gray-400 hover:text-white hover:border-brand">
                            ⚙ {open ? 'Close' : 'Params'}
                          </button>
                        )}
                      </div>
                      {open && fields.length > 0 && (
                        <div className="px-3 pb-3 grid grid-cols-3 gap-2 border-t border-surface-border pt-2">
                          {fields.map(f => (
                            <div key={f.key}>
                              <label className="block text-[9px] text-gray-500 mb-0.5">{f.label}</label>
                              <input type="number" step="any"
                                value={stratParams[m.id]?.[f.key] ?? f.default}
                                onChange={e => setStratParam(m.id, f.key, parseFloat(e.target.value))}
                                className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-brand" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Month progress */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Month Progress</h3>
                {scanning && (
                  <span className="text-xs text-brand font-mono animate-pulse">{currentMonth} · {currentCoin ? coinShort(currentCoin) : ''}</span>
                )}
                {scanDone && (
                  <span className="text-xs text-green-400 font-semibold">{totalSignals.toLocaleString()} total signals</span>
                )}
              </div>
              <div className="flex gap-2">
                {MONTHS.map(m => {
                  const done = monthDone.includes(m.label)
                  const active = scanning && currentMonth === m.label
                  return (
                    <div key={m.label} className={`flex-1 rounded-lg border p-2 text-center transition-all ${
                      done   ? 'border-green-600 bg-green-900/20' :
                      active ? 'border-brand bg-brand/10 animate-pulse' :
                               'border-surface-border bg-surface'
                    }`}>
                      <div className={`text-xs font-semibold ${done ? 'text-green-400' : active ? 'text-brand' : 'text-gray-600'}`}>
                        {m.label.split(' ')[0]}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">2025</div>
                      {done && <div className="text-[10px] text-green-500 mt-0.5">done</div>}
                      {active && <div className="text-[10px] text-brand mt-0.5">scanning</div>}
                    </div>
                  )
                })}
              </div>

              {/* Overall progress bar */}
              {(scanning || scanDone) && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-500">{doneCount} / {totalCount} scans</span>
                    <span className="text-[10px] text-gray-500">{totalCount ? Math.round(doneCount/totalCount*100) : 0}%</span>
                  </div>
                  <div className="w-full bg-surface rounded-full h-1.5">
                    <div className="bg-brand h-1.5 rounded-full transition-all duration-300"
                      style={{ width: totalCount ? `${doneCount/totalCount*100}%` : '0%' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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
              <StrategyParams strategyId={soloBuiltIn??''} values={paramValues} onChange={setParam}
                tpPct={tpPct} tp2Pct={tp2Pct} slPct={slPct} onTp={setTpPct} onTp2={setTp2Pct} onSl={setSlPct} />
              {error && <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>}
              <button onClick={handleRun} disabled={isRunning}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${isRunning ? 'bg-surface-border text-gray-500 cursor-not-allowed' : 'bg-brand hover:bg-brand-dark text-black'}`}>
                {isRunning ? `Running… (${progress.processed}/${progress.total})` : '▶ Run Backtest'}
              </button>
              {status === 'done' && <ResultsTable results={results} />}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
