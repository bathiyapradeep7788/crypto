'use client'
import { useState, useCallback } from 'react'
import { BacktestConfig, TradeResult } from '@/types'
import { runBacktest } from '@/lib/api'

type Status = 'idle' | 'running' | 'done' | 'error'

export function useBacktest() {
  const [status, setStatus]     = useState<Status>('idle')
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [results, setResults]   = useState<TradeResult[]>([])
  const [error, setError]       = useState<string | null>(null)

  const run = useCallback(async (config: BacktestConfig) => {
    setStatus('running')
    setResults([])
    setError(null)

    // Run one strategy per request: keeps each serverless call within its time
    // limit (functions are frozen if a long job runs past the response) and
    // lets results stream in strategy-by-strategy.
    const strategies = config.strategies
    setProgress({ processed: 0, total: strategies.length })

    const acc: TradeResult[] = []
    let failures = 0

    for (let i = 0; i < strategies.length; i++) {
      try {
        const res = await runBacktest({ ...config, strategies: [strategies[i]] })
        acc.push(...(res.results ?? []))
        setResults([...acc])
      } catch {
        failures += 1
      }
      setProgress({ processed: i + 1, total: strategies.length })
    }

    if (failures === strategies.length) {
      setError('Backtest failed — the backend may be busy or the range too large. Try fewer coins or a shorter date range.')
      setStatus('error')
    } else {
      if (failures > 0) {
        setError(`${failures} of ${strategies.length} strategies timed out — showing the rest. Try fewer coins or a shorter range.`)
      }
      setStatus('done')
    }
  }, [])

  return { run, status, progress, results, error }
}
