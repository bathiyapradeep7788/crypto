'use client'
import { useState, useMemo } from 'react'
import TabBar from '@/components/layout/TabBar'
import PositionsTable from '@/components/trade/PositionsTable'
import { useLiveTrade } from '@/hooks/useLiveTrade'
import { COINS, STRATEGIES, INTERVALS, COIN_BEST_SETTINGS } from '@/lib/constants'

const COIN_STATS: Record<string, { wr: number; avgWin: number; avgLoss: number; tradesPerYear: number }> = {
  OPUSDT:   { wr: 0.4918, avgWin: 2.21, avgLoss: 1.50, tradesPerYear: 1708 },
  ETHUSDT:  { wr: 0.4990, avgWin: 2.18, avgLoss: 1.50, tradesPerYear: 499  },
  AVAXUSDT: { wr: 0.5244, avgWin: 2.33, avgLoss: 1.50, tradesPerYear: 246  },
  ARBUSDT:  { wr: 0.4921, avgWin: 2.42, avgLoss: 1.50, tradesPerYear: 252  },
  BTCUSDT:  { wr: 0.5849, avgWin: 2.13, avgLoss: 1.50, tradesPerYear: 106  },
  SOLUSDT:  { wr: 0.5116, avgWin: 2.25, avgLoss: 1.50, tradesPerYear: 172  },
}

function calcCompoundGrowth(posPct: number, coin: string): number {
  const s = COIN_STATS[coin] || COIN_STATS['OPUSDT']
  const f = posPct / 100
  const g = Math.pow(1 + f * s.avgWin / 100, s.wr) * Math.pow(1 - f * s.avgLoss / 100, 1 - s.wr)
  return Math.round(100000 * Math.pow(g, s.tradesPerYear))
}

export default function LiveTradePage() {
  const { start, stop, session, error } = useLiveTrade()

  const [coin,          setCoin]          = useState('BTCUSDT')
  const [strategies,    setStrategies]    = useState<string[]>(['support_resistance','bollinger_squeeze','fibonacci'])
  const [interval,      setInterval]      = useState('1h')
  const [tpPct,         setTpPct]         = useState(2.0)
  const [tp2Pct,        setTp2Pct]        = useState(4.0)
  const [slPct,         setSlPct]         = useState(1.5)
  const [tradeUsdt,     setTradeUsdt]     = useState(50)
  const [minConf,       setMinConf]       = useState(2)
  const [useTrend,      setUseTrend]      = useState(true)
  const [useSession,    setUseSession]    = useState(true)
  const [confirmed,     setConfirmed]     = useState(false)
  const [compoundMode,  setCompoundMode]  = useState(false)
  const [posPct,        setPosPct]        = useState(20)
  const [startBalance,  setStartBalance]  = useState(100000)

  const isRunning = session?.status === 'running'
  const balance   = (session as any)?.balance ?? startBalance
  const initBal   = (session as any)?.initial_balance ?? startBalance
  const balChange = ((balance - initBal) / initBal * 100)
  const wins      = (session as any)?.wins  ?? 0
  const losses    = (session as any)?.losses ?? 0

  const projected = useMemo(() => calcCompoundGrowth(posPct, coin), [posPct, coin])

  const handleCoinChange = (c: string) => {
    setCoin(c)
    const best = COIN_BEST_SETTINGS[c]
    if (best) { setStrategies(best.strategies); setMinConf(best.confluence) }
  }

  const toggleStrategy = (id: string) =>
    setStrategies(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const handleStart = () => {
    const strats = strategies.length > 0 ? strategies : ['rsi_macd']
    start({
      coin, strategy_primary: strats[0], strategies: strats,
      interval, tp_pct: tpPct, tp2_pct: tp2Pct, sl_pct: slPct,
      trade_usdt: compoundMode ? (startBalance * posPct / 100) : tradeUsdt,
      ai_min_confidence: 60,
      use_trend_filter: useTrend, trend_ema_period: 200,
      use_session_filter: useSession, min_confluence: minConf,
      position_pct: compoundMode ? posPct / 100 : 0,
    })
  }

  const best = COIN_BEST_SETTINGS[coin]

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Live Trade <span className="text-xs text-yellow-400 font-normal ml-2">TESTNET MODE</span></h1>
            <p className="text-xs text-gray-500 mt-0.5">Binance testnet — real signals, simulated orders</p>
          </div>
          {session && (
            <div className="flex items-center gap-4 text-sm">
              <div className="text-right">
                <p className="text-xs text-gray-500">Balance</p>
                <p className="text-white font-bold">${balance.toFixed(2)}</p>
                <p className={`text-xs ${balChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {balChange >= 0 ? '+' : ''}{balChange.toFixed(2)}% | {wins}W/{losses}L
                </p>
              </div>
              {isRunning && <div className="flex items-center gap-2 text-red-400"><span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />LIVE</div>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-4 space-y-4">

            {/* Compound Projector */}
            <div className="bg-gradient-to-br from-yellow-500/10 to-surface-card border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-yellow-400 uppercase tracking-wider">Compound Growth Mode</p>
                  <p className="text-xs text-gray-600">$100k target: $700k in 1yr</p>
                </div>
                <div onClick={() => setCompoundMode(!compoundMode)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${compoundMode ? 'bg-yellow-500' : 'bg-gray-700'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${compoundMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Position: <span className="text-white font-bold">{posPct}%</span> of balance/trade</span>
                  <span className={`font-bold ${projected >= 700000 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {(projected / 100000).toFixed(1)}x
                  </span>
                </div>
                <input type="range" min="5" max="45" step="5" value={posPct}
                  onChange={e => setPosPct(parseInt(e.target.value))}
                  className="w-full accent-yellow-500" />
              </div>

              <div className="bg-surface/60 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">$100k projected (1 year, {coin})</p>
                <p className={`text-2xl font-black mt-1 ${projected >= 700000 ? 'text-green-400' : 'text-yellow-400'}`}>
                  ${projected >= 1000000 ? (projected/1000000).toFixed(2) + 'M' : (projected/1000).toFixed(0) + 'k'}
                </p>
                {projected >= 700000 && <p className="text-xs text-green-400 mt-1">Target $700k reached!</p>}
              </div>

              {compoundMode && (
                <p className="text-xs text-yellow-400 mt-2">
                  ON: each trade uses {posPct}% of current balance — fully auto-compounds
                </p>
              )}
            </div>

            <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Configuration</h3>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Coin</label>
                <select value={coin} onChange={e => handleCoinChange(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500">
                  {COINS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {best && (
                  <p className="text-xs text-green-400 mt-1">{best.win_rate}% WR | +{best.total_pnl}% PnL (2024 backtest)</p>
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Strategies ({strategies.length})</label>
                <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto">
                  {STRATEGIES.map(s => (
                    <div key={s.id} onClick={() => toggleStrategy(s.id)}
                      className={`flex items-center gap-1.5 cursor-pointer px-2 py-1.5 rounded text-xs border transition-colors ${
                        strategies.includes(s.id) ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400' : 'border-surface-border text-gray-400 hover:border-gray-500'}`}>
                      <span className={`w-3 h-3 rounded-sm border flex-shrink-0 flex items-center justify-center text-[8px] ${strategies.includes(s.id) ? 'bg-yellow-500 border-yellow-500 text-black' : 'border-gray-600'}`}>
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
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500">
                  {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[{label:'TP1 %',val:tpPct,set:setTpPct},{label:'TP2 %',val:tp2Pct,set:setTp2Pct},{label:'SL %',val:slPct,set:setSlPct}].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                    <input type="number" step="0.1" value={f.val} onChange={e => f.set(parseFloat(e.target.value))}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-yellow-500" />
                  </div>
                ))}
              </div>

              {!compoundMode ? (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Trade Size (USDT)</label>
                  <input type="number" value={tradeUsdt} onChange={e => setTradeUsdt(parseInt(e.target.value))}
                    className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-yellow-500" />
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Starting Capital (USDT)</label>
                  <input type="number" value={startBalance} onChange={e => setStartBalance(parseInt(e.target.value))}
                    className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-yellow-500" />
                  <p className="text-xs text-yellow-400 mt-1">First trade: ${(startBalance * posPct / 100).toLocaleString()} ({posPct}%)</p>
                </div>
              )}
            </div>

            <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Smart Filters</h3>
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-gray-300">EMA200 Trend Filter</p><p className="text-xs text-gray-600">Trade with trend only</p></div>
                <div onClick={() => setUseTrend(!useTrend)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${useTrend ? 'bg-yellow-500' : 'bg-gray-700'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${useTrend ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-gray-300">Session Filter (UTC 8-20)</p><p className="text-xs text-gray-600">London + NY overlap</p></div>
                <div onClick={() => setUseSession(!useSession)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${useSession ? 'bg-yellow-500' : 'bg-gray-700'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${useSession ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Confluence: {minConf}/{strategies.length || 1}
                </label>
                <input type="range" min="1" max={Math.max(strategies.length, 2)} value={minConf}
                  onChange={e => setMinConf(parseInt(e.target.value))} className="w-full accent-yellow-500" />
              </div>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                  className="mt-0.5 accent-yellow-500" />
                <span className="text-xs text-yellow-300">
                  I understand this uses Binance TESTNET. Real API keys are NOT connected. No real funds at risk.
                  {compoundMode && <strong className="text-yellow-400"> Compound mode ON at {posPct}% per trade.</strong>}
                </span>
              </label>
            </div>

            {error && <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>}

            {!isRunning ? (
              <button onClick={handleStart} disabled={!confirmed || strategies.length === 0}
                className="w-full py-3 rounded-lg font-semibold text-sm bg-yellow-500 hover:bg-yellow-400 text-black transition-all disabled:opacity-40">
                {compoundMode ? `Start Live (${posPct}% Compound)` : 'Start Live Trading'}
              </button>
            ) : (
              <button onClick={stop}
                className="w-full py-3 rounded-lg font-semibold text-sm bg-red-600 hover:bg-red-700 text-white transition-all">
                Stop Live Trading
              </button>
            )}

            {session && (
              <div className="bg-surface-card border border-surface-border rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Session</span><span className="font-mono text-gray-300">{session.session_id}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={session.status === 'running' ? 'text-red-400' : 'text-gray-400'}>{session.status}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">W/L</span><span className="text-gray-300">{wins}W / {losses}L {wins+losses > 0 ? `(${(wins*100/(wins+losses)).toFixed(1)}%)` : ''}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Price</span><span className="font-mono text-white">{session.current_price?.toFixed(4) ?? '-'}</span></div>
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
              <div className="bg-surface-card border border-surface-border rounded-lg p-8">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                  <p className="text-gray-300 font-medium">Live Trading Ready</p>
                </div>
                <p className="text-xs text-gray-600 mb-5">Best strategies auto-loaded per coin. Compound mode targets $700k from $100k.</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { coin:'OPUSDT',  wr:'49.2%', pnl:'+558%', note:'Most Trades' },
                    { coin:'BTCUSDT', wr:'58.5%', pnl:'+66%',  note:'Highest WR' },
                    { coin:'AVAXUSDT',wr:'52.4%', pnl:'+125%', note:'Best R:R' },
                    { coin:'ETHUSDT', wr:'49.9%', pnl:'+167%', note:'High Volume' },
                    { coin:'ARBUSDT', wr:'49.2%', pnl:'+108%', note:'High Avg' },
                    { coin:'DOTUSDT', wr:'51.7%', pnl:'+177%', note:'Best PnL' },
                  ].map(s => (
                    <div key={s.coin} onClick={() => handleCoinChange(s.coin)}
                      className={`cursor-pointer rounded-lg p-3 border transition-all ${coin === s.coin ? 'border-yellow-500 bg-yellow-500/10' : 'border-surface-border hover:border-gray-500'}`}>
                      <p className="text-xs font-bold text-white">{s.coin.replace('USDT','')}</p>
                      <p className="text-xs text-green-400">{s.wr} WR</p>
                      <p className="text-xs text-yellow-400">{s.pnl} PnL</p>
                      <p className="text-xs text-gray-600 mt-1">{s.note}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 text-xs text-gray-400">
                  <span className="text-yellow-400 font-semibold">$100k → $700k:</span> Enable Compound Mode, set 35% position size, select OPUSDT (1708 trades/yr). Backtest confirms ~6.9x in 1 year.
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
