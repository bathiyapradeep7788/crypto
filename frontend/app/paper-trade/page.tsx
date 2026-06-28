'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import TabBar from '@/components/layout/TabBar'
import { checkMonitor, getMonitorPositions, getMonitorTrades, closeMonitorPosition, thinkMonitorPosition, MonitorConfig } from '@/lib/api'
import { COINS, STRATEGIES, INTERVALS } from '@/lib/constants'
import { useErrorToast } from '@/hooks/useErrorToast'

const CHECK_INTERVAL_MS = 15 * 60 * 1000

function fmtPct(v: number | null | undefined) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}
function fmtUsd(v: number | null | undefined) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`
}

export default function PaperTradePage() {
  const { addToast } = useErrorToast()
  const [monitoring,   setMonitoring]   = useState(false)
  const [countdown,    setCountdown]    = useState(0)
  const [lastCheck,    setLastCheck]    = useState<string | null>(null)
  const [checkResult,  setCheckResult]  = useState<any>(null)
  const [positions,    setPositions]    = useState<any[]>([])
  const [trades,       setTrades]       = useState<any[]>([])
  const [loadingCheck, setLoadingCheck] = useState(false)
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const cdownRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  const [selectedCoins, setSelectedCoins] = useState<string[]>([...COINS])
  const [strategy,  setStrategy]  = useState('rsi_macd')
  const [interval_, setInterval_] = useState('15m')
  const [tpPct,     setTpPct]     = useState(2.0)
  const [tp2Pct,    setTp2Pct]    = useState(4.0)
  const [slPct,     setSlPct]     = useState(1.5)
  const [aiMin,     setAiMin]     = useState(65)

  const config: MonitorConfig = {
    coins: selectedCoins, interval: interval_, strategy,
    tp_pct: tpPct, tp2_pct: tp2Pct, sl_pct: slPct,
    trade_usdt: 100, ai_min_confidence: aiMin,
  }

  const loadData = useCallback(async () => {
    try {
      const [posRes, tradeRes] = await Promise.all([
        getMonitorPositions('paper'), getMonitorTrades('paper'),
      ])
      setPositions(posRes.positions ?? [])
      setTrades(tradeRes.trades ?? [])
    } catch (e: any) { addToast(`Load error: ${e.message}`, 'error') }
  }, [addToast])

  useEffect(() => { loadData() }, [loadData])

  const doCheck = useCallback(async () => {
    if (!selectedCoins.length) { addToast('Select at least one coin', 'warning'); return }
    setLoadingCheck(true)
    try {
      const result = await checkMonitor('paper', config)
      setCheckResult(result)
      setLastCheck(new Date().toLocaleTimeString())
      result.errors?.forEach((e: string) => addToast(e, 'error'))
      if (result.new_entries?.length) addToast(`${result.new_entries.length} new position(s) opened`, 'info')
      if (result.closed?.length) addToast(`${result.closed.length} position(s) closed`, 'info')
      await loadData()
    } catch (e: any) { addToast(`Check failed: ${e.message}`, 'error') }
    setLoadingCheck(false)
  }, [config, selectedCoins, addToast, loadData])

  const startMonitoring = () => {
    setMonitoring(true)
    doCheck()
    setCountdown(CHECK_INTERVAL_MS / 1000)
    intervalRef.current = setInterval(() => { doCheck(); setCountdown(CHECK_INTERVAL_MS / 1000) }, CHECK_INTERVAL_MS)
    cdownRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
  }
  const stopMonitoring = () => {
    setMonitoring(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (cdownRef.current)    clearInterval(cdownRef.current)
  }
  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (cdownRef.current)    clearInterval(cdownRef.current)
  }, [])

  const toggleCoin = (c: string) =>
    setSelectedCoins(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])

  const closePosManual = async (id: string) => {
    try { await closeMonitorPosition('paper', id); addToast('Position closed', 'info'); await loadData() }
    catch (e: any) { addToast(e.message, 'error') }
  }
  const thinkPos = async (id: string) => {
    try { await thinkMonitorPosition('paper', id); addToast('Marked as Think', 'info'); await loadData() }
    catch (e: any) { addToast(e.message, 'error') }
  }

  const wins   = trades.filter(t => t.win).length
  const total  = trades.length
  const pnlUsd = trades.reduce((s, t) => s + (t.profit_usdt ?? 0), 0)

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Paper Trade Monitor</h1>
            <p className="text-xs text-gray-500 mt-0.5">Monitor all coins — $100 per trade, one position per coin max</p>
          </div>
          <div className="flex items-center gap-3">
            {monitoring && (
              <span className="text-xs text-gray-400">Next check: <span className="text-brand font-semibold">{Math.floor(countdown/60)}:{String(countdown%60).padStart(2,'0')}</span></span>
            )}
            {lastCheck && <span className="text-xs text-gray-500">Last: {lastCheck}</span>}
            <button onClick={doCheck} disabled={loadingCheck}
              className="text-xs px-3 py-1.5 bg-surface-card border border-surface-border rounded text-gray-300 hover:text-white disabled:opacity-40 transition-colors">
              {loadingCheck ? '⟳ Checking…' : '⟳ Check Now'}
            </button>
            <button onClick={monitoring ? stopMonitoring : startMonitoring}
              className={`text-sm px-4 py-2 rounded-lg font-semibold transition-all ${monitoring ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-brand hover:bg-brand-dark text-black'}`}>
              {monitoring ? '⏹ Stop' : '▶ Start'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Config */}
          <div className="col-span-3 space-y-4">
            <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Settings</h3>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Strategy</label>
                <select value={strategy} onChange={e => setStrategy(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand">
                  {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Interval</label>
                <select value={interval_} onChange={e => setInterval_(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand">
                  {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([['TP1%', tpPct, setTpPct], ['TP2%', tp2Pct, setTp2Pct], ['SL%', slPct, setSlPct]] as const).map(([lbl, val, set]) => (
                  <div key={lbl}>
                    <label className="block text-xs text-gray-500 mb-1">{lbl}</label>
                    <input type="number" step="0.5" value={val} onChange={e => (set as any)(parseFloat(e.target.value))}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-brand" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Trade Size (fixed)</label>
                <div className="bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-gray-400">$100 USD</div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">AI Min Confidence</label>
                <input type="number" min="0" max="100" value={aiMin} onChange={e => setAiMin(parseInt(e.target.value))}
                  className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
              </div>
            </div>

            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-300">Coins ({selectedCoins.length})</h3>
                <div className="flex gap-1">
                  <button onClick={() => setSelectedCoins([...COINS])} className="text-xs text-brand hover:underline">All</button>
                  <span className="text-gray-600">|</span>
                  <button onClick={() => setSelectedCoins([])} className="text-xs text-gray-500 hover:text-white">None</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {COINS.map(c => (
                  <button key={c} onClick={() => toggleCoin(c)}
                    className={`text-xs px-2 py-1 rounded transition-colors text-left ${selectedCoins.includes(c) ? 'bg-brand/20 text-brand border border-brand/30' : 'bg-surface text-gray-500 border border-surface-border hover:text-gray-300'}`}>
                    {c.replace('USDT','')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main */}
          <div className="col-span-9 space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {[
                {label:'Open Positions', val: positions.length, color:'text-white'},
                {label:'Total Trades',   val: total,            color:'text-white'},
                {label:'Win Rate',       val: `${total ? Math.round(wins/total*100) : 0}%`, color:'text-white'},
                {label:'Total PnL',      val: fmtUsd(pnlUsd),   color: pnlUsd>=0 ? 'text-green-400' : 'text-red-400'},
              ].map(({label, val, color}) => (
                <div key={label} className="bg-surface-card border border-surface-border rounded-lg p-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${color}`}>{val}</p>
                </div>
              ))}
            </div>

            {checkResult && (
              <div className="bg-surface-card border border-surface-border rounded-lg px-4 py-2 text-xs text-gray-400 flex gap-4">
                <span>Checked: <span className="text-white">{checkResult.checked}</span> coins</span>
                {checkResult.new_entries?.length > 0 && <span className="text-green-400">+{checkResult.new_entries.length} opened</span>}
                {checkResult.closed?.length > 0 && <span className="text-brand">{checkResult.closed.length} closed</span>}
                {checkResult.errors?.length > 0 && <span className="text-red-400">{checkResult.errors.length} errors</span>}
              </div>
            )}

            {/* Open Positions Table */}
            <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-border">
                <h3 className="text-sm font-semibold text-gray-300">Open Positions</h3>
              </div>
              {positions.length === 0 ? (
                <div className="text-center py-8 text-gray-600 text-sm">No open positions</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-gray-500 border-b border-surface-border">
                      <tr>{['Coin','Dir','Entry','TP1','TP2','SL','Status','Opened','Actions'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {positions.map(p => (
                        <tr key={p.id} className="border-b border-surface-border hover:bg-surface-hover">
                          <td className="px-3 py-2 text-blue-400 font-semibold font-mono">{p.coin?.replace('USDT','')}</td>
                          <td className={`px-3 py-2 font-semibold ${p.direction==='long'?'text-green-400':'text-red-400'}`}>{p.direction?.toUpperCase()}</td>
                          <td className="px-3 py-2 text-gray-300 font-mono">{parseFloat(p.entry_price).toFixed(4)}</td>
                          <td className="px-3 py-2 text-green-400 font-mono">{parseFloat(p.tp).toFixed(4)}</td>
                          <td className="px-3 py-2 text-green-300 font-mono">{parseFloat(p.tp2).toFixed(4)}</td>
                          <td className="px-3 py-2 text-red-400 font-mono">{parseFloat(p.sl).toFixed(4)}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${p.status==='think'?'bg-yellow-900/40 text-yellow-400':'bg-green-900/40 text-green-400'}`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500">{new Date(p.opened_at).toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <button onClick={() => thinkPos(p.id)} className="text-xs px-2 py-0.5 bg-yellow-900/30 text-yellow-400 rounded hover:bg-yellow-900/50">Think</button>
                              <button onClick={() => closePosManual(p.id)} className="text-xs px-2 py-0.5 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50">Close</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Closed Trades */}
            <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-border">
                <h3 className="text-sm font-semibold text-gray-300">Closed Trades</h3>
              </div>
              {trades.length === 0 ? (
                <div className="text-center py-8 text-gray-600 text-sm">No closed trades yet</div>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface-card text-gray-500 border-b border-surface-border">
                      <tr>{['Coin','Dir','Strategy','Entry','Exit','Reason','PnL%','PnL$','W/L','Closed'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {trades.map((t, i) => (
                        <tr key={t.id ?? i} className="border-b border-surface-border hover:bg-surface-hover">
                          <td className="px-3 py-1.5 text-blue-400 font-mono font-semibold">{t.coin?.replace('USDT','')}</td>
                          <td className={`px-3 py-1.5 font-semibold ${t.direction==='long'?'text-green-400':'text-red-400'}`}>{t.direction?.toUpperCase()}</td>
                          <td className="px-3 py-1.5 text-gray-400">{t.strategy}</td>
                          <td className="px-3 py-1.5 text-gray-300 font-mono">{parseFloat(t.entry_price).toFixed(4)}</td>
                          <td className="px-3 py-1.5 text-gray-300 font-mono">{t.exit_price ? parseFloat(t.exit_price).toFixed(4) : '—'}</td>
                          <td className="px-3 py-1.5 text-gray-500">{t.exit_reason}</td>
                          <td className={`px-3 py-1.5 font-semibold font-mono ${(t.profit_pct??0)>=0?'text-green-400':'text-red-400'}`}>{fmtPct(t.profit_pct)}</td>
                          <td className={`px-3 py-1.5 font-semibold font-mono ${(t.profit_usdt??0)>=0?'text-green-400':'text-red-400'}`}>{fmtUsd(t.profit_usdt)}</td>
                          <td className={`px-3 py-1.5 font-semibold ${t.win?'text-green-400':'text-red-400'}`}>{t.win?'Win':'Loss'}</td>
                          <td className="px-3 py-1.5 text-gray-500">{t.closed_at?new Date(t.closed_at).toLocaleString():'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
