'use client'
// Thin wrapper — embeds the full-backtest page inside the Backtest tab
import { useState, useEffect, useRef, useCallback } from 'react'
import TabBar from '@/components/layout/TabBar'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

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

export default function FullRunSubTab({ onBack }: { onBack: () => void }) {
  const [status,   setStatus]   = useState<any>(null)
  const [settings, setSettings] = useState({
    years:      [2024, 2025] as number[],
    tp_pct:     2.0,
    sl_pct:     1.0,
    interval:   '15m',
    trend:      true,
    session:    false,
    batch_size: 4,
    top_n:      10,
  })
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<any>(null)

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${API}/full-backtest/status`)
      setStatus(await r.json())
    } catch {}
  }, [])

  useEffect(() => {
    poll()
    timerRef.current = setInterval(poll, 3000)
    return () => clearInterval(timerRef.current)
  }, [poll])

  const start = async () => {
    setLoading(true)
    try {
      await fetch(`${API}/full-backtest/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, clear_db: true }),
      })
    } catch {}
    setLoading(false)
  }

  const stop = async () => {
    await fetch(`${API}/full-backtest/stop`, { method: 'POST' })
  }

  const isRunning = status?.status === 'running'
  const pct = status?.pct ?? 0
  const coins: any[] = status?.coins ?? []

  const toggleYear = (y: number) =>
    setSettings(s => ({
      ...s,
      years: s.years.includes(y) ? s.years.filter(x => x !== y) : [...s.years, y].sort(),
    }))

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="text-xs px-3 py-1.5 bg-surface-card border border-surface-border rounded text-gray-400 hover:text-white transition-colors">
            ← Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Full Run — Monthly Backtest</h1>
            <p className="text-xs text-gray-500 mt-0.5">20 coins × 10 strategies × every month · 15m candles</p>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-4 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-2">Years</label>
            <div className="flex gap-2 flex-wrap">
              {[2024, 2025, 2026].map(y => (
                <button key={y} onClick={() => toggleYear(y)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${settings.years.includes(y) ? 'bg-brand text-black' : 'bg-surface border border-surface-border text-gray-400'}`}>
                  {y}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-2">Top N Strategies / Coin</label>
            <div className="flex gap-1 flex-wrap">
              {[3, 5, 7, 10].map(n => (
                <button key={n} onClick={() => setSettings(s => ({ ...s, top_n: n }))}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${settings.top_n === n ? 'bg-brand text-black' : 'bg-surface border border-surface-border text-gray-400'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">TP %</label>
            <input type="number" step="0.5" value={settings.tp_pct}
              onChange={e => setSettings(s => ({ ...s, tp_pct: parseFloat(e.target.value) }))}
              className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">SL %</label>
            <input type="number" step="0.5" value={settings.sl_pct}
              onChange={e => setSettings(s => ({ ...s, sl_pct: parseFloat(e.target.value) }))}
              className="w-full bg-surface border border-surface-border rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={start} disabled={isRunning || loading}
            className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${isRunning || loading ? 'bg-surface-border text-gray-500 cursor-not-allowed' : 'bg-brand hover:bg-brand/80 text-black'}`}>
            {loading ? 'Starting…' : isRunning ? 'Running…' : '▶ Run Full Backtest (20 coins)'}
          </button>
          {isRunning && (
            <button onClick={stop} className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">
              ■ Stop
            </button>
          )}
          {status?.status && (
            <span className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${
              status.status === 'running' ? 'text-green-400 border-green-700 bg-green-900/20' :
              status.status === 'done'    ? 'text-brand border-brand/40 bg-brand/10' :
              'text-gray-400 border-gray-700 bg-surface'}`}>
              {status.status.toUpperCase()} {isRunning ? `${pct}%` : ''}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {isRunning && (
          <div className="mb-5">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{status?.current}</span>
              <span>{status?.done}/{status?.total}</span>
            </div>
            <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
              <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Coin results grid */}
        {coins.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mb-5">
            {coins.map((c: any) => {
              const color = COIN_COLORS[c.coin] ?? '#888'
              const gc = GRADE_CLR[c.grade] ?? 'text-gray-400'
              return (
                <div key={c.coin} className="bg-surface-card border border-surface-border rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-white">{c.coin.replace('USDT','')}</span>
                    <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${gc}`}>{c.grade}</span>
                  </div>
                  <p style={{ color }} className="text-lg font-bold">{c.wr}% WR</p>
                  <p className="text-xs text-gray-500">{c.trades} trades</p>
                  <p className={`text-xs font-semibold ${c.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {c.pnl >= 0 ? '+' : ''}{c.pnl}% PnL
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {/* Live log */}
        {status?.log?.length > 0 && (
          <div className="bg-surface-card border border-surface-border rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Log</p>
            <div className="max-h-64 overflow-y-auto font-mono space-y-0.5">
              {[...(status.log ?? [])].reverse().map((l: string, i: number) => (
                <p key={i} className={`text-[11px] ${l.includes('ERROR') ? 'text-red-400' : l.includes('===') ? 'text-brand font-semibold' : 'text-gray-500'}`}>{l}</p>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
