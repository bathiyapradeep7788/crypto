'use client'
import { useState } from 'react'
import TabBar from '@/components/layout/TabBar'
import { getReport } from '@/lib/api'
import { COINS } from '@/lib/constants'
import { useErrorToast } from '@/hooks/useErrorToast'

export default function ReportPage() {
  const { addToast } = useErrorToast()
  const [coin,    setCoin]    = useState('BTCUSDT')
  const [startDt, setStartDt] = useState('2024-01-01T00:00')
  const [endDt,   setEndDt]   = useState('2024-12-31T00:00')
  const [loading, setLoading] = useState(false)
  const [report,  setReport]  = useState<any>(null)
  const [expanded, setExpanded] = useState(false)

  const generate = async () => {
    setLoading(true)
    setReport(null)
    try {
      const data = await getReport(coin, new Date(startDt).toISOString(), new Date(endDt).toISOString())
      setReport(data)
    } catch (e: any) {
      addToast(`Report error: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  const exportTxt = () => {
    if (!report?.text_report) return
    const blob = new Blob([report.text_report], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `report_${coin}_${startDt.slice(0,10)}_${endDt.slice(0,10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const bs  = report?.backtest_summary
  const ps  = report?.paper_summary
  const ls  = report?.live_summary
  const ms  = report?.monitor_summary

  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Coin Report</h1>
          <p className="text-xs text-gray-500 mt-0.5">Full analysis for a coin across all trading modes</p>
        </div>

        {/* Config */}
        <div className="bg-surface-card border border-surface-border rounded-lg p-4 mb-5 grid grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Coin</label>
            <select value={coin} onChange={e => setCoin(e.target.value)}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand">
              {COINS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start Date</label>
            <input type="datetime-local" value={startDt} onChange={e => setStartDt(e.target.value)}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">End Date</label>
            <input type="datetime-local" value={endDt} onChange={e => setEndDt(e.target.value)}
              className="w-full bg-surface border border-surface-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand" />
          </div>
          <button onClick={generate} disabled={loading}
            className={`py-2 rounded-lg font-semibold text-sm transition-all ${loading ? 'bg-surface-border text-gray-500 cursor-not-allowed' : 'bg-brand hover:bg-brand-dark text-black'}`}>
            {loading ? 'Generating…' : '📊 Generate Report'}
          </button>
        </div>

        {report && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-3 mb-5">
              <div className="bg-surface-card border border-surface-border rounded-lg p-4">
                <p className="text-xs text-gray-500">Best Strategy</p>
                <p className="text-sm font-bold text-brand mt-1">{bs?.best_strategy || 'N/A'}</p>
              </div>
              <div className="bg-surface-card border border-surface-border rounded-lg p-4">
                <p className="text-xs text-gray-500">Backtest Win Rate</p>
                <p className="text-xl font-bold text-white mt-1">{bs?.win_rate ?? 0}%</p>
                <p className="text-xs text-gray-600">{bs?.total_trades ?? 0} trades</p>
              </div>
              <div className="bg-surface-card border border-surface-border rounded-lg p-4">
                <p className="text-xs text-gray-500">Backtest PnL</p>
                <p className={`text-xl font-bold mt-1 ${(bs?.total_pnl_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {bs?.total_pnl_pct ?? 0}%
                </p>
              </div>
              <div className="bg-surface-card border border-surface-border rounded-lg p-4">
                <p className="text-xs text-gray-500">Monitor PnL ($)</p>
                <p className={`text-xl font-bold mt-1 ${(ms?.total_pnl_usdt ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${ms?.total_pnl_usdt ?? 0}
                </p>
                <p className="text-xs text-gray-600">{ms?.win_rate ?? 0}% WR</p>
              </div>
            </div>

            {/* Strategy Breakdown */}
            {bs?.by_strategy?.length > 0 && (
              <div className="bg-surface-card border border-surface-border rounded-lg p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Strategy Breakdown (Backtest)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 text-left border-b border-surface-border">
                        <th className="pb-2 pr-4">Strategy</th>
                        <th className="pb-2 pr-4">Trades</th>
                        <th className="pb-2 pr-4">Win Rate</th>
                        <th className="pb-2">PnL%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bs.by_strategy.map((s: any, i: number) => (
                        <tr key={i} className="border-b border-surface-border hover:bg-surface-hover">
                          <td className="py-1.5 pr-4 text-blue-400 font-medium">{s.strategy}</td>
                          <td className="py-1.5 pr-4 text-gray-300">{s.trades}</td>
                          <td className="py-1.5 pr-4 text-gray-300">{s.win_rate}%</td>
                          <td className={`py-1.5 font-semibold ${s.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{s.pnl >= 0 ? '+' : ''}{s.pnl}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Trade mode summaries */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Paper Trades', data: ps, color: 'text-green-400' },
                { label: 'Live Trades',  data: ls, color: 'text-red-400' },
                { label: 'Monitor',      data: ms, color: 'text-brand' },
              ].map(({ label, data, color }) => (
                <div key={label} className="bg-surface-card border border-surface-border rounded-lg p-4">
                  <p className={`text-sm font-semibold ${color} mb-2`}>{label}</p>
                  <div className="space-y-1 text-xs text-gray-400">
                    <div className="flex justify-between"><span>Trades</span><span className="text-white">{data?.total_trades ?? 0}</span></div>
                    <div className="flex justify-between"><span>Win Rate</span><span className="text-white">{data?.win_rate ?? 0}%</span></div>
                    <div className="flex justify-between"><span>PnL ($)</span>
                      <span className={(data?.total_pnl_usdt ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                        ${data?.total_pnl_usdt ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Text report */}
            <div className="bg-surface-card border border-surface-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Text Report</h3>
                <div className="flex gap-2">
                  <button onClick={() => setExpanded(e => !e)}
                    className="text-xs px-3 py-1.5 bg-surface border border-surface-border rounded text-gray-400 hover:text-white transition-colors">
                    {expanded ? 'Collapse' : 'Expand'}
                  </button>
                  <button onClick={exportTxt}
                    className="text-xs px-3 py-1.5 bg-brand/20 border border-brand/40 rounded text-brand hover:bg-brand/30 transition-colors">
                    ↓ Export .txt
                  </button>
                </div>
              </div>
              <pre className={`text-xs text-gray-400 font-mono whitespace-pre-wrap bg-surface rounded p-3 overflow-x-auto transition-all ${expanded ? '' : 'max-h-40 overflow-y-hidden'}`}>
                {report.text_report}
              </pre>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
