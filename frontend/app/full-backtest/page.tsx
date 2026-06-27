'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import TabBar from '@/components/layout/TabBar'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
// Note: Full Run uses BackgroundTasks — works on Render (persistent server), not Vercel serverless

const COIN_COLORS: Record<string, string> = {
  OPUSDT:'#378ADD', NEARUSDT:'#1D9E75', TIAUSDT:'#BA7517', SOLUSDT:'#7F77DD',
  INJUSDT:'#D4537E', LINKUSDT:'#888780', ETHUSDT:'#8A8EF2', BTCUSDT:'#F7931A',
  BNBUSDT:'#F3BA2F', XRPUSDT:'#346AA9', ADAUSDT:'#0033AD', DOGEUSDT:'#C3A634',
  AVAXUSDT:'#E84142', ARBUSDT:'#28A0F0', DOTUSDT:'#E6007A', APTUSDT:'#11BCA0',
  ATOMUSDT:'#6F4CFF', UNIUSDT:'#FF007A', LTCUSDT:'#BFBBBB', MATICUSDT:'#8247E5',
}
const GRADE_CLR: Record<string, string> = {
  A: 'text-green-400 bg-green-900/30 border-green-700/50',
  B: 'text-brand bg-brand/10 border-brand/40',
  C: 'text-yellow-400 bg-yellow-900/20 border-yellow-700/40',
  D: 'text-orange-400 bg-orange-900/20 border-orange-700/40',
  F: 'text-red-400 bg-red-900/20 border-red-700/40',
}
const MONTHS_2024 = Array.from({length:12},(_,i)=>`2024-${String(i+1).padStart(2,'0')}`)
const MONTHS_2025 = Array.from({length:12},(_,i)=>`2025-${String(i+1).padStart(2,'0')}`)
const ALL_MONTHS  = [...MONTHS_2024, ...MONTHS_2025]
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function FullBacktestPage() {
  const [status,   setStatus]   = useState<any>(null)
  const [settings, setSettings] = useState({
    years:      [2024, 2025] as number[],
    tp_pct:     3.0,
    sl_pct:     1.5,
    interval:   '15m',
    trend:      true,
    session:    false,
    batch_size: 4,
    clear_db:   true,
  })
  const [tab,      setTab]      = useState<'progress'|'coins'|'monthly'>('progress')
  const [selCoin,  setSelCoin]  = useState<string|null>(null)
  const pollRef = useRef<NodeJS.Timeout|null>(null)
  const logRef  = useRef<HTMLDivElement>(null)

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${API}/full-backtest/status`)
      const d = await r.json()
      setStatus(d)
    } catch {}
  }, [])

  useEffect(() => {
    poll()
  }, [poll])

  useEffect(() => {
    if (status?.status === 'running') {
      pollRef.current = setInterval(poll, 3000)
    } else {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [status?.status, poll])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [status?.log])

  const handleStart = async () => {
    const r = await fetch(`${API}/full-backtest/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    const d = await r.json()
    if (d.error) return alert(d.error)
    pollRef.current = setInterval(poll, 3000)
    poll()
  }

  const handleStop = async () => {
    await fetch(`${API}/full-backtest/stop`, { method: 'POST' })
    poll()
  }

  const isRunning = status?.status === 'running'
  const isDone    = status?.status === 'done'
  const pct       = status?.pct ?? 0
  const coins     = (status?.coins ?? []) as any[]

  // Monthly heatmap data for selected coin
  const selectedCoinData = selCoin ? coins.find((c:any) => c.coin === selCoin) : null

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-4 py-5 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Full Backtest — 2024 + 2025</h1>
            <p className="text-xs text-gray-500 mt-0.5">20 coins × 24 months = 480 calls · Best strategies per coin · Live progress</p>
          </div>
          <div className="flex gap-3">
            {isRunning ? (
              <button onClick={handleStop}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors">
                Stop
              </button>
            ) : (
              <button onClick={handleStart}
                className="px-6 py-2.5 bg-brand hover:bg-brand/90 text-black font-black rounded-xl transition-colors">
                {status?.status === 'done' ? 'Re-run' : 'Start Full Run'}
              </button>
            )}
          </div>
        </div>

        {/* Settings row */}
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4 flex items-center gap-6 flex-wrap">
          <div>
            <p className="text-[10px] text-gray-500 mb-1">Years</p>
            <div className="flex gap-1.5">
              {[2024,2025].map(y => (
                <button key={y} onClick={() => setSettings(s => ({
                  ...s, years: s.years.includes(y) ? s.years.filter(x=>x!==y) : [...s.years,y].sort()
                }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${settings.years.includes(y) ? 'bg-brand text-black border-brand' : 'bg-surface border-surface-border text-gray-400'}`}>
                  {y}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 mb-1">Interval</p>
            <div className="flex gap-1">
              {['5m','15m','1h'].map(v => (
                <button key={v} onClick={() => setSettings(s => ({...s, interval: v}))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${settings.interval===v ? 'bg-brand text-black border-brand' : 'bg-surface border-surface-border text-gray-400'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {[
              { label: 'EMA200', key: 'trend' as const },
              { label: 'Session', key: 'session' as const },
              { label: 'Clear DB', key: 'clear_db' as const },
            ].map(f => (
              <label key={f.key} className="flex items-center gap-1.5 cursor-pointer text-gray-400">
                <input type="checkbox" checked={settings[f.key] as boolean}
                  onChange={e => setSettings(s => ({...s, [f.key]: e.target.checked}))}
                  className="accent-brand w-3.5 h-3.5" />
                {f.label}
              </label>
            ))}
          </div>
          <div>
            <p className="text-[10px] text-gray-500 mb-1">TP% / SL%</p>
            <div className="flex gap-1.5 items-center">
              <input type="number" step="0.5" value={settings.tp_pct}
                onChange={e => setSettings(s=>({...s, tp_pct: parseFloat(e.target.value)}))}
                className="w-14 bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-brand" />
              <span className="text-gray-600">/</span>
              <input type="number" step="0.5" value={settings.sl_pct}
                onChange={e => setSettings(s=>({...s, sl_pct: parseFloat(e.target.value)}))}
                className="w-14 bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 mb-1">Parallel</p>
            <div className="flex gap-1">
              {[2,4,6].map(v => (
                <button key={v} onClick={() => setSettings(s=>({...s, batch_size: v}))}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${settings.batch_size===v ? 'bg-brand text-black border-brand' : 'bg-surface border-surface-border text-gray-400'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {status && status.status !== 'idle' && (
          <div className="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isRunning && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
                <span className={`text-sm font-semibold ${isDone ? 'text-green-400' : isRunning ? 'text-white' : 'text-gray-400'}`}>
                  {isDone ? 'Complete!' : isRunning ? `Running — ${status.current}` : status.status === 'stopped' ? 'Stopped' : status.status}
                </span>
              </div>
              <span className="text-brand font-black text-lg">{pct}%</span>
            </div>
            <div className="h-3 bg-surface rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${isDone ? 'bg-green-400' : 'bg-brand'}`}
                style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] text-gray-600">{status.done} / {status.total} calls done</p>
          </div>
        )}

        {/* Tabs */}
        {coins.length > 0 && (
          <>
            <div className="flex bg-surface-card border border-surface-border rounded-xl p-0.5 gap-0.5 w-fit">
              {(['progress','coins','monthly'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${tab===t ? 'bg-brand text-black' : 'text-gray-400 hover:text-white'}`}>
                  {t === 'progress' ? 'Live Log' : t === 'coins' ? 'Coin Ranking' : 'Monthly Heatmap'}
                </button>
              ))}
            </div>

            {/* Live log */}
            {tab === 'progress' && (
              <div ref={logRef} className="bg-black/40 border border-surface-border rounded-xl p-4 h-96 overflow-y-auto font-mono text-xs text-gray-400 space-y-0.5">
                {(status?.log ?? []).map((line: string, i: number) => (
                  <div key={i} className={
                    line.startsWith('===') ? 'text-brand font-bold mt-2' :
                    line.includes('ERROR') ? 'text-red-400' :
                    line.includes('Complete') ? 'text-green-400 font-bold' :
                    'text-gray-400'
                  }>{line}</div>
                ))}
                {isRunning && <div className="text-brand animate-pulse">▌</div>}
              </div>
            )}

            {/* Coin ranking table */}
            {tab === 'coins' && (
              <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface border-b border-surface-border text-gray-500 text-xs">
                    <tr>
                      {['#','Coin','Grade','Trades','Wins','Losses','Win Rate','EV%','PnL Sum%'].map(h => (
                        <th key={h} className="px-4 py-3 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coins.map((c: any, i: number) => {
                      const gc   = GRADE_CLR[c.grade] ?? GRADE_CLR.D
                      const col  = COIN_COLORS[c.coin] ?? '#888'
                      const evS  = c.ev >= 0 ? `+${c.ev}%` : `${c.ev}%`
                      const pnlS = c.pnl >= 0 ? `+${c.pnl}%` : `${c.pnl}%`
                      return (
                        <tr key={c.coin}
                          onClick={() => { setSelCoin(c.coin); setTab('monthly') }}
                          className="border-b border-surface-border hover:bg-surface-hover cursor-pointer transition-colors">
                          <td className="px-4 py-2.5 text-gray-600 text-xs">{i+1}</td>
                          <td className="px-4 py-2.5">
                            <span className="font-bold text-sm" style={{color: col}}>
                              {c.coin.replace('USDT','')}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs font-black px-2 py-0.5 rounded border ${gc}`}>{c.grade}</span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-300">{c.trades.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-green-400">{c.wins.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-red-400">{c.losses.toLocaleString()}</td>
                          <td className="px-4 py-2.5">
                            <span className={`font-bold ${c.wr >= 50 ? 'text-green-400' : c.wr >= 45 ? 'text-yellow-400' : c.wr >= 33.4 ? 'text-orange-400' : 'text-red-400'}`}>
                              {c.wr}%
                            </span>
                          </td>
                          <td className={`px-4 py-2.5 font-mono font-bold ${c.ev >= 0 ? 'text-green-400' : 'text-red-400'}`}>{evS}</td>
                          <td className={`px-4 py-2.5 font-mono ${c.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pnlS}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Monthly heatmap */}
            {tab === 'monthly' && (
              <div className="space-y-3">
                {/* Coin selector */}
                <div className="flex flex-wrap gap-2">
                  {coins.map((c:any) => {
                    const col = COIN_COLORS[c.coin] ?? '#888'
                    const sel = selCoin === c.coin
                    return (
                      <button key={c.coin} onClick={() => setSelCoin(c.coin)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${sel ? 'border-brand bg-brand/10' : 'border-surface-border bg-surface text-gray-500 hover:text-gray-300'}`}
                        style={sel ? {color: col} : {}}>
                        {c.coin.replace('USDT','')}
                        <span className={`ml-1.5 text-[9px] ${GRADE_CLR[c.grade]?.split(' ')[0]}`}>{c.grade}</span>
                      </button>
                    )
                  })}
                </div>

                {selectedCoinData && (() => {
                  const monthly = selectedCoinData.monthly as Record<string, any>
                  const col     = COIN_COLORS[selectedCoinData.coin] ?? '#888'
                  return (
                    <div className="bg-surface-card border border-surface-border rounded-2xl p-5">
                      <h3 className="text-base font-bold mb-4" style={{color: col}}>
                        {selectedCoinData.coin.replace('USDT','')}
                        <span className="ml-3 text-xs text-gray-500 font-normal">
                          {selectedCoinData.trades.toLocaleString()} trades · {selectedCoinData.wr}% WR overall ·
                          Grade <span className={GRADE_CLR[selectedCoinData.grade]?.split(' ')[0]}>{selectedCoinData.grade}</span>
                        </span>
                      </h3>

                      {/* Heatmap grid */}
                      {[2024, 2025].map(year => {
                        const mths = Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`)
                        return (
                          <div key={year} className="mb-4">
                            <p className="text-xs text-gray-600 mb-2 font-semibold">{year}</p>
                            <div className="grid grid-cols-12 gap-1.5">
                              {mths.map((m, mi) => {
                                const stat = monthly[m]
                                if (!stat || stat.trades === 0) return (
                                  <div key={m} className="rounded-lg bg-surface p-2 text-center">
                                    <p className="text-[9px] text-gray-700">{MONTH_LABELS[mi]}</p>
                                    <p className="text-[10px] text-gray-700 mt-1">—</p>
                                  </div>
                                )
                                const wr   = stat.wins / stat.trades * 100
                                const pnl  = stat.pnl
                                const bg   = wr >= 55 ? 'bg-green-900/50 border-green-700/50' :
                                             wr >= 48 ? 'bg-green-900/30 border-green-700/30' :
                                             wr >= 40 ? 'bg-yellow-900/30 border-yellow-700/30' :
                                             wr >= 33.4 ? 'bg-orange-900/30 border-orange-700/30' :
                                             'bg-red-900/30 border-red-700/30'
                                const wrc  = wr >= 55 ? 'text-green-300' : wr >= 48 ? 'text-green-400' :
                                             wr >= 40 ? 'text-yellow-400' : wr >= 33.4 ? 'text-orange-400' : 'text-red-400'
                                return (
                                  <div key={m} className={`rounded-lg border p-2 text-center ${bg}`}>
                                    <p className="text-[9px] text-gray-500">{MONTH_LABELS[mi]}</p>
                                    <p className={`text-[11px] font-bold mt-0.5 ${wrc}`}>{wr.toFixed(0)}%</p>
                                    <p className="text-[9px] text-gray-600">{stat.trades}T</p>
                                    <p className={`text-[9px] font-mono ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}
                                    </p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}

                      {/* Monthly table */}
                      <div className="overflow-x-auto mt-4">
                        <table className="w-full text-xs">
                          <thead className="border-b border-surface-border text-gray-500">
                            <tr>
                              {['Month','Trades','Wins','Losses','Win Rate','EV%','PnL%','Grade'].map(h=>(
                                <th key={h} className="px-3 py-2 text-left">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ALL_MONTHS.map(m => {
                              const stat = monthly[m]
                              if (!stat || stat.trades === 0) return (
                                <tr key={m} className="border-b border-surface-border">
                                  <td className="px-3 py-1.5 text-gray-700">{m}</td>
                                  <td colSpan={7} className="px-3 py-1.5 text-gray-700">— no data</td>
                                </tr>
                              )
                              const wr  = stat.wins / stat.trades * 100
                              const ev  = (wr/100 * selectedCoinData.wr/100) - ((1-wr/100) * 1.5)
                              const gr  = wr >= 58 ? 'A' : wr >= 50 ? 'B' : wr >= 45 ? 'C' : wr >= 33.4 ? 'D' : 'F'
                              const gc  = GRADE_CLR[gr] ?? ''
                              const wrc = wr >= 50 ? 'text-green-400' : wr >= 40 ? 'text-yellow-400' : 'text-red-400'
                              const pnlc = stat.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                              const isSep = m.endsWith('-12')
                              return (
                                <tr key={m} className={`border-b border-surface-border hover:bg-surface-hover ${isSep ? 'border-b-surface' : ''}`}>
                                  <td className="px-3 py-1.5 text-gray-400 font-mono">{m}</td>
                                  <td className="px-3 py-1.5 text-gray-300">{stat.trades}</td>
                                  <td className="px-3 py-1.5 text-green-400">{stat.wins}</td>
                                  <td className="px-3 py-1.5 text-red-400">{stat.losses}</td>
                                  <td className={`px-3 py-1.5 font-bold ${wrc}`}>{wr.toFixed(1)}%</td>
                                  <td className={`px-3 py-1.5 font-mono ${ev >= 0 ? 'text-green-400' : 'text-red-400'}`}>{ev >= 0 ? '+' : ''}{ev.toFixed(2)}%</td>
                                  <td className={`px-3 py-1.5 font-mono ${pnlc}`}>{stat.pnl >= 0 ? '+' : ''}{stat.pnl.toFixed(1)}%</td>
                                  <td className="px-3 py-1.5">
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${gc}`}>{gr}</span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!status || status.status === 'idle' ? (
          <div className="text-center py-20 text-gray-600">
            <p className="text-2xl mb-3">📊</p>
            <p className="text-sm">Settings set karala "Start Full Run" click karanna</p>
            <p className="text-xs mt-1 text-gray-700">20 coins × 24 months = 480 API calls · ~30-60 minutes</p>
          </div>
        ) : null}

      </main>
    </div>
  )
}
