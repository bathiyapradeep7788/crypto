'use client'
import { createContext, useContext, useCallback, useRef, useState } from 'react'
import { BacktestConfig, TradeResult } from '@/types'
import { runBacktest } from '@/lib/api'

type Status = 'idle' | 'running' | 'done' | 'error'

interface Notification { kind: 'success' | 'error'; text: string }

interface BacktestState {
  status: Status
  progress: { processed: number; total: number }
  results: TradeResult[]
  error: string | null
  notification: Notification | null
  run: (config: BacktestConfig) => void
  dismiss: () => void
}

const Ctx = createContext<BacktestState | null>(null)

export function BacktestProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus]     = useState<Status>('idle')
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [results, setResults]   = useState<TradeResult[]>([])
  const [error, setError]       = useState<string | null>(null)
  const [notification, setNotification] = useState<Notification | null>(null)
  const runningRef = useRef(false)

  const run = useCallback(async (config: BacktestConfig) => {
    if (runningRef.current) return
    runningRef.current = true
    setStatus('running'); setResults([]); setError(null); setNotification(null)

    // One strategy per request — keeps each serverless call bounded and lets
    // results stream in. Runs in the provider, so it survives tab switches.
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

    runningRef.current = false
    if (failures === strategies.length) {
      setError('Backtest failed — backend busy or range too large. Try fewer coins / shorter range.')
      setStatus('error')
      setNotification({ kind: 'error', text: 'Backtest failed — try fewer coins or a shorter range.' })
    } else {
      const note = failures > 0
        ? `Backtest done — ${acc.length} trades (${failures} strategy(ies) timed out).`
        : `✅ Backtest complete — ${acc.length} trades across ${strategies.length} strategies.`
      if (failures > 0) setError(`${failures} of ${strategies.length} strategies timed out — showing the rest.`)
      setStatus('done')
      setNotification({ kind: 'success', text: note })
    }
  }, [])

  const dismiss = useCallback(() => setNotification(null), [])

  return (
    <Ctx.Provider value={{ status, progress, results, error, notification, run, dismiss }}>
      {children}
    </Ctx.Provider>
  )
}

export function useBacktestCtx() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBacktestCtx must be used within BacktestProvider')
  return ctx
}
