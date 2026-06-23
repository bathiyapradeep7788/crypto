'use client'
import { useLogStream } from '@/hooks/useLogStream'

export default function LogStream() {
  const { logs, clear } = useLogStream()

  return (
    <div className="bg-surface-card border border-surface-border rounded-lg h-[calc(100vh-180px)] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
          <span className="text-sm font-medium text-gray-300">Live System Logs</span>
          <span className="text-xs text-gray-600">{logs.length} entries</span>
        </div>
        <button onClick={clear} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1">
        {logs.length === 0 ? (
          <p className="text-gray-600 text-center mt-8">Waiting for log events...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-3 hover:bg-surface-hover px-2 py-0.5 rounded">
              <span className="text-gray-600 shrink-0">{new Date(log.ts).toLocaleTimeString()}</span>
              <span className={`shrink-0 w-10 ${
                log.level === 'ERROR' ? 'text-red-400' :
                log.level === 'WARN'  ? 'text-yellow-400' :
                                        'text-blue-400'
              }`}>{log.level}</span>
              <span className="text-gray-300">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
