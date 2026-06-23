'use client'
import { useState } from 'react'
import TabBar from '@/components/layout/TabBar'
import PositionsTable from '@/components/trade/PositionsTable'
import { usePaperTrade } from '@/hooks/usePaperTrade'
import { COINS, STRATEGIES, INTERVALS } from '@/lib/constants'

export default function PaperTradePage() {
  const { start, stop, session, error } = usePaperTrade()

  const [coin,         setCoin]         = useState('BTCUSDT')
  const [strategy,     setStrategy]     = useState('rsi_macd')
  const [interval,     setInterval]     = useState('15m')
  const [tpPct,        setTpPct]        = useState(2.0)
  const [tp2Pct,       setTp2Pct]       = useState(4.0)
  const [slPct,        setSlPct]        = useState(1.5)
  const [tradeUsdt,    setTradeUsdt]    = useState(100)
  const [virtualBal,   setVirtualBal]   = useState(10000)
  const [aiConfidence, setAiConfidence] = useState(65)

  const isRunning = session?.status === 'running'
  const balance   = session?.balance ?? virtualBal
  const initBal   = session?.initial_balance ?? virtualBal
  const balChange = ((balance - initBal) / initBal * 100)

  const handleStart = () => {
    start({ coin, strategy_primary: strategy, interval, tp_pct: tpPct, tp2_pct: tp2Pct, sl_pct: slPct, trade_usdt: tradeUsdt, virtual_balance: virtualBal, ai_min_confidence: aiConfidence })
  }

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Paper Trade</h1>
            <p className="text-xs text-gray-500 mt-0.5">Simulate real-time trading with virtual balance — AI validates every signal</p>
          </div>
          {session && (
            <div className="flex items-center gap-4 text-sm">
              <div className="text-right">
                <p className="text-xs text-gray-500">Virtual Balance</p>
                <p className="text-white font-bold">${balance.toFixed(2)}</p>
                <p className={`text-xs ${balChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {balChange >= 0 ? '+' : ''}{balChange.toFixed(2)}%
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
          {/* Config panel */}
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
                <label className="block text-xs text-gray-500 mb-1">Strategy</label>
                <select value={strategy} onChange={e => setStrategy(e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand">
                  {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
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

              <div>
                <label className="block text-xs text-gray-500 mb-1">AI Min Confidence: {aiConfidence}%</label>
                <input type="range" min="50" max="95" value={aiConfidence}
                  onChange={e => setAiConfidence(parseInt(e.target.value))}
                  className="w-full accent-brand" />
                <p className="text-xs text-gray-600 mt-1">AI needs {aiConfidence}%+ confidence to trade</p>
              </div>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
            )}

            {!isRunning ? (
              <button onClick={handleStart}
                className="w-full py-3 rounded-lg font-semibold text-sm bg-brand hover:bg-brand-dark text-black transition-all">
                ▶ Start Paper Trading
              </button>
            ) : (
              <button onClick={stop}
                className="w-full py-3 rounded-lg font-semibold text-sm bg-red-600 hover:bg-red-700 text-white transition-all">
                ■ Stop Session
              </button>
            )}

            {session && (
              <div className="bg-surface-card border border-surface-border rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Session ID</span><span className="font-mono text-gray-300">{session.session_id}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Status</span>
                  <span className={session.status === 'running' ? 'text-green-400' : 'text-gray-400'}>{session.status}</span>
                </div>
                <div className="flex justify-between"><span className="text-gray-500">Current Price</span><span className="font-mono text-white">{session.current_price?.toFixed(4) ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Last Check</span><span className="text-gray-400">{session.last_check ? new Date(session.last_check).toLocaleTimeString() : '—'}</span></div>
              </div>
            )}
          </div>

          {/* Results panel */}
          <div className="col-span-8">
            {session ? (
              <PositionsTable
                openPosition={session.open_position}
                closedTrades={session.closed_trades}
                currentPrice={session.current_price}
              />
            ) : (
              <div className="bg-surface-card border border-surface-border rounded-lg p-12 text-center">
                <p className="text-4xl mb-4">🤖</p>
                <p className="text-gray-400">Configure and start a paper trading session</p>
                <p className="text-xs text-gray-600 mt-2">AI (Claude) will analyze each signal before executing</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
