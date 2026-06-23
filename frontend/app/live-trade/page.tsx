'use client'
import { useState } from 'react'
import TabBar from '@/components/layout/TabBar'
import PositionsTable from '@/components/trade/PositionsTable'
import { useLiveTrade } from '@/hooks/useLiveTrade'
import { COINS, STRATEGIES, INTERVALS } from '@/lib/constants'

export default function LiveTradePage() {
  const { start, stop, session, error } = useLiveTrade()

  const [coin,         setCoin]         = useState('BTCUSDT')
  const [strategy,     setStrategy]     = useState('rsi_macd')
  const [interval,     setInterval]     = useState('15m')
  const [tpPct,        setTpPct]        = useState(2.0)
  const [tp2Pct,       setTp2Pct]       = useState(4.0)
  const [slPct,        setSlPct]        = useState(1.5)
  const [tradeUsdt,    setTradeUsdt]    = useState(50)
  const [aiConfidence, setAiConfidence] = useState(70)
  const [confirmed,    setConfirmed]    = useState(false)

  const isRunning = session?.status === 'running'
  const totalPnl  = session?.total_pnl_pct ?? 0

  const handleStart = () => {
    if (!confirmed) {
      alert('Please confirm you understand this places REAL orders on Binance demo account.')
      return
    }
    start({ coin, strategy_primary: strategy, interval, tp_pct: tpPct, tp2_pct: tp2Pct, sl_pct: slPct, trade_usdt: tradeUsdt, ai_min_confidence: aiConfidence })
  }

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Live Actual Trade</h1>
            <p className="text-xs text-gray-500 mt-0.5">Real orders on Binance demo account — AI validates every signal (Claude claude-sonnet-4-6)</p>
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

        {/* Warning banner */}
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg px-4 py-3 mb-4 flex items-start gap-3">
          <span className="text-yellow-500 text-lg">⚠</span>
          <div>
            <p className="text-yellow-400 text-sm font-semibold">Binance Demo Account</p>
            <p className="text-yellow-600 text-xs mt-0.5">This places real market orders on your Binance demo account (testnet). No real money is used, but orders are real API calls.</p>
          </div>
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

              <div>
                <label className="block text-xs text-gray-500 mb-1">Trade Size (USDT)</label>
                <input type="number" value={tradeUsdt} onChange={e => setTradeUsdt(parseInt(e.target.value))}
                  className="w-full bg-surface border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">AI Min Confidence: {aiConfidence}%</label>
                <input type="range" min="55" max="95" value={aiConfidence}
                  onChange={e => setAiConfidence(parseInt(e.target.value))}
                  className="w-full accent-brand" />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="accent-brand" />
                <span className="text-xs text-gray-400">I understand this places real Binance demo orders</span>
              </label>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
            )}

            {!isRunning ? (
              <button onClick={handleStart}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${confirmed ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-surface-border text-gray-500 cursor-not-allowed'}`}>
                ▶ Start Live Trading
              </button>
            ) : (
              <button onClick={stop}
                className="w-full py-3 rounded-lg font-semibold text-sm bg-gray-700 hover:bg-gray-600 text-white transition-all">
                ■ Stop Session
              </button>
            )}

            {session && (
              <div className="bg-surface-card border border-surface-border rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Session ID</span><span className="font-mono text-gray-300">{session.session_id}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Status</span>
                  <span className={session.status === 'running' ? 'text-red-400' : 'text-gray-400'}>{session.status}</span>
                </div>
                <div className="flex justify-between"><span className="text-gray-500">Current Price</span><span className="font-mono text-white">{session.current_price?.toFixed(4) ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Wins / Losses</span><span className="text-gray-300">{session.wins}W / {session.losses}L</span></div>
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
                <p className="text-4xl mb-4">⚡</p>
                <p className="text-gray-400">Configure and start a live trading session</p>
                <p className="text-xs text-gray-600 mt-2">Claude AI (claude-sonnet-4-6) validates every signal with {aiConfidence}%+ confidence threshold</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
