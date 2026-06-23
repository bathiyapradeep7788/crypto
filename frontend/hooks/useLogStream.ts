'use client'
import { useEffect, useRef, useState } from 'react'
import { LogEntry } from '@/types'
import { getRecentLogs } from '@/lib/api'

// Polls /logs/recent every 2s. Replaces the old SSE EventSource, which kept
// erroring + reconnecting on Vercel serverless (no long-lived connections).
export function useLogStream() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const lastIdRef = useRef(0)

  useEffect(() => {
    let alive = true

    const tick = async () => {
      try {
        const data = await getRecentLogs(lastIdRef.current)
        if (!alive) return
        if (data.logs.length > 0) {
          lastIdRef.current = data.last_id
          // newest first, capped at 500
          setLogs(prev => [...data.logs.slice().reverse(), ...prev].slice(0, 500))
        }
      } catch {
        // ignore — next tick retries
      }
    }

    tick()
    const id = setInterval(tick, 2000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const clear = () => { setLogs([]) }

  return { logs, clear }
}
