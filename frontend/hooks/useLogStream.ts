'use client'
import { useEffect, useRef, useState } from 'react'
import { LogEntry } from '@/types'
import { getRecentLogs } from '@/lib/api'

// Polls /logs/recent on a SEQUENTIAL schedule: the next poll is only scheduled
// after the current one settles. This prevents request pile-up — overlapping
// polls were spawning many concurrent cold-start requests and tripping the
// Vercel free-tier concurrency limit (503 storm). Replaces the old SSE stream.
const POLL_MS = 4000

export function useLogStream() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const lastIdRef = useRef(0)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>

    const tick = async () => {
      try {
        const data = await getRecentLogs(lastIdRef.current)
        if (!alive) return
        if (data.logs.length > 0) {
          lastIdRef.current = data.last_id
          setLogs(prev => [...data.logs.slice().reverse(), ...prev].slice(0, 500))
        }
      } catch {
        // ignore — next tick retries
      } finally {
        if (alive) timer = setTimeout(tick, POLL_MS)
      }
    }

    tick()
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  const clear = () => { setLogs([]) }

  return { logs, clear }
}
