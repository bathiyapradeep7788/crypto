'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ── TYPES ─────────────────────────────────────────────────────
interface BacktestRun {
  run_id: string
  status: 'pending' | 'running' | 'complete' | 'error'
  start_date: string
  end_date: string
  engine: string
  progress_pct: number
  cap_rejected: number
  displaced: number
  total_signals: number
  results_summary: Record<string, number> | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

interface PortfolioRow {
  coin: string
  run_id: string
  selected_regime: string
  best_strategy: string
  win_rate_pct: number
  total_pnl_pct: number
  max_drawdown_pct: number
  total_trades: number
  cap_rejected_trades: number
  tp_pct: number
  sl_pct: number
  updated_at: string
}

// ── HELPERS ────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10)
const sixMonthsAgo = () => {
  const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10)
}
const fmtPnl = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const pnlColor = (v: number) => v >= 0 ? 'text-green-400' : 'text-red-400'
const wrColor  = (v: number) => v >= 55 ? 'text-green-400' : v >= 40 ? 'text-yellow-400' : 'text-red-400'
const ddColor  = (v: number) => v <= 5 ? 'text-green-400' : v <= 15 ? 'text-yellow-400' : 'text-red-400'

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function PortfolioDashboard() {
  // State
  const [startDate, setStartDate]   = useState(sixMonthsAgo())
  const [endDate,   setEndDate]     = useState(today())
  const [rows,      setRows]        = useState<PortfolioRow[]>([])
  const [run,       setRun]         = useState<BacktestRun | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [loadingResults, setLoadingResults] = useState(false)
  const [runMsg,    setRunMsg]      = useState('')
  const [resetMsg,  setResetMsg]    = useState('')
  const [resetScope,setResetScope]  = useState<'results'|'all'>('results')
  const [runCmd,    setRunCmd]      = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch results rows ──────────────────────────────────────
  const fetchResults = useCallback(async () => {
    setLoadingResults(true)
    try {
      const res  = await fetch('/api/optimize/portfolio-results')
      const data = await res.json()
      setRows(data.results ?? [])
    } catch { /* silent */ }
    setLoadingResults(false)
  }, [])

  // ── Fetch run status ────────────────────────────────────────
  const fetchRunStatus = useCallback(async (runId: string) => {
    const res  = await fetch(`/api/optimize/run-master?runId=${runId}`)
    const data = await res.json()
    if (data.run) {
      setRun(data.run)
      if (data.run.status === 'complete') {
        fetchResults()
        clearInterval(pollRef.current!)
        setRunMsg('✅ Simulation complete — results loaded.')
      } else if (data.run.status === 'error') {
        clearInterval(pollRef.current!)
        setRunMsg(`❌ Error: ${data.run.error_message ?? 'Unknown'}`)
      }
    }
  }, [fetchResults])

  // Auto-fetch on mount
  useEffect(() => {
    fetchResults()
    // Also fetch latest run
    fetch('/api/optimize/run-master')
      .then(r => r.json())
      .then(d => { if (d.runs?.[0]) setRun(d.runs[0]) })
      .catch(() => {})
  }, [fetchResults])

  // Poll while a run is active
  useEffect(() => {
    if (!activeRunId) return
    pollRef.current = setInterval(() => fetchRunStatus(activeRunId), 5000)
    return () => clearInterval(pollRef.current!)
  }, [activeRunId, fetchRunStatus])

  // ── HARD RESET ──────────────────────────────────────────────
  async function handleReset() {
    if (!confirmReset) { setConfirmReset(true); setResetMsg('⚠ Click again to confirm HARD RESET'); return }
    setConfirmReset(false)
    setResetMsg('Resetting...')
    try {
      const res  = await fetch('/api/optimize/reset', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ scope: resetScope }),
      })
      const data = await res.json()
      if (data.ok) {
        setRows([])
        setRun(null)
        setResetMsg(`✅ Reset complete: ${data.cleared.join(', ')}`)
      } else {
        setResetMsg(`❌ Reset failed: ${JSON.stringify(data.errors)}`)
      }
    } catch (e: any) {
      setResetMsg(`❌ ${e.message}`)
    }
  }

  // ── RUN BACKTEST ─────────────────────────────────────────────
  async function handleRun() {
    setRunMsg('Creating run...')
    setRunCmd('')
    try {
      const res  = await fetch('/api/optimize/run-master', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ startDate, endDate }),
      })
      const data = await res.json()
      if (!data.ok) { setRunMsg(`❌ ${data.error}`); return }

      setActiveRunId(data.runId)
      setRunMsg(data.message)
      setRunCmd(data.command)
      fetchRunStatus(data.runId)
    } catch (e: any) {
      setRunMsg(`❌ ${e.message}`)
    }
  }

  // ── DERIVED METRICS ─────────────────────────────────────────
  const withTrades   = rows.filter(r => r.total_trades > 0)
  const totPnl       = rows.reduce((s,r) => s + r.total_pnl_pct, 0)
  const avgWR        = withTrades.length ? withTrades.reduce((s,r) => s + r.win_rate_pct, 0) / withTrades.length : 0
  const avgDD        = withTrades.length ? withTrades.reduce((s,r) => s + r.max_drawdown_pct, 0) / withTrades.length : 0
  const totTrades    = rows.reduce((s,r) => s + r.total_trades, 0)
  const totRej       = rows.reduce((s,r) => s + r.cap_rejected_trades, 0)
  const profCnt      = rows.filter(r => r.total_pnl_pct > 0).length
  const rejRate      = totTrades + totRej > 0 ? (totRej / (totTrades + totRej) * 100).toFixed(1) : '0'
  const isRunning    = run?.status === 'running' || run?.status === 'pending'
  const latestRunId  = rows[0]?.run_id

  return (
    <div className="p-4 max-w-screen-xl mx-auto space-y-5">

      {/* ── SYSTEM ADMIN PANEL ──────────────────────────────── */}
      <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-400 font-mono font-bold tracking-wider">SYSTEM ADMIN</span>
          <h2 className="text-white font-semibold text-sm">Control Panel</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Date Range */}
          <div className="space-y-2 md:col-span-1">
            <label className="text-gray-400 text-xs font-medium block">BACKTEST DATE RANGE</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-gray-500 text-xs mb-1">Start</p>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex-1">
                <p className="text-gray-500 text-xs mb-1">End</p>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
          </div>

          {/* Run Engine */}
          <div className="space-y-2">
            <label className="text-gray-400 text-xs font-medium block">EXECUTION</label>
            <button onClick={handleRun} disabled={isRunning}
              className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all ${
                isRunning ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/40'
              }`}>
              {isRunning ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Running Simulation...
                </span>
              ) : '▶ Run Institutional Engine v2'}
            </button>
            {runMsg && (
              <p className={`text-xs font-mono leading-relaxed ${
                runMsg.startsWith('✅') ? 'text-green-400' :
                runMsg.startsWith('❌') ? 'text-red-400' : 'text-yellow-400'
              }`}>{runMsg}</p>
            )}
            {runCmd && (
              <div className="bg-gray-950 rounded-lg p-2 border border-gray-700">
                <p className="text-gray-500 text-xs mb-1">Run locally if Vercel spawning failed:</p>
                <code className="text-green-400 text-xs break-all">{runCmd}</code>
              </div>
            )}
          </div>

          {/* Hard Reset */}
          <div className="space-y-2">
            <label className="text-gray-400 text-xs font-medium block">HARD RESET</label>
            <div className="flex gap-2 mb-2">
              {(['results','all'] as const).map(s => (
                <button key={s} onClick={() => setResetScope(s)}
                  className={`flex-1 py-1 rounded text-xs font-medium border transition-colors ${
                    resetScope===s
                      ? 'border-red-500 bg-red-900/30 text-red-300'
                      : 'border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-600'
                  }`}>
                  {s === 'results' ? 'Results Only' : 'Full Reset (incl. candles)'}
                </button>
              ))}
            </div>
            <button onClick={handleReset}
              className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all ${
                confirmReset
                  ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                  : 'bg-gray-800 hover:bg-red-900/40 text-red-400 border border-red-900/50'
              }`}>
              {confirmReset ? '⚠ CONFIRM HARD RESET' : '🗑 HARD RESET'}
            </button>
            {resetMsg && (
              <p className={`text-xs font-mono ${resetMsg.startsWith('✅')?'text-green-400':resetMsg.startsWith('⚠')?'text-yellow-400':'text-red-400'}`}>
                {resetMsg}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── RUN STATUS BAR ──────────────────────────────────── */}
      {run && (
        <div className={`rounded-xl border p-4 ${
          run.status==='complete' ? 'border-green-800 bg-green-950/30' :
          run.status==='error'   ? 'border-red-800 bg-red-950/30'    :
          run.status==='running' ? 'border-indigo-800 bg-indigo-950/30' :
                                   'border-gray-700 bg-gray-900/50'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <StatusDot status={run.status} />
              <div>
                <p className="text-white text-sm font-semibold">
                  {run.status === 'complete' ? 'Simulation Complete' :
                   run.status === 'running'  ? 'Simulation Running...' :
                   run.status === 'error'    ? 'Simulation Failed' : 'Pending'}
                </p>
                <p className="text-gray-400 text-xs font-mono">
                  {run.run_id} · {run.start_date} → {run.end_date}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs">{run.engine}</p>
              {run.completed_at && (
                <p className="text-gray-600 text-xs">{new Date(run.completed_at).toLocaleString()}</p>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {(run.status==='running'||run.status==='pending') && (
            <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${run.progress_pct}%` }}
              />
            </div>
          )}

          {run.error_message && (
            <p className="text-red-400 text-xs mt-2 font-mono">{run.error_message}</p>
          )}
        </div>
      )}

      {/* ── SUMMARY CARDS ───────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="Combined PnL"   value={fmtPnl(totPnl)}          color={pnlColor(totPnl)} />
          <SummaryCard label="Avg Win Rate"   value={`${avgWR.toFixed(1)}%`}  color={wrColor(avgWR)}  />
          <SummaryCard label="Avg Max DD"     value={`${avgDD.toFixed(1)}%`}  color={ddColor(avgDD)}  />
          <SummaryCard label="Total Trades"   value={totTrades.toLocaleString()} color="text-blue-400" />
          <SummaryCard label="Profitable"     value={`${profCnt}/20`}         color={profCnt>=15?'text-green-400':profCnt>=10?'text-yellow-400':'text-red-400'} />
          <SummaryCard label="Health Score"   value={`${(100-parseFloat(rejRate)).toFixed(0)}%`}
            color={(100-parseFloat(rejRate))>=80?'text-green-400':(100-parseFloat(rejRate))>=60?'text-yellow-400':'text-red-400'}
            sub={`${totRej.toLocaleString()} rejected`} />
        </div>
      )}

      {/* ── SYSTEM HEALTH METRICS ───────────────────────────── */}
      {rows.length > 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-900/40 p-4">
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
            System Health Metrics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <HealthMetric
              label="Cap Rejection Rate"
              value={`${rejRate}%`}
              description={`${totRej.toLocaleString()} of ${(totTrades+totRej).toLocaleString()} signals rejected`}
              severity={parseFloat(rejRate) > 50 ? 'critical' : parseFloat(rejRate) > 20 ? 'warning' : 'ok'}
            />
            <HealthMetric
              label="Displaced Trades"
              value={(run?.displaced ?? rows.reduce((s,r)=>s,0)).toLocaleString()}
              description="Positions force-closed by higher-alpha signal"
              severity="ok"
            />
            <HealthMetric
              label="BTC Regime"
              value={`${rows[0]?.win_rate_pct ? rows.filter(r=>r.selected_regime==='trending').length : '—'} Trending`}
              description="Coins that spent majority of period in trend"
              severity="ok"
            />
            <HealthMetric
              label="Run ID"
              value={latestRunId ? latestRunId.slice(-12) : '—'}
              description={rows[0]?.updated_at ? new Date(rows[0].updated_at).toLocaleString() : 'No run yet'}
              severity="ok"
            />
          </div>
        </div>
      )}

      {/* ── RESULTS TABLE ───────────────────────────────────── */}
      {loadingResults && (
        <div className="text-center py-8 text-gray-400 text-sm">Loading results...</div>
      )}

      {!loadingResults && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-700 py-16 text-center">
          <p className="text-gray-500 mb-2">No results yet.</p>
          <p className="text-gray-600 text-sm">Select a date range above and click <span className="text-indigo-400">▶ Run Institutional Engine v2</span></p>
          <p className="text-gray-600 text-xs mt-1">Or run locally: <code className="text-green-500">node frontend/scripts/portfolio-simulation.mjs</code></p>
        </div>
      )}

      {!loadingResults && rows.length > 0 && (
        <div className="rounded-xl border border-gray-700 overflow-hidden">
          <div className="bg-gray-800/80 px-4 py-3 flex items-center justify-between">
            <h3 className="text-white text-sm font-semibold">
              Final Aggregated Report
              <span className="ml-2 text-xs text-gray-500 font-normal font-mono">
                {latestRunId ?? ''}
              </span>
            </h3>
            <button onClick={fetchResults}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              ↻ Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-800/60 text-gray-400 uppercase text-xs">
                  <th className="px-3 py-3 text-left w-8">#</th>
                  <th className="px-3 py-3 text-left">Coin</th>
                  <th className="px-3 py-3 text-left">Regime</th>
                  <th className="px-3 py-3 text-left">Active Strategy</th>
                  <th className="px-3 py-3 text-right">6M Win%</th>
                  <th className="px-3 py-3 text-right">Net PnL%</th>
                  <th className="px-3 py-3 text-right">Max DD%</th>
                  <th className="px-3 py-3 text-right">Trades</th>
                  <th className="px-3 py-3 text-right">CapRej</th>
                  <th className="px-3 py-3 text-right">TP/SL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rows.map((r, i) => (
                  <tr key={r.coin} className="bg-gray-900 hover:bg-gray-800/70 transition-colors">
                    <td className="px-3 py-2.5 text-gray-600">{i+1}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-white">{r.coin.replace('USDT','')}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        r.selected_regime==='trending'
                          ? 'bg-blue-900/60 text-blue-300'
                          : 'bg-purple-900/60 text-purple-300'
                      }`}>
                        {r.selected_regime==='trending' ? '↑ Trend' : '↔ Range'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-300">{r.best_strategy}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${wrColor(r.win_rate_pct)}`}>
                      {r.win_rate_pct.toFixed(1)}%
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold ${pnlColor(r.total_pnl_pct)}`}>
                      {fmtPnl(r.total_pnl_pct)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono ${ddColor(r.max_drawdown_pct)}`}>
                      {r.max_drawdown_pct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-300">{r.total_trades}</td>
                    <td className={`px-3 py-2.5 text-right ${r.cap_rejected_trades > 100 ? 'text-red-400' : 'text-gray-500'}`}>
                      {r.cap_rejected_trades}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500 font-mono">
                      {r.tp_pct}/{r.sl_pct}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Totals footer */}
              <tfoot>
                <tr className="bg-gray-800 border-t-2 border-gray-600 font-semibold text-xs">
                  <td colSpan={4} className="px-3 py-3 text-gray-400 uppercase tracking-wider text-xs">
                    Portfolio Total
                  </td>
                  <td className={`px-3 py-3 text-right font-mono ${wrColor(avgWR)}`}>
                    {avgWR.toFixed(1)}%
                  </td>
                  <td className={`px-3 py-3 text-right font-mono font-bold text-sm ${pnlColor(totPnl)}`}>
                    {fmtPnl(totPnl)}
                  </td>
                  <td className={`px-3 py-3 text-right font-mono ${ddColor(avgDD)}`}>
                    {avgDD.toFixed(1)}%
                  </td>
                  <td className="px-3 py-3 text-right text-white">{totTrades.toLocaleString()}</td>
                  <td className={`px-3 py-3 text-right ${totRej > 500 ? 'text-red-400' : 'text-gray-400'}`}>
                    {totRej.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right text-gray-500">
                    {profCnt}/20 profitable
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="bg-gray-900 px-4 py-2 flex justify-between text-gray-600 text-xs border-t border-gray-800">
            <span>Trailing SL: Breakeven triggered at 50% of TP · Cap=5 · Density-ranked admission</span>
            <span>Updated: {rows[0]?.updated_at ? new Date(rows[0].updated_at).toLocaleString() : '—'}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── SUB-COMPONENTS ─────────────────────────────────────────────
function SummaryCard({ label, value, color, sub }: { label:string; value:string; color:string; sub?:string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-3.5 border border-gray-700">
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-gray-600 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

function HealthMetric({ label, value, description, severity }:
  { label:string; value:string; description:string; severity:'ok'|'warning'|'critical' }) {
  const colors = { ok:'text-green-400', warning:'text-yellow-400', critical:'text-red-400' }
  const bg     = { ok:'bg-green-900/20 border-green-900/40', warning:'bg-yellow-900/20 border-yellow-900/40', critical:'bg-red-900/20 border-red-900/40' }
  return (
    <div className={`rounded-lg p-3 border ${bg[severity]}`}>
      <p className="text-gray-500 text-xs mb-0.5">{label}</p>
      <p className={`text-base font-bold font-mono ${colors[severity]}`}>{value}</p>
      <p className="text-gray-600 text-xs mt-1 leading-tight">{description}</p>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    complete: 'bg-green-400',
    running:  'bg-indigo-400 animate-pulse',
    pending:  'bg-yellow-400 animate-pulse',
    error:    'bg-red-400',
  }
  return <span className={`w-2.5 h-2.5 rounded-full inline-block ${map[status] ?? 'bg-gray-400'}`} />
}

function Spinner() {
  return <span className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin inline-block" />
}
