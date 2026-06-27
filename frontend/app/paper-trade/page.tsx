'use client'
import { useState, useEffect, useRef } from 'react'
import TabBar from '@/components/layout/TabBar'
import { usePaperTrade } from '@/hooks/usePaperTrade'
import { useLogStream } from '@/hooks/useLogStream'
import { COIN_BEST_SETTINGS } from '@/lib/constants'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const TOP_COINS = [
  { coin: 'NEARUSDT', label: 'NEAR', wr: 48.75, pnl: 405.5, color: '#1D9E75' },
  { coin: 'OPUSDT',   label: 'OP',   wr: 49.19, pnl: 387.5, color: '#378ADD' },
  { coin: 'TIAUSDT',  label: 'TIA',  wr: 45.03, pnl: 258.5, color: '#BA7517' },
  { coin: 'SOLUSDT',  label: 'SOL',  wr: 43.13, pnl: 146.5, color: '#7F77DD' },
  { coin: 'INJUSDT',  label: 'INJ',  wr: 43.54, pnl: 134.0, color: '#D4537E' },
  { coin: 'LINKUSDT', label: 'LINK', wr: 43.61, pnl: 137.5, color: '#888780' },
]

const VIRTUAL_BALANCE = 5000
const TRADE_USDT = 100

// ─── DB History Tab ───────────────────────────────────────────────────────────
function HistoryTab() {
  const [sessions, setSessions] = useState<any[]>([])
  const [summary,  setSummary]  = useState<any>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [trades,   setTrades]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [h, s] = await Promise.all([
          fetch(`${API}/paper-trade/history?limit=30`).then(r => r.json()),
          fetch(`${API}/paper-trade/summary`).then(r => r.json()),
        ])
        setSessions(h.sessions ?? [])
        setSummary(s)
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const toggleSession = async (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    try {
      const r = await fetch(`${API}/paper-trade/history/${id}/trades`).then(r => r.json())
      setTrades(r.trades ?? [])
    } catch { setTrades([]) }
  }

  if (loading) return (
    <div className="text-center py-20 text-gray-500 text-sm">Loading history...</div>
  )

  return (
    <div className="space-y-5">
      {/* Overall summary */}
      {summary && !summary.error && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total Trades', value: summary.total_trades, color: 'text-white' },
            { label: 'Wins',   value: summary.wins,     color: 'text-green-400' },
            { label: 'Losses', value: summary.losses,   color: 'text-red-400'   },
            { label: 'Win Rate', value: `${summary.win_rate}%`, color: 'text-brand' },
            { label: 'Total PnL', value: `${summary.total_pnl_usdt >= 0 ? '+' : ''}$${summary.total_pnl_usdt}`,
              color: summary.total_pnl_usdt >= 0 ? 'text-green-400' : 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-surface-card border border-surface-border rounded-lg p-3 text-center">
              <p className="text-[10px] text-gray-500 mb-1">{s.label}</p>
              <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Session list */}
      {sessions.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">
          No sessions yet. Start a paper trade session first.
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-600 uppercase tracking-wider">All Sessions</p>
          {sessions.map((s: any) => {
            const pnl = s.total_pnl_usdt ?? 0
            const wr  = s.total_trades > 0 ? ((s.wins / s.total_trades) * 100).toFixed(1) : '—'
            const isExp = expanded === s.id
            return (
              <div key={s.id} className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleSession(s.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors text-left">
                  <div className="flex items-center gap-4">
                    <span className={`w-2 h-2 rounded-full ${s.status === 'running' ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
                    <div>
                      <span className="text-white font-bold text-sm">{s.coin}</span>
                      <span className="ml-2 text-[10px] text-gray-600">{s.id}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 bg-surface px-2 py-0.5 rounded">
                      {s.interval ?? '1h'} · ${s.trade_usdt ?? 100}/trade
                    </span>
                    <span className="text-xs text-gray-500">
                      {s.total_trades} trades · {wr}% WR
                    </span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-[10px] text-gray-600">Balance</p>
                      <p className="text-white font-semibold">${(s.final_balance ?? s.initial_balance)?.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-600">Net PnL</p>
                      <p className={`font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-600">Started</p>
                      <p className="text-gray-400 text-xs">{new Date(s.started_at).toLocaleDateString()}</p>
                    </div>
                    <span className="text-gray-500">{isExp ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isExp && (
                  <div className="border-t border-surface-border">
                    {trades.length === 0 ? (
                      <p className="px-4 py-4 text-xs text-gray-600">No closed trades for this session.</p>
                    ) : (
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-surface-card border-b border-surface-border">
                            <tr className="text-gray-500 text-left">
                              <th className="px-3 py-2">#</th>
                              <th className="px-3 py-2">Dir</th>
                              <th className="px-3 py-2">Entry</th>
                              <th className="px-3 py-2">Exit</th>
                              <th className="px-3 py-2">Result</th>
                              <th className="px-3 py-2">PnL %</th>
                              <th className="px-3 py-2">Profit $</th>
                              <th className="px-3 py-2">Opened</th>
                              <th className="px-3 py-2">Closed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trades.map((t: any, i: number) => (
                              <tr key={i} className="border-b border-surface-border hover:bg-surface-hover">
                                <td className="px-3 py-2 text-gray-600">{trades.length - i}</td>
                                <td className="px-3 py-2">
                                  <span className={`font-bold ${t.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                                    {t.direction === 'long' ? '▲ L' : '▼ S'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-gray-300">{t.entry_price}</td>
                                <td className="px-3 py-2 font-mono text-gray-300">{t.exit_price}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    t.exit_reason === 'Hit TP2' ? 'bg-green-900/60 text-green-300' :
                                    t.exit_reason === 'Hit TP1' ? 'bg-green-900/30 text-green-400' :
                                    'bg-red-900/50 text-red-400'
                                  }`}>{t.exit_reason}</span>
                                </td>
                                <td className={`px-3 py-2 font-mono font-bold ${(t.profit_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {(t.profit_pct ?? 0) >= 0 ? '+' : ''}{t.profit_pct}%
                                </td>
                                <td className={`px-3 py-2 font-mono font-semibold ${(t.profit_usdt ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {(t.profit_usdt ?? 0) >= 0 ? '+' : ''}${t.profit_usdt}
                                </td>
                                <td className="px-3 py-2 text-gray-600">{t.opened_at ? new Date(t.opened_at).toLocaleString() : '—'}</td>
                                <td className="px-3 py-2 text-gray-600">{t.closed_at ? new Date(t.closed_at).toLocaleString() : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Live Trade Tab ───────────────────────────────────────────────────────────
function LiveTab() {
  const { start, stop, session, error } = usePaperTrade()
  const { logs } = useLogStream()
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null)
  const [isStarting,   setIsStarting]   = useState(false)
  const [thinkLoading, setThinkLoading] = useState(false)
  const prevTradesLen = useRef(0)
  const [flashTrade,   setFlashTrade]   = useState(false)

  const isRunning = session?.status === 'running'
  const balance   = (session as any)?.balance ?? VIRTUAL_BALANCE
  const initBal   = (session as any)?.initial_balance ?? VIRTUAL_BALANCE
  const profit    = balance - initBal
  const wins      = (session as any)?.wins  ?? 0
  const losses    = (session as any)?.losses ?? 0
  const closedTrades: any[] = (session as any)?.closed_trades ?? []
  const openPos: any        = (session as any)?.open_position ?? null
  const currentPrice        = (session as any)?.current_price ?? null
  const totalPnlPct         = closedTrades.reduce((s: number, t: any) => s + (t.profit_pct ?? 0), 0)
  const unrealizedPnl       = openPos && currentPrice
    ? ((currentPrice - openPos.entry) / openPos.entry * 100 * (openPos.direction === 'long' ? 1 : -1))
    : null

  useEffect(() => {
    if (closedTrades.length > prevTradesLen.current && prevTradesLen.current > 0) {
      setFlashTrade(true)
      setTimeout(() => setFlashTrade(false), 2500)
    }
    prevTradesLen.current = closedTrades.length
  }, [closedTrades.length])

  const handleThink = async () => {
    if (!session) return
    setThinkLoading(true)
    try {
      await fetch(`${API}/paper-trade/think/${session.session_id ?? (session as any).id}`, { method: 'POST' })
    } catch {}
    setThinkLoading(false)
  }

  const handleStart = async (coin: string) => {
    setSelectedCoin(coin)
    setIsStarting(true)
    const best = COIN_BEST_SETTINGS[coin]
    await start({
      coin,
      strategy_primary: best?.strategies[0] ?? 'ichimoku',
      strategies: best?.strategies ?? ['ichimoku', 'volume_momentum'],
      interval: '1h',
      tp_pct: 2.0, tp2_pct: 4.0, sl_pct: 1.5,
      trade_usdt: TRADE_USDT,
      virtual_balance: VIRTUAL_BALANCE,
      ai_min_confidence: 60,
      use_trend_filter: true,
      trend_ema_period: 200,
      use_session_filter: true,
      min_confluence: best?.confluence ?? 1,
      position_pct: 0,
    })
    setIsStarting(false)
  }

  return (
    <div>
      {/* Balance header when running */}
      {session && (
        <div className="flex items-center justify-between mb-5 bg-surface-card border border-surface-border rounded-xl px-5 py-3">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] text-gray-500">Virtual Balance</p>
              <p className="text-white font-bold text-xl">${balance.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Net Profit</p>
              <p className={`font-bold text-lg ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Record</p>
              <p className="text-white font-semibold">{wins}W / {losses}L</p>
            </div>
          </div>
          {isRunning ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" /> LIVE — {session.coin}
              </div>
              <button onClick={stop}
                className="text-xs px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
                Stop Session
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-500 border border-surface-border rounded-lg px-3 py-2">Stopped</span>
          )}
        </div>
      )}

      {/* COIN QUICK-SELECT */}
      {!session && (
        <div className="mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
            Select coin to start — strategies auto-loaded from 2025 backtest
          </p>
          <div className="grid grid-cols-6 gap-3">
            {TOP_COINS.map(tc => {
              const best = COIN_BEST_SETTINGS[tc.coin]
              return (
                <button key={tc.coin}
                  onClick={() => handleStart(tc.coin)}
                  disabled={isStarting}
                  style={{ borderColor: tc.color + '55' }}
                  className="bg-surface-card border rounded-xl p-4 text-left hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base font-bold text-white">{tc.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: tc.color + '22', color: tc.color }}>
                      {tc.wr}%
                    </span>
                  </div>
                  <div className="text-lg font-bold" style={{ color: tc.color }}>+{tc.pnl}%</div>
                  <div className="text-[10px] text-gray-600 mt-0.5">2025 PnL (6mo)</div>
                  {best && (
                    <div className="text-[10px] text-gray-700 mt-2 leading-relaxed">
                      {best.strategies.slice(0, 2).join(' + ')}
                      {best.strategies.length > 2 && <span className="text-gray-800"> +{best.strategies.length - 2}</span>}
                    </div>
                  )}
                  {isStarting && selectedCoin === tc.coin && (
                    <div className="text-[10px] text-green-400 mt-1.5 animate-pulse font-semibold">Starting...</div>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-gray-700 mt-3">
            Virtual balance ${VIRTUAL_BALANCE.toLocaleString()} · Fixed $100 per trade · 1h candles · EMA200 + Session filter ON
          </p>
        </div>
      )}

      {/* ACTIVE SESSION */}
      {session && (
        <div className="grid grid-cols-12 gap-4">

          {/* Sidebar */}
          <div className="col-span-3 space-y-3">
            <div className="bg-surface-card border border-surface-border rounded-lg p-3 text-xs space-y-2">
              <div className="flex justify-between"><span className="text-gray-500">Coin</span><span className="text-white font-bold">{session.coin}</span></div>
              <div className="flex justify-between items-start">
                <span className="text-gray-500">Strategy</span>
                <span className="text-brand text-[10px] text-right max-w-[130px] leading-tight">
                  {(COIN_BEST_SETTINGS[session.coin]?.strategies ?? []).join(' + ') || session.strategy}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Confluence</span>
                <span className="text-white">{COIN_BEST_SETTINGS[session.coin]?.confluence ?? 1}-of-{COIN_BEST_SETTINGS[session.coin]?.strategies?.length ?? 1}</span>
              </div>
              <div className="flex justify-between"><span className="text-gray-500">Interval</span><span className="text-white">1h</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Per trade</span><span className="text-white">$100 fixed</span></div>
              <div className="flex justify-between"><span className="text-gray-500">TP1 / TP2 / SL</span><span className="text-white">2% / 4% / 1.5%</span></div>
              <hr className="border-surface-border" />
              <div className="flex justify-between">
                <span className="text-gray-500">Total PnL</span>
                <span className={`font-semibold ${totalPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last price</span>
                <span className="text-white font-mono">{currentPrice?.toFixed(4) ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Updated</span>
                <span className="text-gray-500">{session.last_check ? new Date(session.last_check).toLocaleTimeString() : '—'}</span>
              </div>
            </div>

            {/* Switch coin */}
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Switch coin</p>
              <div className="grid grid-cols-3 gap-1">
                {TOP_COINS.map(tc => (
                  <button key={tc.coin}
                    onClick={async () => { await stop(); setTimeout(() => handleStart(tc.coin), 600) }}
                    style={session.coin === tc.coin ? { borderColor: tc.color, color: tc.color } : {}}
                    className={`text-[11px] py-1.5 rounded-lg border transition-colors
                      ${session.coin === tc.coin ? 'font-bold' : 'border-surface-border text-gray-500 hover:border-gray-500'}`}>
                    {tc.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live log */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-2.5">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Live log</p>
              <div className="space-y-0.5 max-h-52 overflow-y-auto font-mono">
                {logs.slice(0, 25).map((log, i) => (
                  <p key={i} className={`text-[10px] leading-relaxed ${
                    log.level === 'ERROR' ? 'text-red-400' :
                    log.level === 'WARN'  ? 'text-yellow-400' : 'text-gray-600'
                  }`}>
                    <span className="text-gray-700">{log.ts?.slice(11,19)} </span>
                    {log.message}
                  </p>
                ))}
                {logs.length === 0 && <p className="text-[10px] text-gray-700">Waiting for signals...</p>}
              </div>
            </div>
          </div>

          {/* Main panel */}
          <div className="col-span-9 space-y-4">
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: 'Balance',    value: `$${balance.toFixed(2)}`,                                          color: 'text-white' },
                { label: 'Net Profit', value: `${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`,                  color: profit >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'Win Rate',   value: (wins+losses)>0 ? `${(wins/(wins+losses)*100).toFixed(1)}%` : '—', color: 'text-brand' },
                { label: 'W / L',      value: `${wins} / ${losses}`,                                             color: 'text-gray-300' },
                { label: 'Total PnL',  value: `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`,        color: totalPnlPct >= 0 ? 'text-green-400' : 'text-red-400' },
              ].map(s => (
                <div key={s.label} className="bg-surface-card border border-surface-border rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 mb-1">{s.label}</p>
                  <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* OPEN POSITION */}
            {openPos ? (
              <div className={`rounded-xl p-4 border-2 ${openPos.direction === 'long' ? 'bg-green-900/10 border-green-500/40' : 'bg-red-900/10 border-red-500/40'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${openPos.direction === 'long' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {openPos.direction === 'long' ? '▲ LONG' : '▼ SHORT'}
                    </span>
                    <span className="text-white font-bold text-lg">{openPos.symbol}</span>
                    <span className="text-xs text-gray-500 bg-surface-card px-2 py-0.5 rounded">${openPos.trade_usdt} position</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-sm text-green-400 font-bold">OPEN</span>
                    <button
                      onClick={handleThink}
                      disabled={thinkLoading}
                      title="Close now & save as 'Think' for later review"
                      className="ml-2 text-xs px-3 py-1 bg-yellow-900/30 border border-yellow-700/50 text-yellow-400 hover:bg-yellow-900/50 rounded-lg font-semibold transition-colors disabled:opacity-50">
                      {thinkLoading ? '…' : '🤔 Think (close early)'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-4 text-xs">
                  <div><p className="text-gray-500 mb-1">Entry price</p><p className="text-white font-mono font-semibold text-sm">{openPos.entry}</p></div>
                  <div><p className="text-gray-500 mb-1">Current</p><p className="text-white font-mono font-semibold text-sm">{currentPrice?.toFixed(4) ?? '—'}</p></div>
                  <div>
                    <p className="text-gray-500 mb-1">Unrealized</p>
                    <p className={`font-mono font-bold text-base ${unrealizedPnl !== null && unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {unrealizedPnl !== null ? `${unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}%` : '—'}
                    </p>
                  </div>
                  <div><p className="text-green-600 mb-1">Take Profit 1</p><p className="text-green-400 font-mono">{openPos.tp}</p></div>
                  <div><p className="text-green-500 mb-1">Take Profit 2</p><p className="text-green-300 font-mono">{openPos.tp2}</p></div>
                  <div><p className="text-red-600 mb-1">Stop Loss</p><p className="text-red-400 font-mono">{openPos.sl}</p></div>
                  <div><p className="text-gray-500 mb-1">Opened</p><p className="text-gray-400">{new Date(openPos.opened_at).toLocaleTimeString()}</p></div>
                </div>

                {currentPrice && openPos && (() => {
                  const range = openPos.tp2 - openPos.sl
                  const pos   = currentPrice - openPos.sl
                  const pct   = Math.max(0, Math.min(100, (pos / range) * 100))
                  return (
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                        <span>SL {openPos.sl}</span>
                        <span>TP1 {openPos.tp}</span>
                        <span>TP2 {openPos.tp2}</span>
                      </div>
                      <div className="h-1.5 bg-red-900/40 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div className="bg-surface-card border border-dashed border-surface-border rounded-xl p-6 text-center">
                <p className="text-gray-500 text-sm">No open position</p>
                <p className="text-gray-700 text-xs mt-1">
                  Scanning every 1h · waiting for {COIN_BEST_SETTINGS[session.coin]?.confluence ?? 1}-of-
                  {COIN_BEST_SETTINGS[session.coin]?.strategies?.length ?? 1} strategy confluence
                </p>
              </div>
            )}

            {/* CLOSED TRADES */}
            <div className={`bg-surface-card border rounded-xl overflow-hidden transition-all duration-500 ${flashTrade ? 'border-green-500/50' : 'border-surface-border'}`}>
              <div className="px-4 py-2.5 border-b border-surface-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  Closed Trades
                  {closedTrades.length > 0 && <span className="ml-2 text-xs text-gray-500 font-normal">({closedTrades.length})</span>}
                </h3>
                {flashTrade && <span className="text-xs text-green-400 font-bold animate-pulse">Trade closed!</span>}
              </div>

              {closedTrades.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-gray-600 text-sm">No completed trades yet</p>
                  <p className="text-gray-700 text-xs mt-1">First signal could take up to 1h (session + EMA200 filter active)</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface-card border-b border-surface-border">
                      <tr className="text-gray-500 text-left">
                        <th className="px-3 py-2 w-8">#</th>
                        <th className="px-3 py-2">Dir</th>
                        <th className="px-3 py-2">Entry</th>
                        <th className="px-3 py-2">Exit</th>
                        <th className="px-3 py-2">Result</th>
                        <th className="px-3 py-2">PnL %</th>
                        <th className="px-3 py-2">Profit $</th>
                        <th className="px-3 py-2">Balance after</th>
                        <th className="px-3 py-2">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let runBalance = initBal
                        const rows = [...closedTrades].map((t: any, idx: number) => {
                          runBalance = runBalance + (t.profit_usdt ?? 0)
                          return { ...t, balAfter: runBalance, idx }
                        })
                        return rows.reverse().map((t: any, i: number) => (
                          <tr key={i} className={`border-b border-surface-border transition-colors ${i === 0 && flashTrade ? 'bg-green-900/20' : 'hover:bg-surface-hover'}`}>
                            <td className="px-3 py-2 text-gray-600">{closedTrades.length - t.idx}</td>
                            <td className="px-3 py-2">
                              <span className={`font-bold text-[11px] ${t.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                                {t.direction === 'long' ? '▲ L' : '▼ S'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-300">{t.entry}</td>
                            <td className="px-3 py-2 font-mono text-gray-300">{t.exit_price}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                t.exit_reason === 'Hit TP2' ? 'bg-green-900/60 text-green-300' :
                                t.exit_reason === 'Hit TP1' ? 'bg-green-900/30 text-green-400' :
                                'bg-red-900/50 text-red-400'
                              }`}>{t.exit_reason}</span>
                            </td>
                            <td className={`px-3 py-2 font-mono font-bold ${t.profit_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {t.profit_pct >= 0 ? '+' : ''}{t.profit_pct}%
                            </td>
                            <td className={`px-3 py-2 font-mono font-semibold ${t.profit_usdt >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {t.profit_usdt >= 0 ? '+' : ''}${t.profit_usdt}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-400">${t.balAfter.toFixed(2)}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{new Date(t.closed_at).toLocaleString()}</td>
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}

// ─── Think Trades Tab ─────────────────────────────────────────────────────────
function ThinkTab() {
  const [trades, setTrades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const r = await fetch(`${API}/paper-trade/think-trades`).then(r => r.json())
        setTrades(r.trades ?? [])
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="text-center py-20 text-gray-500 text-sm">Loading think trades…</div>

  return (
    <div className="space-y-4">
      <div className="bg-yellow-900/10 border border-yellow-700/40 rounded-xl px-4 py-3">
        <p className="text-yellow-400 text-sm font-semibold">🤔 Think Trades — Manually closed early</p>
        <p className="text-xs text-gray-500 mt-0.5">These trades were in profit but TP was not hit. Closed manually for review.</p>
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">No think trades yet. Use the 🤔 button on an open position.</div>
      ) : (
        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-card border-b border-surface-border">
                <tr className="text-gray-500 text-left">
                  {['Coin','Dir','Entry','Exit Price','PnL%','Profit$','Opened','Closed','Session'].map(h => (
                    <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t: any, i: number) => (
                  <tr key={i} className="border-b border-surface-border hover:bg-surface-hover">
                    <td className="px-3 py-2 font-bold text-blue-400">{t.coin}</td>
                    <td className="px-3 py-2">
                      <span className={`font-bold ${t.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                        {t.direction === 'long' ? '▲ L' : '▼ S'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-300">{t.entry_price}</td>
                    <td className="px-3 py-2 font-mono text-yellow-300">{t.exit_price}</td>
                    <td className={`px-3 py-2 font-mono font-bold ${(t.profit_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(t.profit_pct ?? 0) >= 0 ? '+' : ''}{t.profit_pct}%
                    </td>
                    <td className={`px-3 py-2 font-mono font-semibold ${(t.profit_usdt ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(t.profit_usdt ?? 0) >= 0 ? '+' : ''}${t.profit_usdt}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{t.opened_at ? new Date(t.opened_at).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{t.closed_at ? new Date(t.closed_at).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 text-gray-600 font-mono text-[10px]">{t.session_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PaperTradePage() {
  const [tab, setTab] = useState<'live' | 'history' | 'think'>('live')

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-xl mx-auto px-4 py-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-bold text-white">
              Paper Trade
              <span className="ml-2 text-xs font-normal text-gray-500">
                Real Binance prices · Virtual $100/trade · EMA200 + Session filter ON
              </span>
            </h1>
            <p className="text-xs text-gray-600 mt-0.5">
              Prove strategy profitability before going live with real money
            </p>
          </div>
          <div className="flex bg-surface-card border border-surface-border rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setTab('live')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'live' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              Live Session
            </button>
            <button onClick={() => setTab('history')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'history' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              DB History
            </button>
            <button onClick={() => setTab('think')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'think' ? 'bg-yellow-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              🤔 Think Trades
            </button>
          </div>
        </div>

        {tab === 'live' ? <LiveTab /> : tab === 'history' ? <HistoryTab /> : <ThinkTab />}
      </main>
    </div>
  )
}
