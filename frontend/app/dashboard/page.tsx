'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import TabBar from '@/components/layout/TabBar'
import { listAllSignals, checkSignal, clearSignals, getSignalStats } from '@/lib/api'
import { COIN_LABELS } from '@/lib/constants'

type Signal = {
  id: string
  coin: string
  signal_date: string
  strategy: string
  strategy_id: string
  direction: string
  entry: number
  tp: number
  tp2: number
  sl: number
  outcome: string | null
  profit_pct: number | null
  end_position: string | null
  close_date: string | null
  duration_min: number | null
  checked_at: string | null
  created_at: string
}

type StratStat = {
  strategy_id: string
  strategy: string
  total: number
  wins: number
  losses: number
  win_rate: number | null
  avg_pnl: number | null
  total_pnl: number | null
  avg_duration_min: number | null
}

const DIR_COLOR: Record<string, string> = {
  long:  'text-green-400 bg-green-900/20 border-green-800',
  short: 'text-red-400 bg-red-900/20 border-red-800',
}

const PAGE_SIZE = 100

const fmtDate = (d: string | null) => d ? d.slice(0, 16).replace('T', ' ') : '—'

const fmtDuration = (min: number | null) => {
  if (min == null) return '—'
  if (min < 60) return `${Math.round(min)}m`
  if (min < 1440) return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`
  return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`
}

type SortKey = 'signal_date' | 'close_date' | 'coin' | 'strategy' | 'direction' | 'outcome' | 'profit_pct' | 'duration_min' | 'entry'

export default function DashboardPage() {
  const [signals,       setSignals]       = useState<Signal[]>([])
  const [totalDb,       setTotalDb]       = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [loadProgress,  setLoadProgress]  = useState({ loaded: 0, total: 0 })
  const [filterCoin,    setFilterCoin]    = useState('')
  const [filterOutcome, setFilterOutcome] = useState('')
  const [filterStrat,   setFilterStrat]   = useState('')
  const [dateFrom,      setDateFrom]      = useState('')  // yyyy-mm-dd — close date range
  const [dateTo,        setDateTo]        = useState('')
  const [sortKey,       setSortKey]       = useState<SortKey>('signal_date')
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('desc')
  const [page,          setPage]          = useState(1)
  const [checking,      setChecking]      = useState<Set<string>>(new Set())
  const [error,         setError]         = useState('')
  const [stats,         setStats]         = useState<StratStat[]>([])
  const [statsOpen,     setStatsOpen]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setLoadProgress({ loaded: 0, total: 0 })
    try {
      // Date filter → close_date range, time auto 00:00
      const close_from = dateFrom ? `${dateFrom}T00:00:00` : undefined
      const close_to   = dateTo   ? `${dateTo}T00:00:00`   : undefined
      const data = await listAllSignals(
        {
          coin:    filterCoin    || undefined,
          outcome: filterOutcome || undefined,
          close_from, close_to,
          sort_by: sortKey, sort_dir: sortDir,
        },
        (loaded, total) => setLoadProgress({ loaded, total }),
      )
      setSignals(data.signals)
      setTotalDb(data.total)
      setPage(1)

      const st = await getSignalStats({ close_from, close_to })
      setStats(st.stats)
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [filterCoin, filterOutcome, dateFrom, dateTo, sortKey, sortDir])

  useEffect(() => { load() }, [load])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const handleCheck = async (id: string) => {
    setChecking(prev => new Set(prev).add(id))
    try {
      const updated = await checkSignal(id)
      setSignals(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s))
    } catch (e: any) {
      setError(`Check failed: ${e.message}`)
    }
    setChecking(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const handleClear = async () => {
    if (!confirm('Delete ALL signal logs? This cannot be undone.')) return
    await clearSignals()
    setSignals([])
    setTotalDb(0)
    setStats([])
  }

  // Client-side strategy filter (server filters cover the rest)
  const visible = useMemo(
    () => filterStrat ? signals.filter(s => s.strategy_id === filterStrat) : signals,
    [signals, filterStrat],
  )

  const wins    = visible.filter(s => s.outcome === 'Win').length
  const losses  = visible.filter(s => s.outcome === 'Loss').length
  const checked = wins + losses
  const wr      = checked ? ((wins / checked) * 100).toFixed(1) : '—'

  const uniqueCoins  = useMemo(() => Array.from(new Set(signals.map(s => s.coin))).sort(), [signals])
  const uniqueStrats = useMemo(() => {
    const m = new Map<string, string>()
    signals.forEach(s => m.set(s.strategy_id, s.strategy))
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [signals])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const pageRows   = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const bestStrat = stats.length ? stats.reduce((a, b) =>
    (b.win_rate ?? -1) > (a.win_rate ?? -1) ? b : a) : null

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th className="px-3 py-2.5 text-left font-medium cursor-pointer select-none hover:text-white"
      onClick={() => handleSort(k)}>
      {label} {sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : <span className="text-gray-700">⇅</span>}
    </th>
  )

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-white">Signal Log Dashboard</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              All generated signals — 15m timeframe · full history (no limit)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="text-xs px-4 py-2 bg-surface-card border border-surface-border rounded-lg text-gray-300 hover:text-white transition-colors">
              {loading ? '⟳ Loading…' : '↻ Refresh'}
            </button>
            <button onClick={handleClear}
              className="text-xs px-4 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-red-400 hover:bg-red-900/50 transition-colors">
              🗑 Clear All
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-5 gap-3 mb-5">
          <div className="bg-surface-card border border-surface-border rounded-lg p-4">
            <p className="text-xs text-gray-500">Total (filtered)</p>
            <p className="text-2xl font-bold text-white mt-1">{visible.length.toLocaleString()}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{totalDb.toLocaleString()} in DB</p>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-lg p-4">
            <p className="text-xs text-gray-500">Checked</p>
            <p className="text-2xl font-bold text-brand mt-1">{checked.toLocaleString()}</p>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-lg p-4">
            <p className="text-xs text-gray-500">Win Rate</p>
            <p className={`text-2xl font-bold mt-1 ${
              checked === 0 ? 'text-gray-500' :
              parseFloat(wr) >= 55 ? 'text-green-400' :
              parseFloat(wr) >= 45 ? 'text-yellow-400' : 'text-red-400'
            }`}>{wr}{checked > 0 ? '%' : ''}</p>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-lg p-4">
            <p className="text-xs text-gray-500">Wins / Losses</p>
            <p className="text-2xl font-bold mt-1">
              <span className="text-green-400">{wins.toLocaleString()}</span>
              <span className="text-gray-600 mx-1">/</span>
              <span className="text-red-400">{losses.toLocaleString()}</span>
            </p>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-lg p-4">
            <p className="text-xs text-gray-500">🏆 Best Strategy</p>
            {bestStrat ? (
              <>
                <p className="text-sm font-bold text-yellow-400 mt-1 truncate" title={bestStrat.strategy}>{bestStrat.strategy}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">WR {bestStrat.win_rate}% · avg {bestStrat.avg_pnl}%</p>
              </>
            ) : <p className="text-sm text-gray-600 mt-1">—</p>}
          </div>
        </div>

        {/* Strategy ranking panel */}
        <div className="bg-surface-card border border-surface-border rounded-lg mb-5 overflow-hidden">
          <button onClick={() => setStatsOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-hover">
            <h3 className="text-sm font-semibold text-gray-300">📊 Strategy Ranking {dateFrom || dateTo ? '(date-range filtered)' : '(all data)'}</h3>
            <span className="text-xs text-gray-500">{statsOpen ? '▲ hide' : '▼ show'}</span>
          </button>
          {statsOpen && (
            <div className="overflow-x-auto border-t border-surface-border">
              <table className="w-full text-xs">
                <thead className="text-gray-500 bg-surface">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Strategy / Method</th>
                    <th className="px-3 py-2 text-right font-medium">Signals</th>
                    <th className="px-3 py-2 text-right font-medium">Wins</th>
                    <th className="px-3 py-2 text-right font-medium">Losses</th>
                    <th className="px-3 py-2 text-right font-medium">Win Rate</th>
                    <th className="px-3 py-2 text-right font-medium">Avg PnL</th>
                    <th className="px-3 py-2 text-right font-medium">Total PnL</th>
                    <th className="px-3 py-2 text-right font-medium">Avg Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s, i) => (
                    <tr key={s.strategy_id} className={`border-t border-surface-border ${i === 0 ? 'bg-yellow-900/10' : ''}`}>
                      <td className="px-3 py-2 text-gray-600">{i === 0 ? '🏆' : i + 1}</td>
                      <td className="px-3 py-2 text-gray-200 font-medium">{s.strategy}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-400">{Number(s.total).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-400">{Number(s.wins).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-400">{Number(s.losses).toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${
                        (s.win_rate ?? 0) >= 50 ? 'text-green-400' : (s.win_rate ?? 0) >= 43 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {s.win_rate ?? '—'}%
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${(s.avg_pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {s.avg_pnl != null ? `${s.avg_pnl >= 0 ? '+' : ''}${s.avg_pnl}%` : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${(s.total_pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {s.total_pnl != null ? `${s.total_pnl >= 0 ? '+' : ''}${Number(s.total_pnl).toLocaleString()}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-400">{fmtDuration(s.avg_duration_min)}</td>
                    </tr>
                  ))}
                  {!stats.length && (
                    <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-600">No stats yet — run a scan first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Coin</label>
            <select value={filterCoin} onChange={e => setFilterCoin(e.target.value)}
              className="bg-surface-card border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand">
              <option value="">All Coins</option>
              {uniqueCoins.map(c => (
                <option key={c} value={c}>{COIN_LABELS[c] ?? c.replace('USDT','')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Outcome</label>
            <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)}
              className="bg-surface-card border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand">
              <option value="">All Outcomes</option>
              <option value="null">Unchecked</option>
              <option value="Win">Wins only</option>
              <option value="Loss">Losses only</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Strategy</label>
            <select value={filterStrat} onChange={e => { setFilterStrat(e.target.value); setPage(1) }}
              className="bg-surface-card border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand max-w-[200px]">
              <option value="">All Strategies</option>
              {uniqueStrats.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Close Date From (00:00)</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-surface-card border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Close Date To (00:00)</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-surface-card border border-surface-border rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand" />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs px-3 py-1.5 rounded border border-surface-border text-gray-400 hover:text-white">
              ✕ Clear dates
            </button>
          )}
          <span className="text-xs text-gray-600 pb-1.5">
            {loading
              ? `loading ${loadProgress.loaded.toLocaleString()} / ${loadProgress.total.toLocaleString()}…`
              : `${visible.length.toLocaleString()} signals`}
          </span>
        </div>

        {error && (
          <div className="mb-4 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {/* Signal list */}
        {loading ? (
          <div className="bg-surface-card border border-surface-border rounded-lg p-8 text-center text-gray-500 text-sm">
            Loading all signals… {loadProgress.total > 0 && (
              <span className="text-brand font-mono">{loadProgress.loaded.toLocaleString()} / {loadProgress.total.toLocaleString()}</span>
            )}
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-surface-card border border-surface-border rounded-lg p-8 text-center">
            <p className="text-gray-400 text-sm mb-1">No signals match.</p>
            <p className="text-gray-600 text-xs">
              Go to <strong className="text-gray-400">Backtest Bot → Signal Scanner</strong> to scan historical candles.
            </p>
          </div>
        ) : (
          <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500 border-b border-surface-border bg-surface">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">#</th>
                    <SortHeader label="Coin"        k="coin" />
                    <SortHeader label="Signal Date" k="signal_date" />
                    <SortHeader label="Close Date"  k="close_date" />
                    <SortHeader label="Duration"    k="duration_min" />
                    <SortHeader label="Strategy"    k="strategy" />
                    <SortHeader label="Dir"         k="direction" />
                    <SortHeader label="Entry"       k="entry" />
                    <th className="px-3 py-2.5 text-left font-medium">TP1</th>
                    <th className="px-3 py-2.5 text-left font-medium">TP2</th>
                    <th className="px-3 py-2.5 text-left font-medium">SL</th>
                    <SortHeader label="Outcome" k="outcome" />
                    <SortHeader label="PnL%"    k="profit_pct" />
                    <th className="px-3 py-2.5 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s, idx) => {
                    const isChecking = checking.has(s.id)
                    return (
                      <tr key={s.id}
                        className="border-b border-surface-border hover:bg-surface-hover transition-colors">
                        <td className="px-3 py-2 text-gray-600 font-mono">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="px-3 py-2 text-blue-400 font-bold font-mono">
                          {COIN_LABELS[s.coin] ?? s.coin.replace('USDT', '')}
                        </td>
                        <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">{fmtDate(s.signal_date)}</td>
                        <td className="px-3 py-2 text-cyan-500 font-mono whitespace-nowrap">{fmtDate(s.close_date)}</td>
                        <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">{fmtDuration(s.duration_min)}</td>
                        <td className="px-3 py-2 text-gray-300 max-w-[160px] truncate" title={s.strategy}>
                          {s.strategy}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold ${DIR_COLOR[s.direction] ?? 'text-gray-400'}`}>
                            {s.direction.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-300 font-mono">{Number(s.entry).toPrecision(6)}</td>
                        <td className="px-3 py-2 text-green-500 font-mono">{Number(s.tp).toPrecision(6)}</td>
                        <td className="px-3 py-2 text-green-400 font-mono">{Number(s.tp2).toPrecision(6)}</td>
                        <td className="px-3 py-2 text-red-400 font-mono">{Number(s.sl).toPrecision(6)}</td>
                        <td className="px-3 py-2">
                          {s.outcome ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              s.outcome === 'Win'
                                ? 'bg-green-900/40 text-green-400 border border-green-800'
                                : 'bg-red-900/40 text-red-400 border border-red-800'
                            }`}>
                              {s.outcome === 'Win' ? '✓' : '✗'} {s.outcome}
                            </span>
                          ) : (
                            <span className="text-gray-600 text-[10px]">pending</span>
                          )}
                        </td>
                        <td className={`px-3 py-2 font-semibold font-mono ${
                          s.profit_pct == null ? 'text-gray-600' :
                          s.profit_pct >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {s.profit_pct != null
                            ? `${s.profit_pct >= 0 ? '+' : ''}${Number(s.profit_pct).toFixed(2)}%`
                            : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {s.outcome ? (
                            <span className="text-[10px] text-gray-600">
                              {s.end_position ?? 'done'}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleCheck(s.id)}
                              disabled={isChecking}
                              className={`text-[10px] px-3 py-1 rounded font-semibold transition-all ${
                                isChecking
                                  ? 'bg-surface-border text-gray-500 cursor-not-allowed'
                                  : 'bg-brand/20 border border-brand/40 text-brand hover:bg-brand/30'
                              }`}>
                              {isChecking ? '⟳' : 'Check'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
                <span className="text-xs text-gray-500">
                  Page {page} of {totalPages.toLocaleString()} · {visible.length.toLocaleString()} signals
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(1)} disabled={page === 1}
                    className="text-xs px-2 py-1 rounded border border-surface-border text-gray-400 hover:text-white disabled:opacity-30">⏮</button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="text-xs px-3 py-1 rounded border border-surface-border text-gray-400 hover:text-white disabled:opacity-30">← Prev</button>
                  <input type="number" min={1} max={totalPages} value={page}
                    onChange={e => setPage(Math.min(totalPages, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-16 bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white text-center" />
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="text-xs px-3 py-1 rounded border border-surface-border text-gray-400 hover:text-white disabled:opacity-30">Next →</button>
                  <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                    className="text-xs px-2 py-1 rounded border border-surface-border text-gray-400 hover:text-white disabled:opacity-30">⏭</button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
