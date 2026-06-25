'use client'
import { useState } from 'react'
import TabBar from '@/components/layout/TabBar'
import PositionsTable from '@/components/trade/PositionsTable'
import { useLiveTrade } from '@/hooks/useLiveTrade'
import { COINS, STRATEGIES, INTERVALS } from '@/lib/constants'

export default function LiveTradePage() {
  const { start, stop, session, error } = useLiveTrade()

  const [coin,       setCoin]       = useState('BNBUSDT')
  const [strategies, setStrategies] = useState<string[]>(['rsi_macd', 'ema_crossover', 'bollinger_squeeze'])
  const [interval,   setInterval]   = useState('15m')
  const [tpPct,      setTpPct]      = useState(2.0)
  const [tp2Pct,     setTp2Pct]     = useState(4.0)
  const [slPct,      setSlPct]      = useState(1.5)
  const [tradeUsdt,  setTradeUsdt]  = useState(50)
  const [minConf,    setMinConf]    = useState(2)
  const [useTrend,   setUseTrend]   = useState(true)
  const [useSession, setUseSession] = useState(true)
  const [confirmed,  setConfirmed]  = useState(false)

  const isRunning = session?.status === 'running'
  const totalPnl  = (session as any)?.total_pnl_pct ?? 0

  const toggleStrategy = (id: string) =>
    setStrategies(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const handleStart = () => {
    if (!confirmed) {
      alert('Please confirm you understand this places REAL orders on Binance demo account.')
      return
    }
    const strats = strategies.length > 0 ? strategies : ['rsi_macd']
    start({
      coin,
      strategy_primary: strats[0],
      strategies: strats,
      interval,
      tp_pct: tpPct,
      tp2_pct: tp2Pct,
      sl_pct: slPct,
      trade_usdt: tradeUsdt,
      ai_min_confidence: 70,
      use_trend_filter: useTrend,
      trend_ema_period: 200,
      use_session_filter: useSession,
      min_confluence: minConf,
    })
  }

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Live Trade</h1>
            <p className="text-xs text-gray-500 mt-0.5">Real orders on Binance demo account — smart filters active</p>
          </div>
          {session && (
            <div className="flex items-center gap-4 text-sm">
              <div className="text-right">
                <p className="text-xs text-gray-500">Session PnL</p>
                <p className={`font-bold text-lg ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}%
                </p>
              </div>
              {isRunning && (
                <div className="flex items-center gap-2 text-red-400">
                  <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                  LIVE
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg px-4 py-3 mb-4 flex items-start gap-3">
          <span className="text-yellow-500 text-lg">!</span>
          <div>
            <p className="text-yellow-400 text-sm font-semibold">Binance Demo Account</p>
            <p className="text-yellow-600 text-xs mt-0.5">This places real market orders on your Binance demo account (testnet). No real money — but real API calls.</p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-4 space-y-4">
            <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Configuration</h3>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Coin</label>
                <select value={coin} onChange={e => setCoin(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand">
                  {COINS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Strategies ({strategies.length} selected)</label>
                <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto">
                  {STRATEGIES.map(s => (
                    <div key={s.id} onClick={() => toggleStrategy(s.id)}
                      className={`flex items-center gap-1.5 cursor-pointer px-2 py-1.5 rounded text-xs border transition-colors ${
                        strategies.includes(s.id)
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-surface-border text-gray-400 hover:border-gray-500'
                      }`}>
                      <span className={`w-3 h-3 rounded-sm border flex-shrink-0 flex items-center justify-center text-[8px] ${strategies.includes(s.id) ? 'bg-brand border-brand text-black' : 'border-gray-600'}`}>
                        {strategies.includes(s.id) ? 'v' : ''}
                      </span>
                      {s.label}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Interval</label>
                <select value={interval} onChange={e => setInterval(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand">
                  {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'TP1 %', val: tpPct,  set: setTpPct  },
                  { label: 'TP2 %', val: tp2Pct, set: setTp2Pct },
                  { label: 'SL %',  val: slPct,  set: setSlPct  },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                    <input type="number" step="0.1" value={f.val}
                      onChange={e => f.set(parseFloat(e.target.value))}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Trade Size (USDT)</label>
                <input type="number" value={tradeUsdt} onChange={e => setTradeUsdt(parseInt(e.target.value))}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
              </div>
            </div>

            <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Smart Filters</h3>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-300">EMA200 Trend Filter</p>
                  <p className="text-xs text-gray-600">Trade with trend only</p>
                </div>
                <div onClick={() => setUseTrend(!useTrend)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${useTrend ? 'bg-brand' : 'bg-gray-700'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${useTrend ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-300">Session Filter (UTC 8-20)</p>
                  <p className="text-xs text-gray-600">London + NY overlap only</p>
                </div>
                <div onClick={() => setUseSession(!useSession)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${useSession ? 'bg-brand' : 'bg-gray-700'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${useSession ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Min Confluence: {minConf}/{strategies.length || 1}
                  <span className="ml-1 text-gray-600">({minConf <= 1 ? 'any signal' : `${minConf} must agree`})</span>
                </label>
                <input type="range" min="1" max={Math.max(strategies.length, 2)} value={minConf}
                  onChange={e => setMinConf(parseInt(e.target.value))}
                  className="w-full accent-brand" />
              </div>

              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="accent-brand" />
                <span className="text-xs text-gray-400">I understand this places real Binance demo orders</span>
              </label>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
            )}

            {!isRunning ? (
              <button onClick={handleStart} disabled={strategies.length === 0}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${confirmed && strategies.length > 0 ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-surface-border text-gray-500 cursor-not-allowed'}`}>
                Start Live Trading
              </button>
            ) : (
              <button onClick={stop}
                className="w-full py-3 rounded-lg font-semibold text-sm bg-gray-700 hover:bg-gray-600 text-white transition-all">
                Stop Session
              </button>
            )}

            {session && (
              <div className="bg-surface-card border border-surface-border rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Session ID</span><span className="font-mono text-gray-300">{session.session_id}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Status</span>
                  <span className={session.status === 'running' ? 'text-red-400' : 'text-gray-400'}>{session.status}</span>
                </div>
                <div className="flex justify-between"><span className="text-gray-500">Wins / Losses</span><span className="text-gray-300">{(session as any).wins ?? 0}W / {(session as any).losses ?? 0}L</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Current Price</span><span className="font-mono text-white">{session.current_price?.toFixed(4) ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Last Check</span><span className="text-gray-400">{session.last_check ? new Date(session.last_check).toLocaleTimeString() : '-'}</span></div>
              </div>
            )}
          </div>

          <div className="col-span-8">
            {session ? (
              <PositionsTable
                openPosition={session.open_position}
                closedTrades={session.closed_trades}
                currentPrice={session.current_price}
              />
            ) : (
              <div className="bg-surface-card border border-surface-border rounded-lg p-12 text-center">
                <p className="text-4xl mb-4">Flash</p>
                <p className="text-gray-400">Configure and start a live trading session</p>
                <p className="text-xs text-gray-600 mt-2">EMA200 trend + session filter + confluence voting active</p>
                <div className="mt-6 text-xs text-gray-600 space-y-1">
                  <p>Recommended: BNB or XRP, 15m, confluence 2+</p>
                  <p>Best backtest: BNB 68.8% win rate | XRP 52.6% win rate</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
