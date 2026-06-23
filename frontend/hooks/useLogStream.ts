'use client'
import { useEffect, useRef, useState } from 'react'
import { LogEntry } from '@/types'
import { getLogStreamUrl } from '@/lib/api'

export function useLogStream() {
  const [logs, setLogs]   = useState<LogEntry[]>([])
  const sourceRef         = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource(getLogStreamUrl())
    sourceRef.current = es

    es.onmessage = (e) => {
      try {
        const entry: LogEntry = JSON.parse(e.data)
        setLogs(prev => [entry, ...prev].slice(0, 500))
      } catch {}
    }

    es.onerror = () => {
      es.close()
      // Reconnect after 3s
      setTimeout(() => {
        const es2 = new EventSource(getLogStreamUrl())
        sourceRef.current = es2
        es2.onmessage = (e) => {
          try {
            const entry: LogEntry = JSON.parse(e.data)
            setLogs(prev => [entry, ...prev].slice(0, 500))
          } catch {}
        }
      }, 3000)
    }

    return () => es.close()
  }, [])

  const clear = () => setLogs([])

  return { logs, clear }
}
