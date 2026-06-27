'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import TabBar from '@/components/layout/TabBar'
import { getAllCoinsSummary } from '@/lib/api'
import { COIN_BEST_SETTINGS, INTERVALS } from '@/lib/constants'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://algobot-backend.vercel.app'

const COIN_COLORS: Record<string, string> = {
  OPUSDT:'#378ADD', NEARUSDT:'#1D9E75', TIAUSDT:'#BA7517', SOLUSDT:'#7F77DD',
  INJUSDT:'#D4537E', LINKUSDT:'#888780', ETHUSDT:'#8A8EF2', BTCUSDT:'#F7931A',
  BNBUSDT:'#F3BA2F', XRPUSDT:'#346AA9', ADAUSDT:'#0033AD', DOGEUSDT:'#C3A634',
  AVAXUSDT:'#E84142', ARBUSDT:'#28A0F0', DOTUSDT:'#E6007A', APTUSDT:'#11BCA0',
  ATOMUSDT:'#6F4CFF', UNIUSDT:'#FF007A', LTCUSDT:'#BFBBBB', MATICUSDT:'#8247E5',
}
const COIN_LABEL: Record<string, string> = {
  OPUSDT:'OP', NEARUSDT:'NEAR', TIAUSDT:'TIA', SOLUSDT:'SOL',
  INJUSDT:'INJ', LINKUSDT:'LINK', ETHUSDT:'ETH', BTCUSDT:'BTC',
  BNBUSDT:'BNB', XRPUSDT:'XRP', ADAUSDT:'ADA', DOGEUSDT:'DOGE',
  AVAXUSDT:'AVAX', ARBUSDT:'ARB', DOTUSDT:'DOT', APTUSDT:'APT',
  ATOMUSDT:'ATOM', UNIUSDT:'UNI', LTCUSDT:'LTC', MATICUSDT:'MATIC',
}
const ALL_COINS = Object.keys(COIN_LABEL)

function gradeOf(wr: number) {
  if (wr >= 58) return 'A'
  if (wr >= 50) return 'B'
  if (wr >= 45) return 'C'
  return 'D'
}
const GRADE_CLR: Record<string, string> = {
  A: 'text-green-400 border-green-600/50 bg-green-900/20',
  B: 'text-brand border-brand/50 bg-brand/10',
  C: 'text-yellow-400 border-yellow-600/50 bg-yellow-900/20',
  D: 'text-red-400 border-red-600/50 bg-red-900/20',
}

// ─── Coin Card (active dashboard) ────────────────────────────────────────────
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
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusBadge.cls}`}>{statusBadge.text}</span>
      </div>
      <div className="text-[11px] text-gray-500 font-mono">
        {price ? `$${price > 100 ? price.toFixed(2) : price.toFixed(4)}` : '—'}
      </div>
      {pos ? (
        <div className="space-y-1">
          <div className={`text-[11px] font-bold ${pos.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
            {pos.direction === 'long' ? '▲ LONG' : '▼ SHORT'} @ {pos.entry}
          </div>
          {price && (() => {
            const range = pos.tp2 - pos.sl
            const pct = range > 0 ? Math.max(0, Math.min(100, ((price - pos.sl) / range) * 100)) : 50
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
          {wins > 0 || losses > 0 ? `${wins}W / ${losses}L · ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(1)}` : 'No trades yet'}
        </div>
      )}
    </div>
  )
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
            { label: 'Total Trades', value: summary.total_trades,   color: 'text-white'   },
            { label: 'Wins',         value: summary.wins,           color: 'text-green-400'},
            { label: 'Losses',       value: summary.losses,         color: 'text-red-400'  },
            { label: 'Win Rate',     value: `${summary.win_rate}%`, color: 'text-brand'    },
            { label: 'Total PnL',
              value: `${summary.total_pnl_usdt >= 0 ? '+' : ''}$${summary.total_pnl_usdt}`,
              color: summary.total_pnl_usdt >= 0 ? 'text-green-400' : 'text-red-400' },
            { label: 'Best Coin',
              value: summary.coin_pnl
                ? Object.entries(summary.coin_pnl as Record<string,number>).sort((a,b)=>b[1]-a[1])[0]?.[0]?.replace('USDT','') ?? '—'
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
      {sessions.length === 0
        ? <div className="text-center py-16 text-gray-500">No sessions yet. Start a portfolio session first.</div>
        : sessions.map((s: any) => {
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
                  <span className="text-gray-500">{isExp ? '▲' : '▼'}</span>
                </div>
              </button>
              {isExp && (
                <div className="border-t border-surface-border overflow-x-auto max-h-60 overflow-y-auto">
                  {trades.length === 0
                    ? <p className="px-4 py-4 text-xs text-gray-600">No closed trades.</p>
                    : (
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-surface-card border-b border-surface-border">
                          <tr className="text-gray-500 text-left">
                            {['Coin','Dir','Entry','Exit','Result','PnL %','Profit $','Closed'].map(h => (
                              <th key={h} className="px-3 py-2">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {trades.map((t: any, i: number) => (
                            <tr key={i} className="border-b border-surface-border hover:bg-surface-hover">
                              <td className="px-3 py-2"><span className="font-bold text-[11px]" style={{ color: COIN_COLORS[t.coin] ?? '#888' }}>{COIN_LABEL[t.coin] ?? t.coin}</span></td>
                              <td className="px-3 py-2"><span className={`font-bold ${t.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>{t.direction === 'long' ? '▲ L' : '▼ S'}</span></td>
                              <td className="px-3 py-2 font-mono text-gray-300">{t.entry_price}</td>
                              <td className="px-3 py-2 font-mono text-gray-300">{t.exit_price}</td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  t.exit_reason === 'Hit TP2' ? 'bg-green-900/60 text-green-300' :
                                  t.exit_reason === 'Hit TP1' ? 'bg-green-900/30 text-green-400' :
                                  'bg-red-900/50 text-red-400'}`}>{t.exit_reason}</span>
                              </td>
                              <td className={`px-3 py-2 font-mono font-bold ${(t.profit_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{(t.profit_pct ?? 0) >= 0 ? '+' : ''}{t.profit_pct}%</td>
                              <td className={`px-3 py-2 font-mono ${(t.profit_usdt ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{(t.profit_usdt ?? 0) >= 0 ? '+' : ''}${t.profit_usdt}</td>
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

// ─── Live Tab ─────────────────────────────────────────────────────────────────
function LiveTab() {
  // Session
  const [portfolio,  setPortfolio]  = useState<any>(null)
  const [pid,        setPid]        = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [useDemoKey, setUseDemoKey] = useState(false)

  // Capital
  const [startBal, setStartBal] = useState(100000)
  const [posPct,   setPosPct]   = useState(5)
  const [goalUsdt, setGoalUsdt] = useState(500000)

  // Settings — smart defaults
  const [intervalVal, setIntervalVal] = useState('15m')
  const [useEma,      setUseEma]      = useState(true)
  const [useSession,  setUseSession]  = useState(false)
  const [tpPct,       setTpPct]       = useState(3.0)
  const [tp2Pct,      setTp2Pct]      = useState(4.5)
  const [slPct,       setSlPct]       = useState(1.5)

  // Coin data from DB
  const [coinData,      setCoinData]      = useState<Record<string, any>>({})
  const [selectedCoins, setSelectedCoins] = useState<string[]>([])
  const [dbLoading,     setDbLoading]     = useState(true)
  const [dbSource,      setDbSource]      = useState<'db'|'fallback'>('fallback')

  const pollRef  = useRef<NodeJS.Timeout | null>(null)
  const tradeUsdt = useMemo(() => Math.max(1, (startBal * posPct) / 100), [startBal, posPct])

  // Load coin data: DB first, hardcoded fallback
  const loadCoins = useCallback(async () => {
    setDbLoading(true)
    try {
      const d = await getAllCoinsSummary(10)
      const dbMap: Record<string, any> = {}
      for (const c of (d.coins ?? [])) {
        dbMap[c.coin] = { win_rate: c.best_win_rate, total_pnl: c.best_total_pnl, trades: c.best_trades, strategy: c.best_strategy, source: 'db' }
      }
      const merged: Record<string, any> = {}
      for (const coin of ALL_COINS) {
        merged[coin] = dbMap[coin] ?? {
          win_rate:   COIN_BEST_SETTINGS[coin]?.win_rate ?? 45,
          total_pnl:  COIN_BEST_SETTINGS[coin]?.total_pnl ?? 0,
          trades:     COIN_BEST_SETTINGS[coin]?.trades ?? 100,
          strategy:   COIN_BEST_SETTINGS[coin]?.strategies?.[0] ?? '—',
          source:     'fallback',
        }
      }
      setCoinData(merged)
      setDbSource(Object.values(merged).some((v: any) => v.source === 'db') ? 'db' : 'fallback')
      // Auto-select all profitable coins (WR above 33.3% break-even, add safety margin → 42%)
      const auto = ALL_COINS
        .filter(c => (merged[c]?.win_rate ?? 0) >= 42)
        .sort((a, b) => (merged[b]?.win_rate ?? 0) - (merged[a]?.win_rate ?? 0))
      setSelectedCoins(auto)
    } catch {
      const fb: Record<string, any> = {}
      for (const coin of ALL_COINS) {
        fb[coin] = { win_rate: COIN_BEST_SETTINGS[coin]?.win_rate ?? 45, total_pnl: COIN_BEST_SETTINGS[coin]?.total_pnl ?? 0, trades: COIN_BEST_SETTINGS[coin]?.trades ?? 100, strategy: COIN_BEST_SETTINGS[coin]?.strategies?.[0] ?? '—', source: 'fallback' }
      }
      setCoinData(fb)
      setSelectedCoins(ALL_COINS)
    }
    setDbLoading(false)
  }, [])

  useEffect(() => { loadCoins() }, [loadCoins])

  // Expected monthly per coin
  const calcCoinMonthly = useCallback((coin: string) => {
    const d = coinData[coin]
    if (!d || !d.trades) return 0
    const wr    = d.win_rate / 100
    const evPct = (wr * tpPct) - ((1 - wr) * slPct)
    if (evPct <= 0) return 0
    const perMonth1h   = d.trades / 18
    const tfMult       = intervalVal === '15m' ? 4 : intervalVal === '5m' ? 12 : intervalVal === '4h' ? 0.25 : 1
    const sessionMult  = useSession ? 0.5 : 1.0
    const monthlyTrades = perMonth1h * tfMult * sessionMult
    return (evPct / 100) * tradeUsdt * monthlyTrades
  }, [coinData, tpPct, slPct, intervalVal, useSession, tradeUsdt])

  const totalMonthly = useMemo(() =>
    selectedCoins.reduce((sum, c) => sum + calcCoinMonthly(c), 0),
    [selectedCoins, calcCoinMonthly])

  const avgWr = useMemo(() => {
    if (!selectedCoins.length) return 0
    return selectedCoins.reduce((s, c) => s + (coinData[c]?.win_rate ?? 0), 0) / selectedCoins.length
  }, [selectedCoins, coinData])

  // Coin selection helpers
  const toggleCoin = (coin: string) =>
    setSelectedCoins(prev => prev.includes(coin) ? prev.filter(c => c !== coin) : [...prev, coin])

  const selectTopN = (n: number) => {
    const sorted = ALL_COINS
      .filter(c => coinData[c])
      .sort((a, b) => (coinData[b]?.win_rate ?? 0) - (coinData[a]?.win_rate ?? 0))
      .slice(0, n)
    setSelectedCoins(sorted)
  }

  // Polling
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
    if (selectedCoins.length === 0) return alert('Select at least one coin')
    setIsStarting(true)
    try {
      const r = await fetch(`${API}/portfolio/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coins: selectedCoins,
          interval: intervalVal,
          virtual_balance: startBal,
          trade_usdt: tradeUsdt,
          tp_pct: tpPct, tp2_pct: tp2Pct, sl_pct: slPct,
          use_trend_filter: useEma,
          use_session_filter: useSession,
          use_demo_binance: useDemoKey,
        }),
      })
      const data = await r.json()
      if (data.portfolio_id) { setPid(data.portfolio_id); await fetchStatus(data.portfolio_id) }
    } catch (e) { alert('Start failed: ' + e) }
    setIsStarting(false)
  }

  const handleStop = async () => {
    if (!pid) return
    await fetch(`${API}/portfolio/stop/${pid}`, { method: 'POST' })
    if (portfolio) setPortfolio({ ...portfolio, status: 'stopped' })
    if (pollRef.current) clearInterval(pollRef.current)
  }

  // Active session state
  const p           = portfolio
  const isRunning   = p?.status === 'running'
  const balance     = p?.balance          ?? startBal
  const initBal     = p?.initial_balance  ?? startBal
  const profit      = balance - initBal
  const wins        = p?.wins    ?? 0
  const losses      = p?.losses  ?? 0
  const totalTrades = p?.total_trades ?? 0
  const coinStates  = p?.coin_states  ?? {}
  const activeCount = Object.values(coinStates).filter((cs: any) => cs.open_position).length
  const allCoins    = p?.coins ?? selectedCoins
  const goalPct     = Math.min(100, (profit / goalUsdt) * 100)
  const liveWr      = totalTrades > 0 ? (wins / totalTrades) * 100 : avgWr
  const monthsToGoal = useMemo(() => {
    const evPct = (liveWr/100 * tpPct) - ((1-liveWr/100) * slPct)
    if (evPct <= 0) return null
    const tfMult = intervalVal === '15m' ? 4 : 1
    const tradesPerMonth = (selectedCoins.length * 15) * tfMult
    const monthlyProfit = (evPct/100) * tradeUsdt * tradesPerMonth
    if (monthlyProfit <= 0) return null
    const remaining = goalUsdt - profit
    if (remaining <= 0) return 0
    return Math.ceil(remaining / monthlyProfit)
  }, [liveWr, tpPct, slPct, intervalVal, selectedCoins.length, tradeUsdt, goalUsdt, profit])

  // ── START PANEL ────────────────────────────────────────────────────────────
  if (!p) return (
    <div className="space-y-4">

      {/* STEP 1: Smart Coin Selection */}
      <div className="bg-surface-card border border-surface-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white">
              Step 1 — Smart Coin Selection
              {dbSource === 'db'
                ? <span className="ml-2 text-xs font-normal text-green-400">Live DB data</span>
                : <span className="ml-2 text-xs font-normal text-yellow-400">Fallback data — run a backtest first</span>}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Coins ranked by actual backtest win rate. Select which to trade.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadCoins} disabled={dbLoading}
              className="text-xs px-3 py-1.5 bg-surface border border-surface-border rounded-lg text-gray-400 hover:text-white hover:border-brand transition-colors disabled:opacity-40">
              {dbLoading ? 'Loading...' : '↻ Refresh DB'}
            </button>
            {[5,8,10,20].map(n => (
              <button key={n} onClick={() => selectTopN(n)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  selectedCoins.length === n ? 'bg-brand text-black border-brand' : 'bg-surface border-surface-border text-gray-400 hover:text-white hover:border-gray-500'}`}>
                Top {n === 20 ? 'All' : n}
              </button>
            ))}
          </div>
        </div>

        {dbLoading ? (
          <div className="text-center py-8 text-gray-500 text-sm">Loading coin rankings from DB...</div>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {ALL_COINS
              .slice()
              .sort((a, b) => (coinData[b]?.win_rate ?? 0) - (coinData[a]?.win_rate ?? 0))
              .map(coin => {
                const d   = coinData[coin]
                const wr  = d?.win_rate ?? 0
                const g   = gradeOf(wr)
                const gc  = GRADE_CLR[g]
                const sel = selectedCoins.includes(coin)
                const monthly = calcCoinMonthly(coin)
                const color   = COIN_COLORS[coin] ?? '#888'
                const breakEven = (wr / 100 * tpPct) - ((1 - wr / 100) * slPct)
                return (
                  <button key={coin} onClick={() => toggleCoin(coin)}
                    className={`text-left rounded-xl p-3 border transition-all ${
                      sel ? 'border-brand/60 bg-brand/5' : 'border-surface-border opacity-40 hover:opacity-70'}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold" style={{ color: sel ? color : '#666' }}>
                        {COIN_LABEL[coin]}
                      </span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${gc}`}>{g}</span>
                    </div>
                    <p className={`text-xs font-bold ${wr >= 50 ? 'text-green-400' : wr >= 44 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {wr.toFixed(1)}% WR
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      EV: {breakEven > 0 ? <span className="text-green-400">+{breakEven.toFixed(2)}%</span> : <span className="text-red-400">{breakEven.toFixed(2)}%</span>}
                    </p>
                    {monthly > 0 && sel && (
                      <p className="text-[10px] text-brand mt-0.5">~${monthly.toFixed(0)}/mo</p>
                    )}
                    {d?.source === 'db' && (
                      <p className="text-[9px] text-gray-700 mt-0.5">{d.trades} trades</p>
                    )}
                  </button>
                )
              })}
          </div>
        )}

        {/* Selection summary */}
        <div className="mt-4 flex items-center justify-between bg-surface rounded-xl px-4 py-3">
          <div className="flex items-center gap-6 text-sm">
            <span><span className="text-brand font-bold">{selectedCoins.length}</span> <span className="text-gray-500">coins selected</span></span>
            <span><span className={`font-bold ${avgWr >= 50 ? 'text-green-400' : 'text-yellow-400'}`}>{avgWr.toFixed(1)}%</span> <span className="text-gray-500">avg WR</span></span>
            <span><span className="text-white font-bold">${totalMonthly.toFixed(0)}</span> <span className="text-gray-500">estimated/month</span></span>
            <span><span className={`font-bold ${totalMonthly / startBal * 100 >= 10 ? 'text-green-400' : 'text-yellow-400'}`}>{(totalMonthly / startBal * 100).toFixed(1)}%</span> <span className="text-gray-500">monthly return</span></span>
          </div>
          <p className="text-xs text-gray-600">Break-even WR at 1:2 R:R = 33.3%</p>
        </div>
      </div>

      {/* STEP 2: Capital & Settings */}
      <div className="bg-surface-card border border-surface-border rounded-2xl p-5">
        <h2 className="text-base font-bold text-white mb-4">Step 2 — Capital & Settings</h2>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Capital (USDT)</label>
            <input type="number" min="100" step="100" value={startBal}
              onChange={e => setStartBal(Number(e.target.value))}
              className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Risk / Trade</label>
            <div className="flex gap-1.5">
              {[2,3,5,10].map(v => (
                <button key={v} onClick={() => setPosPct(v)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${posPct === v ? 'bg-brand text-black border-brand' : 'bg-surface border-surface-border text-gray-400 hover:text-white'}`}>
                  {v}%
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Goal (USDT profit)</label>
            <input type="number" min="1000" step="1000" value={goalUsdt}
              onChange={e => setGoalUsdt(Number(e.target.value))}
              className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Trade Size</label>
            <div className="bg-surface border border-brand/30 rounded-lg px-3 py-2">
              <p className="text-lg font-black text-brand font-mono">${tradeUsdt.toLocaleString()}</p>
              <p className="text-[10px] text-gray-600">{posPct}% of ${startBal.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Left: Interval + Filters */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Candle Interval</label>
              <div className="flex gap-1.5">
                {[
                  { v: '5m',  label: '5m',  note: '12×' },
                  { v: '15m', label: '15m', note: '4×'  },
                  { v: '1h',  label: '1h',  note: '1×'  },
                  { v: '4h',  label: '4h',  note: '0.25×' },
                ].map(i => (
                  <button key={i.v} onClick={() => setIntervalVal(i.v)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${intervalVal === i.v ? 'bg-brand text-black border-brand' : 'bg-surface border-surface-border text-gray-400 hover:text-white'}`}>
                    {i.label}
                    <span className="block text-[9px] font-normal opacity-70">{i.note} signals</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {[
                { label: 'EMA200 Trend Filter', sub: 'Quality control — trade with trend only', val: useEma, set: setUseEma, recommended: true },
                { label: 'Session Filter (UTC 8-20)', sub: 'OFF = 24/7 trading · 2× more trades', val: useSession, set: setUseSession, recommended: false },
                { label: 'Demo Binance Orders', sub: 'Requires API keys in Vercel env vars', val: useDemoKey, set: setUseDemoKey, recommended: false },
              ].map(f => (
                <div key={f.label} className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
                  <div>
                    <p className="text-xs text-gray-300">{f.label} {f.recommended && <span className="text-brand text-[9px] ml-1">● recommended</span>}</p>
                    <p className="text-[10px] text-gray-600">{f.sub}</p>
                  </div>
                  <button onClick={() => f.set(!f.val)}
                    className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${f.val ? 'bg-brand' : 'bg-gray-700'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${f.val ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right: TP / SL */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Risk:Reward Ratio</label>
              <div className="flex gap-1.5 mb-2">
                {[
                  { tp: 2.0, sl: 1.5, label: '1:1.3' },
                  { tp: 3.0, sl: 1.5, label: '1:2', best: true },
                  { tp: 4.5, sl: 1.5, label: '1:3' },
                ].map(r => (
                  <button key={r.label} onClick={() => { setTpPct(r.tp); setSlPct(r.sl); setTp2Pct(r.tp * 1.5) }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                      Math.abs(tpPct - r.tp) < 0.1
                        ? 'bg-brand text-black border-brand'
                        : 'bg-surface border-surface-border text-gray-400 hover:text-white'}`}>
                    {r.label}{r.best ? ' ★' : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'TP1 %', val: tpPct,  set: setTpPct  },
                { label: 'TP2 %', val: tp2Pct, set: setTp2Pct },
                { label: 'SL %',  val: slPct,  set: setSlPct  },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-[10px] text-gray-500 mb-1">{f.label}</label>
                  <input type="number" step="0.1" value={f.val} onChange={e => f.set(parseFloat(e.target.value))}
                    className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand font-mono" />
                </div>
              ))}
            </div>

            {/* R:R metrics */}
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[
                { label: 'Win earns',  value: `$${(tradeUsdt * tpPct / 100).toFixed(2)}`, color: 'text-green-400' },
                { label: 'Loss costs', value: `-$${(tradeUsdt * slPct / 100).toFixed(2)}`, color: 'text-red-400' },
                { label: 'Break-even', value: `${(slPct/(tpPct+slPct)*100).toFixed(1)}% WR`, color: 'text-gray-300' },
              ].map(s => (
                <div key={s.label} className="bg-surface rounded-lg p-2 text-center">
                  <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[9px] text-gray-600 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* STEP 3: Expected Outcome + Start */}
      <div className="bg-gradient-to-r from-brand/10 via-surface-card to-surface-card border border-brand/30 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white mb-1">Step 3 — Expected Outcome</h2>
            <div className="flex items-center gap-6 mt-2">
              <div>
                <p className="text-[10px] text-gray-500">Monthly profit est.</p>
                <p className="text-3xl font-black text-brand">${totalMonthly.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500">Monthly return</p>
                <p className={`text-3xl font-black ${totalMonthly/startBal*100 >= 10 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {(totalMonthly/startBal*100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500">Coins running</p>
                <p className="text-3xl font-black text-white">{selectedCoins.length}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500">Avg win rate</p>
                <p className={`text-3xl font-black ${avgWr >= 50 ? 'text-green-400' : avgWr >= 44 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {avgWr.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500">Candles</p>
                <p className="text-3xl font-black text-white">{intervalVal}</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-600 mt-2">
              Est. based on backtest WR × {intervalVal === '15m' ? '4×' : intervalVal === '5m' ? '12×' : '1×'} signal multiplier ×{useSession ? ' 0.5× (session on)' : ' 1.0× (24/7)'}
              · Conservative: divide by 2 for live slippage
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <button onClick={handleStart} disabled={isStarting || selectedCoins.length === 0}
              className="px-10 py-3.5 bg-brand hover:bg-brand/90 text-black font-black text-base rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap">
              {isStarting
                ? 'Starting...'
                : `⚡ Start — ${selectedCoins.length} coins · ${intervalVal}`}
            </button>
            <p className="text-[10px] text-gray-600">
              ${tradeUsdt.toLocaleString()} per trade · 1:{(tpPct/slPct).toFixed(1)} R:R · EMA200 {useEma ? 'ON' : 'OFF'} · Session {useSession ? 'ON' : 'OFF'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  // ── ACTIVE DASHBOARD ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-7 gap-3">
        {[
          { label: 'Balance',      value: `$${balance.toFixed(2)}`,                  color: 'text-white'     },
          { label: 'Net Profit',   value: `${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`, color: profit >= 0 ? 'text-green-400' : 'text-red-400' },
          { label: 'Total Trades', value: totalTrades,                               color: 'text-gray-300'  },
          { label: 'Win Rate',     value: totalTrades > 0 ? `${(wins/totalTrades*100).toFixed(1)}%` : '—', color: 'text-brand' },
          { label: 'W / L',        value: `${wins} / ${losses}`,                    color: 'text-gray-300'  },
          { label: 'Open Now',     value: `${activeCount} / ${allCoins.length}`,    color: 'text-yellow-400' },
          { label: 'Interval',     value: p.interval ?? intervalVal,                color: 'text-brand'     },
        ].map(s => (
          <div key={s.label} className="bg-surface-card border border-surface-border rounded-lg p-3 text-center">
            <p className="text-[10px] text-gray-500 mb-1">{s.label}</p>
            <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Goal tracker */}
      <div className="bg-surface-card border border-surface-border rounded-xl px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-white">
              Profit Goal Tracker
              <span className="ml-2 text-xs text-gray-500 font-normal">${initBal.toLocaleString()} → +${goalUsdt.toLocaleString()}</span>
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              Profit so far: <span className={profit >= 0 ? 'text-green-400' : 'text-red-400'}>${profit.toFixed(2)}</span>
              {monthsToGoal !== null && monthsToGoal > 0 && <span className="ml-2 text-yellow-400">~{monthsToGoal} month{monthsToGoal > 1 ? 's' : ''} remaining</span>}
              {monthsToGoal === 0 && <span className="ml-2 text-green-400 font-bold">GOAL REACHED!</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-brand">{Math.max(0, goalPct).toFixed(1)}%</p>
            <p className="text-[10px] text-gray-600">of goal</p>
          </div>
        </div>
        <div className="h-3 bg-surface rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${goalPct >= 100 ? 'bg-green-400' : 'bg-brand'}`}
            style={{ width: `${Math.max(0, Math.min(100, goalPct))}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
          <span>$0 profit</span><span>Goal: +${goalUsdt.toLocaleString()}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isRunning
            ? <><span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" /><span className="text-green-400 font-semibold text-sm">RUNNING — {activeCount} open positions · {p.interval ?? intervalVal} candles</span></>
            : <span className="text-gray-500 text-sm">Stopped</span>}
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
        {allCoins.map((coin: string) => <CoinCard key={coin} coin={coin} state={coinStates[coin]} />)}
      </div>

      {/* Recent closed trades */}
      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-border">
          <h3 className="text-sm font-semibold text-white">
            Recent Closed Trades {totalTrades > 0 && <span className="ml-2 text-xs text-gray-500">({totalTrades} total)</span>}
          </h3>
        </div>
        {totalTrades === 0 ? (
          <div className="p-8 text-center text-gray-600 text-sm">
            No closed trades yet.{' '}
            {intervalVal === '15m' ? 'First signal at 15m candles — typically within 15-30 min.' : 'Signals take up to 1h to appear.'}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-card border-b border-surface-border">
                <tr className="text-gray-500 text-left">
                  {['Coin','Dir','Entry','Exit','Result','PnL %','Profit $','Balance','Closed'].map(h => (
                    <th key={h} className="px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const all: any[] = []
                  Object.entries(coinStates).forEach(([coin, cs]: [string, any]) => {
                    (cs.closed_trades ?? []).forEach((t: any) => all.push({ ...t, coin }))
                  })
                  all.sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())
                  let runBal = initBal
                  return all.map((t: any, i: number) => {
                    runBal += (t.profit_usdt ?? 0)
                    return (
                      <tr key={i} className="border-b border-surface-border hover:bg-surface-hover">
                        <td className="px-3 py-2"><span className="font-bold text-[11px]" style={{ color: COIN_COLORS[t.coin] ?? '#888' }}>{COIN_LABEL[t.coin] ?? t.coin}</span></td>
                        <td className="px-3 py-2"><span className={`font-bold ${t.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>{t.direction === 'long' ? '▲ L' : '▼ S'}</span></td>
                        <td className="px-3 py-2 font-mono text-gray-300">{t.entry}</td>
                        <td className="px-3 py-2 font-mono text-gray-300">{t.exit_price}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            t.exit_reason === 'Hit TP2' ? 'bg-green-900/60 text-green-300' :
                            t.exit_reason === 'Hit TP1' ? 'bg-green-900/30 text-green-400' :
                            'bg-red-900/50 text-red-400'}`}>{t.exit_reason}</span>
                        </td>
                        <td className={`px-3 py-2 font-mono font-bold ${(t.profit_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{(t.profit_pct ?? 0) >= 0 ? '+' : ''}{t.profit_pct}%</td>
                        <td className={`px-3 py-2 font-mono ${(t.profit_usdt ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{(t.profit_usdt ?? 0) >= 0 ? '+' : ''}${t.profit_usdt}</td>
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
              Portfolio Bot
              <span className="ml-2 text-xs font-normal text-gray-500">
                Smart coin selection · 15m candles · 24/7 trading · 1:2 R:R
              </span>
            </h1>
            <p className="text-xs text-gray-600 mt-0.5">
              Best coins auto-selected from DB · Paper mode → confirm WR → add real capital
            </p>
          </div>
          <div className="flex bg-surface-card border border-surface-border rounded-lg p-0.5 gap-0.5">
            <button onClick={() => setTab('live')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'live' ? 'bg-brand text-black' : 'text-gray-500 hover:text-gray-300'}`}>
              Live Session
            </button>
            <button onClick={() => setTab('history')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'history' ? 'bg-brand text-black' : 'text-gray-500 hover:text-gray-300'}`}>
              DB History
            </button>
          </div>
        </div>
        {tab === 'live' ? <LiveTab /> : <HistoryTab />}
      </main>
    </div>
  )
}
