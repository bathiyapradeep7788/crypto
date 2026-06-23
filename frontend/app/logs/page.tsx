import TabBar    from '@/components/layout/TabBar'
import LogStream from '@/components/logs/LogStream'

export default function LogsPage() {
  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">System Logs</h1>
            <p className="text-xs text-gray-500 mt-0.5">Real-time stream — backend API calls, AI decisions, strategy events, errors</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-surface-card border border-surface-border rounded-lg px-3 py-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Live stream from backend</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-600">When deployed: Render logs</span>
          </div>
        </div>
        <LogStream />
      </main>
    </div>
  )
}
