'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import TabBar from '@/components/layout/TabBar'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://algobot-backend.vercel.app'

const COIN_COLORS: Record<string, string> = {
  OPUSDT: '#378ADD', NEARUSDT: '#1D9E75', TIAUSDT: '#BA7517', SOLUSDT: '#7F77DD',
  INJUSDT: '#D4537E', LINKUSDT: '#888780', ETHUSDT: '#8A8EF2', BTCUSDT: '#F7931A',
  BNBUSDT: '#F3BA2F', XRPUSDT: '#346AA9', ADAUSDT: '#0033AD', DOGEUSDT: '#C3A634',
  AVAXUSDT: '#E84142', ARBUSDT: '#28A0F0', DOTUSDT: '#E6007A', APTUSDT: '#11BCA0',
  ATOMUSDT: '#6F4CFF', UNIUSDT: '#FF007A', LTCUSDT: '#BFBBBB', MATICUSDT: '#8247E5',
}

const COIN_LABEL: Record<string, string> = {
  OPUSDT: 'OP', NEARUSDT: 'NEAR', TIAUSDT: 'TIA', SOLUSDT: 'SOL',
  INJUSDT: 'INJ', LINKUSDT: 'LINK', ETHUSDT: 'ETH', BTCUSDT: 'BTC',
  BNBUSDT: 'BNB', XRPUSDT: 'XRP', ADAUSDT: 'ADA', DOGEUSDT: 'DOGE',
  AVAXUSDT: 'AVAX', ARBUSDT: 'ARB', DOTUSDT: 'DOT', APTUSDT: 'APT',
  ATOMUSDT: 'ATOM', UNIUSDT: 'UNI', LTCUSDT: 'LTC', MATICUSDT: 'MATIC',
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab() {
  const [sessions, setSessions] = useState<any[]>([])
  const [summary,  setSummary]  = useState<any>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [trades,   setTrades]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [h, s] = await Promise.all([
          fetch(`${API}/portfolio/history?limit=20`).then(r => r.json()),
          fetch(`${API}/portfolio/summary`).then(r => r.json()),
        ])
        setSessions(h.sessions ?? [])
        setSummary(s)
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  const expand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    const r = await fetch(`${API}/portfolio/history/${id}/trades`).then(r => r.json())
    setTrades(r.trades ?? [])
  }

  if (loading) return <div className="text-center py-20 text-gray-500">Loading...</div>

  return (
    <div className="space-y-5">
      {summary && !summary.error && (
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: 'Total Trades', value: summary.total_trades,     color: 'text-white'   },
            { label: 'Wins',         value: summary.wins,             color: 'text-green-400'},
            { label: 'Losses',       value: summary.losses,           color: 'text-red-400'  },
            { label: 'Win Rate',     value: `${summary.win_rate}%`,   color: 'text-brand'    },
            { label: 'Total PnL',    value: `${summary.total_pnl_usdt >= 0 ? '+' : ''}$${summary.total_pnl_usdt}`,
              color: summary.total_pnl_usdt >= 0 ? 'text-green-400' : 'text-red-400' },
            { label: 'Best Coin',
              value: summary.coin_pnl
                ? Object.entries(summary.coin_pnl as Record<string,number>).sort((a,b) => b[1]-a[1])[0]?.[0]?.replace('USDT','') ?? '—'
                : '—',
              color: 'text-brand' },
          ].map(s => (
            <div key={s.label} className="bg-surface-card border border-surface-border rounded-lg p-3 text-center">
              <p className="text-[10px] text-gray-500 mb-1">{s.label}</p>
              <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-16 text-gray-500">No sessions yet. Start a portfolio session first.</div>
      ) : sessions.map((s: any) => {
        const pnl = s.total_pnl_usdt ?? 0
        const wr  = s.total_trades > 0 ? ((s.wins / s.total_trades) * 100).toFixed(1) : '—'
        const isExp = expanded === s.id
        return (
          <div key={s.id} className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
            <button onClick={() => expand(s.id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover text-left">
              <div className="flex items-center gap-4">
                <span className={`w-2 h-2 rounded-full ${s.status === 'running' ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
                <span className="text-white font-bold">{s.id}</span>
                <span className="text-xs text-gray-500">{s.coins?.length ?? 20} coins · {s.total_trades} trades · {wr}% WR</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-surface text-gray-500">{s.mode ?? 'paper'}</span>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-[10px] text-gray-600">Balance</p>
                  <p className="text-white font-semibold">${(s.balance ?? s.initial_balance)?.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-600">Net PnL</p>
                  <p className={`font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-600">Started</p>
                  <p className="text-gray-400 text-xs">{new Date(s.started_at).toLocaleDateString()}</p>
                </div>
                <span className="text-gray-500">{isExp ? '▲' : '▼'}</span>
              </div>
            </button>
            {isExp && (
              <div className="border-t border-surface-border overflow-x-auto max-h-60 overflow-y-auto">
                {trades.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-gray-600">No closed trades.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface-card border-b border-surface-border">
                      <tr className="text-gray-500 text-left">
                        <th className="px-3 py-2">Coin</th>
                        <th className="px-3 py-2">Dir</th>
                        <th className="px-3 py-2">Entry</th>
                        <th className="px-3 py-2">Exit</th>
                        <th className="px-3 py-2">Result</th>
                        <th className="px-3 py-2">PnL %</th>
                        <th className="px-3 py-2">Profit $</th>
                        <th className="px-3 py-2">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t: any, i: number) => (
                        <tr key={i} className="border-b border-surface-border hover:bg-surface-hover">
                          <td className="px-3 py-2">
                            <span className="font-bold text-[11px]" style={{ color: COIN_COLORS[t.coin] ?? '#888' }}>
                              {COIN_LABEL[t.coin] ?? t.coin}
                            </span>
                          </td>
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
                          <td className={`px-3 py-2 font-mono ${(t.profit_usdt ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {(t.profit_usdt ?? 0) >= 0 ? '+' : ''}${t.profit_usdt}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{t.closed_at ? new Date(t.closed_at).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Coin Card ────────────────────────────────────────────────────────────────
function CoinCard({ coin, state }: { coin: string; state: any }) {
  const color  = COIN_COLORS[coin] ?? '#888'
  const label  = COIN_LABEL[coin] ?? coin.replace('USDT', '')
  const status = state?.status ?? 'waiting'
  const pos    = state?.open_position
  const price  = state?.current_price
  const pnl    = state?.pnl_usdt ?? 0
  const wins   = state?.wins   ?? 0
  const losses = state?.losses ?? 0

  const statusBadge = status === 'open'
    ? { text: 'OPEN', cls: 'bg-green-500/20 text-green-400 animate-pulse' }
    : status === 'waiting'
    ? { text: 'WAIT', cls: 'bg-gray-700 text-gray-500' }
    : status === 'low_balance'
    ? { text: 'NO BAL', cls: 'bg-red-900/50 text-red-400' }
    : { text: '—', cls: 'bg-gray-800 text-gray-600' }

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-3 flex flex-col gap-2 hover:border-opacity-80 transition-all"
      style={{ borderColor: status === 'open' ? color + '66' : undefined }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color }}>{label}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusBadge.cls}`}>
          {statusBadge.text}
        </span>
      </div>

      <div className="text-[11px] text-gray-500 font-mono">
        {price ? `$${price > 100 ? price.toFixed(2) : price.toFixed(4)}` : '—'}
      </div>

      {pos ? (
        <div className="space-y-1">
          <div className={`text-[11px] font-bold ${pos.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
            {pos.direction === 'long' ? '▲ LONG' : '▼ SHORT'} @ {pos.entry}
          </div>
          {/* mini progress bar */}
          {price && (() => {
            const range = pos.tp2 - pos.sl
            const pct   = range > 0 ? Math.max(0, Math.min(100, ((price - pos.sl) / range) * 100)) : 50
            return (
              <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-400 rounded-full"
                  style={{ width: `${pct}%` }} />
              </div>
            )
          })()}
          <div className="flex justify-between text-[9px] text-gray-700">
            <span>SL {pos.sl?.toFixed ? pos.sl.toFixed(4) : pos.sl}</span>
            <span>TP {pos.tp?.toFixed ? pos.tp.toFixed(4) : pos.tp}</span>
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-gray-700 mt-auto">
          {wins > 0 || losses > 0
            ? `${wins}W / ${losses}L · ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(1)}`
            : 'No trades yet'}
        </div>
      )}
    </div>
  )
}

// Goal tracker helper
function calcMonthsToGoal(balance: number, tradeUsdt: number, goalUsdt: number, winRate: number, tpPct: number, slPct: number, tradesPerMonth: number) {
  const wr = winRate / 100
  const avgPnlPerTrade = wr * (tpPct / 100 * tradeUsdt) - (1 - wr) * (slPct / 100 * tradeUsdt)
  const monthlyProfit = avgPnlPerTrade * tradesPerMonth
  if (monthlyProfit <= 0) return null
  const remaining = goalUsdt - balance
  if (remaining <= 0) return 0
  return Math.ceil(remaining / monthlyProfit)
}

// ─── Live Tab ─────────────────────────────────────────────────────────────────
function LiveTab() {
  const [portfolio,   setPortfolio]   = useState<any>(null)
  const [pid,         setPid]         = useState<string | null>(null)
  const [isStarting,  setIsStarting]  = useState(false)
  const [useDemoKey,  setUseDemoKey]  = useState(false)
  // Capital config
  const [startBal,    setStartBal]    = useState(100)
  const [posPct,      setPosPct]      = useState(5)
  const [goalUsdt,    setGoalUsdt]    = useState(500)
  // TP/SL config
  const [tpPct,       setTpPct]       = useState(2.0)
  const [tp2Pct,      setTp2Pct]      = useState(4.0)
  const [slPct,       setSlPct]       = useState(1.5)

  const tradeUsdt = useMemo(() => Math.max(1, (startBal * posPct) / 100), [startBal, posPct])

  const pollRef = useRef<NodeJS.Timeout | null>(null)

  const fetchStatus = useCallback(async (id: string) => {
    try {
      const r = await fetch(`${API}/portfolio/status/${id}`)
      const data = await r.json()
      if (data.status !== 'not_found') setPortfolio(data)
    } catch {}
  }, [])

  useEffect(() => {
    if (!pid) return
    pollRef.current = setInterval(() => fetchStatus(pid), 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [pid, fetchStatus])

  const handleStart = async () => {
    setIsStarting(true)
    try {
      const r = await fetch(`${API}/portfolio/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interval: '1h',
          virtual_balance: startBal,
          trade_usdt: tradeUsdt,
          tp_pct: tpPct, tp2_pct: tp2Pct, sl_pct: slPct,
          use_trend_filter: true,
          use_session_filter: true,
          use_demo_binance: useDemoKey,
        }),
      })
      const data = await r.json()
      if (data.portfolio_id) {
        setPid(data.portfolio_id)
        await fetchStatus(data.portfolio_id)
      }
    } catch (e) {
      alert('Start failed: ' + e)
    }
    setIsStarting(false)
  }

  const handleStop = async () => {
    if (!pid) return
    await fetch(`${API}/portfolio/stop/${pid}`, { method: 'POST' })
    if (portfolio) setPortfolio({ ...portfolio, status: 'stopped' })
    if (pollRef.current) clearInterval(pollRef.current)
  }

  const p            = portfolio
  const isRunning    = p?.status === 'running'
  const balance      = p?.balance        ?? startBal
  const initBal      = p?.initial_balance ?? startBal
  const profit       = balance - initBal
  const wins         = p?.wins ?? 0
  const losses       = p?.losses ?? 0
  const totalTrades  = p?.total_trades ?? 0
  const coinStates   = p?.coin_states ?? {}
  const activeCount  = Object.values(coinStates).filter((cs: any) => cs.open_position).length
  const allCoins     = p?.coins ?? Object.keys(COIN_COLORS)

  const liveWinRate  = totalTrades > 0 ? (wins / totalTrades) * 100 : 50
  const monthsNeeded = calcMonthsToGoal(balance, tradeUsdt, goalUsdt, liveWinRate, tpPct, slPct, 30)
  const goalPct      = Math.min(100, ((balance - initBal) / (goalUsdt - initBal)) * 100)

  return (
    <div className="space-y-5">
      {/* START PANEL */}
      {!p && (
        <div className="space-y-4">
          {/* Capital Setup */}
          <div className="bg-gradient-to-br from-brand/10 via-surface-card to-surface-card border border-brand/30 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-1">Capital Setup</h2>
            <p className="text-xs text-gray-500 mb-5">Configure your starting capital and risk per trade</p>

            <div className="grid grid-cols-3 gap-4 mb-5">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Starting Balance (USDT)</label>
                <input type="number" min="10" step="10" value={startBal}
                  onChange={e => setStartBal(Number(e.target.value))}
                  className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand font-mono" />
                <p className="text-[10px] text-gray-600 mt-1">Your real starting capital</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Risk per Trade (%)</label>
                <div className="flex gap-2">
                  {[2, 3, 5, 10].map(v => (
                    <button key={v} onClick={() => setPosPct(v)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${posPct === v ? 'bg-brand text-black' : 'bg-surface border border-surface-border text-gray-400 hover:text-white'}`}>
                      {v}%
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600 mt-1">% of balance per trade</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Profit Goal (USDT)</label>
                <input type="number" min="50" step="50" value={goalUsdt}
                  onChange={e => setGoalUsdt(Number(e.target.value))}
                  className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand font-mono" />
                <p className="text-[10px] text-gray-600 mt-1">Target cumulative profit</p>
              </div>
            </div>

            {/* Trade size preview */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Trade Size', value: `$${tradeUsdt.toFixed(2)}`, sub: `${posPct}% of $${startBal}`, color: 'text-brand' },
                { label: 'Max Profit/Trade', value: `+$${(tradeUsdt * tpPct / 100).toFixed(2)}`, sub: `TP1 ${tpPct}%`, color: 'text-green-400' },
                { label: 'Max Loss/Trade', value: `-$${(tradeUsdt * slPct / 100).toFixed(2)}`, sub: `SL ${slPct}%`, color: 'text-red-400' },
                {
                  label: 'Months to $' + goalUsdt,
                  value: monthsNeeded !== null ? (monthsNeeded === 0 ? 'Done!' : `~${monthsNeeded} mo`) : '—',
                  sub: '50% WR estimate',
                  color: 'text-yellow-400',
                },
              ].map(s => (
                <div key={s.label} className="bg-surface/60 rounded-lg p-3 text-center">
                  <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
                  <p className="text-[9px] text-gray-700">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* TP/SL row */}
            <div className="grid grid-cols-3 gap-3 mb-5">
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

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Coin list:</span>
                <span className="text-xs text-gray-300 font-semibold">All 20 coins · Best strategies auto-loaded</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setUseDemoKey(!useDemoKey)}
                    className={`w-9 h-5 rounded-full transition-colors relative ${useDemoKey ? 'bg-brand' : 'bg-gray-700'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${useDemoKey ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <span className="text-xs text-gray-500">Demo Binance orders</span>
                </div>
                <button onClick={handleStart} disabled={isStarting}
                  className="px-8 py-2.5 bg-brand hover:bg-brand/90 text-black font-bold text-sm rounded-xl transition-colors disabled:opacity-50">
                  {isStarting ? 'Starting...' : `⚡ Start — $${startBal} Capital`}
                </button>
              </div>
            </div>
          </div>

          {/* Coin chips */}
          <div className="bg-surface-card border border-surface-border rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-3">20 coins running simultaneously — each uses its own best strategy from 2024-2025 backtest</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(COIN_LABEL).map(([coin, label]) => (
                <span key={coin} className="text-[11px] px-2 py-1 rounded-lg font-semibold"
                  style={{ background: (COIN_COLORS[coin] ?? '#888') + '22', color: COIN_COLORS[coin] ?? '#888' }}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Settings summary */}
          <div className="bg-surface-card border border-surface-border rounded-xl px-5 py-3 text-xs grid grid-cols-4 gap-4 text-center">
            {[
              { label: 'Interval',  value: '1h candles' },
              { label: 'Filters',   value: 'EMA200 + Session 08–20 UTC' },
              { label: 'Direction', value: 'Long + Short' },
              { label: 'Strategy',  value: 'Best per coin from backtest' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-gray-500">{s.label}</p>
                <p className="text-gray-200 font-semibold mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ACTIVE DASHBOARD */}
      {p && (
        <>
          {/* Header stats */}
          <div className="grid grid-cols-7 gap-3">
            {[
              { label: 'Balance',       value: `$${balance.toFixed(2)}`,                  color: 'text-white'    },
              { label: 'Net Profit',    value: `${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`,
                color: profit >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'Total Trades',  value: totalTrades,                               color: 'text-gray-300' },
              { label: 'Win Rate',      value: totalTrades > 0 ? `${(wins/totalTrades*100).toFixed(1)}%` : '—', color: 'text-brand' },
              { label: 'W / L',         value: `${wins} / ${losses}`,                    color: 'text-gray-300' },
              { label: 'Open Now',      value: `${activeCount} / ${allCoins.length}`,     color: 'text-yellow-400'},
              { label: 'Mode',          value: p.mode === 'demo' ? 'Demo Binance' : 'Virtual', color: p.mode === 'demo' ? 'text-green-400' : 'text-gray-400' },
            ].map(s => (
              <div key={s.label} className="bg-surface-card border border-surface-border rounded-lg p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">{s.label}</p>
                <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Goal Tracker */}
          {goalUsdt > 0 && (
            <div className="bg-surface-card border border-surface-border rounded-xl px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Profit Goal Tracker
                    <span className="ml-2 text-xs text-gray-500 font-normal">${initBal.toFixed(0)} → ${(initBal + goalUsdt).toFixed(0)}</span>
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Current profit: <span className={profit >= 0 ? 'text-green-400' : 'text-red-400'}>${profit.toFixed(2)}</span>
                    {monthsNeeded !== null && monthsNeeded > 0 && (
                      <span className="ml-2 text-yellow-400">~{monthsNeeded} month{monthsNeeded > 1 ? 's' : ''} to go at current rate</span>
                    )}
                    {monthsNeeded === 0 && <span className="ml-2 text-green-400 font-bold">GOAL REACHED!</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-brand">{Math.max(0, goalPct).toFixed(1)}%</p>
                  <p className="text-[10px] text-gray-600">of goal</p>
                </div>
              </div>
              <div className="h-3 bg-surface rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${goalPct >= 100 ? 'bg-green-400' : 'bg-brand'}`}
                  style={{ width: `${Math.max(0, Math.min(100, goalPct))}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>$0</span>
                <span>Goal: +${goalUsdt}</span>
              </div>
            </div>
          )}

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isRunning ? (
                <>
                  <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-green-400 font-semibold text-sm">RUNNING — {activeCount} open positions</span>
                </>
              ) : (
                <span className="text-gray-500 text-sm">Stopped</span>
              )}
            </div>
            <div className="flex gap-3">
              {isRunning && (
                <button onClick={handleStop}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors">
                  Stop All
                </button>
              )}
              <button onClick={() => { setPortfolio(null); setPid(null) }}
                className="px-4 py-2 border border-surface-border text-gray-400 text-sm rounded-lg hover:border-gray-500 transition-colors">
                New Session
              </button>
            </div>
          </div>

          {/* 20-coin grid */}
          <div className="grid grid-cols-5 gap-3">
            {allCoins.map((coin: string) => (
              <CoinCard key={coin} coin={coin} state={coinStates[coin]} />
            ))}
          </div>

          {/* Recent closed trades */}
          <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-border">
              <h3 className="text-sm font-semibold text-white">
                Recent Closed Trades
                {totalTrades > 0 && <span className="ml-2 text-xs text-gray-500">({totalTrades} total)</span>}
              </h3>
            </div>
            {totalTrades === 0 ? (
              <div className="p-8 text-center text-gray-600 text-sm">
                No closed trades yet. Signals take up to 1h to appear (session filter: 08–20 UTC).
              </div>
            ) : (
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-card border-b border-surface-border">
                    <tr className="text-gray-500 text-left">
                      <th className="px-3 py-2">Coin</th>
                      <th className="px-3 py-2">Dir</th>
                      <th className="px-3 py-2">Entry</th>
                      <th className="px-3 py-2">Exit</th>
                      <th className="px-3 py-2">Result</th>
                      <th className="px-3 py-2">PnL %</th>
                      <th className="px-3 py-2">Profit $</th>
                      <th className="px-3 py-2">Balance</th>
                      <th className="px-3 py-2">Closed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const allTrades: any[] = []
                      Object.entries(coinStates).forEach(([coin, cs]: [string, any]) => {
                        (cs.closed_trades ?? []).forEach((t: any) => allTrades.push({ ...t, coin }))
                      })
                      allTrades.sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())
                      let runBal = initBal
                      return allTrades.map((t: any, i: number) => {
                        runBal += (t.profit_usdt ?? 0)
                        return (
                          <tr key={i} className="border-b border-surface-border hover:bg-surface-hover">
                            <td className="px-3 py-2">
                              <span className="font-bold text-[11px]" style={{ color: COIN_COLORS[t.coin] ?? '#888' }}>
                                {COIN_LABEL[t.coin] ?? t.coin}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`font-bold ${t.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
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
                            <td className={`px-3 py-2 font-mono font-bold ${(t.profit_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {(t.profit_pct ?? 0) >= 0 ? '+' : ''}{t.profit_pct}%
                            </td>
                            <td className={`px-3 py-2 font-mono ${(t.profit_usdt ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {(t.profit_usdt ?? 0) >= 0 ? '+' : ''}${t.profit_usdt}
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-400">${runBal.toFixed(2)}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{new Date(t.closed_at).toLocaleString()}</td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const [tab, setTab] = useState<'live' | 'history'>('live')

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-4 py-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-bold text-white">
              Portfolio Trade
              <span className="ml-2 text-xs font-normal text-gray-500">
                All 20 coins · Simultaneous · Best strategies from 2-year backtest
              </span>
            </h1>
            <p className="text-xs text-gray-600 mt-0.5">
              Paper mode (virtual) → prove profitable → add demo Binance API keys → real testnet orders
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
          </div>
        </div>

        {tab === 'live' ? <LiveTab /> : <HistoryTab />}
      </main>
    </div>
  )
}
