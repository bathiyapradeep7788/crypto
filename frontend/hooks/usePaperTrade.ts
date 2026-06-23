'use client'
import { useState, useCallback, useRef } from 'react'
import { TradeSessionConfig, TradingSession } from '@/types'
import { startPaperTrade, stopPaperTrade, getPaperStatus } from '@/lib/api'

export function usePaperTrade() {
  const [session, setSession] = useState<TradingSession | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(async (config: TradeSessionConfig) => {
    setError(null)
    try {
      const { session_id } = await startPaperTrade(config)
      setSessionId(session_id)

      const poll = setInterval(async () => {
        try {
          const data = await getPaperStatus(session_id)
          setSession(data)
          if (data.status === 'stopped') clearInterval(poll)
        } catch {
          clearInterval(poll)
        }
      }, 3000)
      pollRef.current = poll
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  const stop = useCallback(async () => {
    if (!sessionId) return
    if (pollRef.current) clearInterval(pollRef.current)
    await stopPaperTrade(sessionId)
    setSession(prev => prev ? { ...prev, status: 'stopped' } : prev)
  }, [sessionId])

  return { start, stop, session, error }
}
