import TabBar     from '@/components/layout/TabBar'
import LogStream  from '@/components/logs/LogStream'

export default function LogsPage() {
  return (
    <div className="min-h-screen bg-surface">
      <TabBar />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-white">System Logs</h1>
          <p className="text-xs text-gray-500 mt-0.5">Real-time stream of API calls, strategy events, and errors</p>
        </div>
        <LogStream />
      </main>
    </div>
  )
}
