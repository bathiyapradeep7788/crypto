'use client'
import { useState, useMemo } from 'react'
import TabBar from '@/components/layout/TabBar'
import PositionsTable from '@/components/trade/PositionsTable'
import { usePaperTrade } from '@/hooks/usePaperTrade'
import { COINS, STRATEGIES, INTERVALS, COIN_BEST_SETTINGS } from '@/lib/constants'

// Compound growth projector based on OP/Ichimoku stats (49.18% WR, avg_win 2.21%, avg_loss 1.5%)
// User can adjust for their coin's stats
const COIN_STATS: Record<string, { wr: number; avgWin: number; avgLoss: number; tradesPerYear: number }> = {
  OPUSDT:   { wr: 0.4918, avgWin: 2.21, avgLoss: 1.50, tradesPerYear: 1708 },
  ETHUSDT:  { wr: 0.4990, avgWin: 2.18, avgLoss: 1.50, tradesPerYear: 499  },
  AVAXUSDT: { wr: 0.5244, avgWin: 2.33, avgLoss: 1.50, tradesPerYear: 246  },
  ARBUSDT:  { wr: 0.4921, avgWin: 2.42, avgLoss: 1.50, tradesPerYear: 252  },
  UNIUSDT:  { wr: 0.5082, avgWin: 2.21, avgLoss: 1.50, tradesPerYear: 429  },
  BTCUSDT:  { wr: 0.5849, avgWin: 2.13, avgLoss: 1.50, tradesPerYear: 106  },
  SOLUSDT:  { wr: 0.5116, avgWin: 2.25, avgLoss: 1.50, tradesPerYear: 172  },
}

function calcCompoundGrowth(posPct: number, coin: string): number {
  const s = COIN_STATS[coin] || COIN_STATS['OPUSDT']
  const f = posPct / 100
  const g = Math.pow(1 + f * s.avgWin / 100, s.wr) * Math.pow(1 - f * s.avgLoss / 100, 1 - s.wr)
  return Math.round(100000 * Math.pow(g, s.tradesPerYear))
}

export default function PaperTradePage() {
  const { start, stop, session, error } = usePaperTrade()

  const [coin,        setCoin]        = useState('OPUSDT')
  const [strategies,  setStrategies]  = useState<string[]>(['ichimoku','volume_momentum','support_resistance'])
  const [interval,    setInterval]    = useState('1h')
  const [tpPct,       setTpPct]       = useState(2.0)
  const [tp2Pct,      setTp2Pct]      = useState(4.0)
  const [slPct,       setSlPct]       = useState(1.5)
  const [tradeUsdt,   setTradeUsdt]   = useState(100)
  const [virtualBal,  setVirtualBal]  = useState(10000)
  const [minConf,     setMinConf]     = useState(2)
  const [useTrend,    setUseTrend]    = useState(true)
  const [useSession,  setUseSession]  = useState(true)
  const [compoundMode,setCompoundMode]= useState(false)
  const [posPct,      setPosPct]      = useState(20)

  const isRunning = session?.status === 'running'
  const balance   = (session as any)?.balance ?? virtualBal
  const initBal   = (session as any)?.initial_balance ?? virtualBal
  const balChange = ((balance - initBal) / initBal * 100)
  const wins      = (session as any)?.wins  ?? 0
  const losses    = (session as any)?.losses ?? 0

  const projected = useMemo(() => calcCompoundGrowth(posPct, coin), [posPct, coin])
  const projectedX = (projected / 100000).toFixed(1)

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
      trade_usdt: tradeUsdt, virtual_balance: virtualBal,
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
            <h1 className="text-xl font-bold text-white">Paper Trade</h1>
            <p className="text-xs text-gray-500 mt-0.5">Virtual trading — best strategy per coin, compound mode available</p>
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
              {isRunning && (
                <div className="flex items-center gap-2 text-brand">
                  <span className="w-2 h-2 bg-brand rounded-full animate-pulse" />
                  Live
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-4 space-y-4">

            {/* Compound Growth Projector */}
            <div className="bg-gradient-to-br from-brand/10 to-surface-card border border-brand/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Compound Projector</p>
                  <p className="text-xs text-gray-600">Based on 2024 backtest stats</p>
                </div>
                <div onClick={() => setCompoundMode(!compoundMode)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${compoundMode ? 'bg-brand' : 'bg-gray-700'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${compoundMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Position Size: <span className="text-white font-bold">{posPct}%</span> per trade</span>
                  <span className={`font-bold ${projected >= 700000 ? 'text-green-400' : projected >= 300000 ? 'text-brand' : 'text-gray-400'}`}>
                    {projectedX}x
                  </span>
                </div>
                <input type="range" min="5" max="45" step="5" value={posPct}
                  onChange={e => setPosPct(parseInt(e.target.value))}
                  className="w-full accent-brand" />
                <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                  <span>5% safe</span><span>25% med</span><span>45% high</span>
                </div>
              </div>

              <div className="bg-surface/60 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">$100k projected (1 year)</p>
                <p className={`text-2xl font-black mt-1 ${projected >= 700000 ? 'text-green-400' : projected >= 300000 ? 'text-brand' : 'text-gray-300'}`}>
                  ${projected >= 1000000
                    ? (projected/1000000).toFixed(2) + 'M'
                    : (projected/1000).toFixed(0) + 'k'}
                </p>
                {projected >= 700000 && (
                  <p className="text-xs text-green-400 mt-1">Target $700k reached!</p>
                )}
                <div className="grid grid-cols-3 gap-1 mt-2 text-xs text-gray-600">
                  <div>20%={calcCompoundGrowth(20,coin)/1000|0}k</div>
                  <div>30%={calcCompoundGrowth(30,coin)/1000|0}k</div>
                  <div>35%={calcCompoundGrowth(35,coin)/1000|0}k</div>
                </div>
              </div>

              {compoundMode && (
                <p className="text-xs text-brand mt-2">
                  ON: each trade uses {posPct}% of current balance — profits reinvest automatically
                </p>
              )}
            </div>

            <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Configuration</h3>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Coin</label>
                <select value={coin} onChange={e => handleCoinChange(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand">
                  {COINS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {best && (
                  <p className="text-xs text-green-400 mt-1">{best.win_rate}% WR | +{best.total_pnl}% PnL (backtest 2024)</p>
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Strategies ({strategies.length})</label>
                <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto">
                  {STRATEGIES.map(s => (
                    <div key={s.id} onClick={() => toggleStrategy(s.id)}
                      className={`flex items-center gap-1.5 cursor-pointer px-2 py-1.5 rounded text-xs border transition-colors ${
                        strategies.includes(s.id) ? 'border-brand bg-brand/10 text-brand' : 'border-surface-border text-gray-400 hover:border-gray-500'}`}>
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
                {[{label:'TP1 %',val:tpPct,set:setTpPct},{label:'TP2 %',val:tp2Pct,set:setTp2Pct},{label:'SL %',val:slPct,set:setSlPct}].map(f => (
                  <div key={f.label}>
                    <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                    <input type="number" step="0.1" value={f.val} onChange={e => f.set(parseFloat(e.target.value))}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                  </div>
                ))}
              </div>

              {!compoundMode ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Trade Size (USDT)</label>
                    <input type="number" value={tradeUsdt} onChange={e => setTradeUsdt(parseInt(e.target.value))}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Virtual Balance</label>
                    <input type="number" value={virtualBal} onChange={e => setVirtualBal(parseInt(e.target.value))}
                      className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Starting Virtual Balance</label>
                  <input type="number" value={virtualBal} onChange={e => setVirtualBal(parseInt(e.target.value))}
                    className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
                  <p className="text-xs text-brand mt-1">Each trade = {posPct}% of current balance (auto-compounds)</p>
                </div>
              )}
            </div>

            <div className="bg-surface-card border border-surface-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Smart Filters</h3>

              <div className="flex items-center justify-between">
                <div><p className="text-xs text-gray-300">EMA200 Trend Filter</p><p className="text-xs text-gray-600">Trade with trend only</p></div>
                <div onClick={() => setUseTrend(!useTrend)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${useTrend ? 'bg-brand' : 'bg-gray-700'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${useTrend ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div><p className="text-xs text-gray-300">Session Filter (UTC 8-20)</p><p className="text-xs text-gray-600">London + NY overlap</p></div>
                <div onClick={() => setUseSession(!useSession)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${useSession ? 'bg-brand' : 'bg-gray-700'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${useSession ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Confluence: {minConf}/{strategies.length || 1}
                  <span className="ml-1 text-gray-600">({minConf <= 1 ? 'any signal' : `${minConf} must agree`})</span>
                </label>
                <input type="range" min="1" max={Math.max(strategies.length, 2)} value={minConf}
                  onChange={e => setMinConf(parseInt(e.target.value))} className="w-full accent-brand" />
              </div>
            </div>

            {error && <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>}

            {!isRunning ? (
              <button onClick={handleStart} disabled={strategies.length === 0}
                className="w-full py-3 rounded-lg font-semibold text-sm bg-brand hover:bg-brand-dark text-black transition-all disabled:opacity-40">
                {compoundMode ? `Start (${posPct}% Compound Mode)` : 'Start Paper Trading'}
              </button>
            ) : (
              <button onClick={stop}
                className="w-full py-3 rounded-lg font-semibold text-sm bg-red-600 hover:bg-red-700 text-white transition-all">
                Stop Session
              </button>
            )}

            {session && (
              <div className="bg-surface-card border border-surface-border rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Session</span><span className="font-mono text-gray-300">{session.session_id}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={session.status === 'running' ? 'text-green-400' : 'text-gray-400'}>{session.status}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">W/L</span><span className="text-gray-300">{wins}W / {losses}L {wins+losses > 0 ? `(${(wins*100/(wins+losses)).toFixed(1)}%)` : ''}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Price</span><span className="font-mono text-white">{session.current_price?.toFixed(4) ?? '-'}</span></div>
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
              <div className="bg-surface-card border border-surface-border rounded-lg p-8">
                <p className="text-gray-400 text-center mb-2">Select coin and start trading</p>
                <p className="text-xs text-gray-600 text-center mb-5">Best strategies auto-loaded from backtest results</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { coin:'OPUSDT',  wr:'49.2%', pnl:'+558%', x:'2.3x@15%', tag:'Most Trades' },
                    { coin:'BTCUSDT', wr:'58.5%', pnl:'+66%',  x:'1.1x@15%', tag:'Highest WR' },
                    { coin:'AVAXUSDT',wr:'52.4%', pnl:'+125%', x:'1.2x@15%', tag:'Best R:R' },
                    { coin:'ETHUSDT', wr:'49.9%', pnl:'+167%', x:'1.3x@15%', tag:'High Volume' },
                    { coin:'UNIUSDT', wr:'50.8%', pnl:'+166%', x:'1.3x@15%', tag:'Steady' },
                    { coin:'ARBUSDT', wr:'49.2%', pnl:'+108%', x:'1.2x@15%', tag:'High Avg' },
                    { coin:'SOLUSDT', wr:'51.2%', pnl:'+72%',  x:'1.1x@15%', tag:'Bull Coin' },
                    { coin:'DOTUSDT', wr:'51.7%', pnl:'+87%',  x:'1.1x@15%', tag:'Stoch RSI' },
                  ].map(s => (
                    <div key={s.coin} onClick={() => handleCoinChange(s.coin)}
                      className={`cursor-pointer rounded-lg p-3 border transition-all ${coin === s.coin ? 'border-brand bg-brand/10' : 'border-surface-border hover:border-gray-500'}`}>
                      <p className="text-xs font-bold text-white">{s.coin.replace('USDT','')}</p>
                      <p className="text-xs text-green-400">{s.wr} WR</p>
                      <p className="text-xs text-brand">{s.pnl} PnL</p>
                      <p className="text-xs text-gray-600">{s.x}</p>
                      <p className="text-xs text-gray-600 mt-1">{s.tag}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 bg-brand/5 border border-brand/20 rounded-lg p-3 text-xs text-gray-400">
                  <span className="text-brand font-semibold">Compound Mode:</span> Enable the projector above and set position % to 35% — backtest shows $100k can reach $691k in 1 year on OP/Ichimoku
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
