'use client'
import { useState, useCallback } from 'react'
import { BacktestConfig, TradeResult } from '@/types'
import { startBacktest, getJobStatus } from '@/lib/api'

type Status = 'idle' | 'running' | 'done' | 'error'

export function useBacktest() {
  const [status, setStatus]   = useState<Status>('idle')
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [results, setResults] = useState<TradeResult[]>([])
  const [error, setError]     = useState<string | null>(null)

  const run = useCallback(async (config: BacktestConfig) => {
    setStatus('running')
    setResults([])
    setError(null)

    try {
      const { job_id } = await startBacktest(config)

      const poll = setInterval(async () => {
        try {
          const data = await getJobStatus(job_id)
          setProgress({ processed: data.processed, total: data.total })

          if (data.status === 'done') {
            clearInterval(poll)
            setResults(data.results ?? [])
            setStatus('done')
          } else if (data.status === 'error') {
            clearInterval(poll)
            setError('Backtest failed — check System Logs for details')
            setStatus('error')
          }
        } catch {
          clearInterval(poll)
          setStatus('error')
        }
      }, 2000)

    } catch (e: any) {
      setError(e.message)
      setStatus('error')
    }
  }, [])

  return { run, status, progress, results, error }
}
