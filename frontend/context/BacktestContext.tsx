'use client'
import { createContext, useContext, useCallback, useRef, useState } from 'react'
import { BacktestConfig, TradeResult } from '@/types'
import { runBacktest } from '@/lib/api'
import { COIN_BEST_SETTINGS } from '@/lib/constants'

type Status = 'idle' | 'running' | 'done' | 'error'

interface Notification { kind: 'success' | 'error'; text: string }

interface BacktestState {
  status: Status
  progress: { processed: number; total: number; currentCoin?: string }
  results: TradeResult[]
  error: string | null
  notification: Notification | null
  run: (config: BacktestConfig) => void
  runPerCoin: (coins: string[], baseConfig: Omit<BacktestConfig, 'coins' | 'strategies' | 'min_confluence'>) => void
  stop: () => void
  dismiss: () => void
}

const Ctx = createContext<BacktestState | null>(null)

export function BacktestProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus]     = useState<Status>('idle')
  const [progress, setProgress] = useState<{ processed: number; total: number; currentCoin?: string }>({ processed: 0, total: 0 })
  const [results, setResults]   = useState<TradeResult[]>([])
  const [error, setError]       = useState<string | null>(null)
  const [notification, setNotification] = useState<Notification | null>(null)
  const runningRef   = useRef(false)
  const cancelledRef = useRef(false)
  const abortRef     = useRef<AbortController | null>(null)

  // Normal mode: one strategy at a time, same coins for all
  const run = useCallback(async (config: BacktestConfig) => {
    if (runningRef.current) return
    runningRef.current = true
    cancelledRef.current = false
    setStatus('running'); setResults([]); setError(null); setNotification(null)

    const strategies = config.strategies
    setProgress({ processed: 0, total: strategies.length })
    const acc: TradeResult[] = []
    let failures = 0
    let stopped = false

    for (let i = 0; i < strategies.length; i++) {
      if (cancelledRef.current) { stopped = true; break }
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const res = await runBacktest({ ...config, strategies: [strategies[i]] }, 3, ctrl.signal)
        acc.push(...(res.results ?? []))
        setResults([...acc])
      } catch (e: any) {
        if (cancelledRef.current || e?.name === 'AbortError') { stopped = true; break }
        failures += 1
      }
      setProgress({ processed: i + 1, total: strategies.length })
    }

    runningRef.current = false
    abortRef.current = null
    _finish(stopped, failures, strategies.length, acc)
  }, [])

  // Smart mode: one coin at a time, each coin uses its own best strategies + confluence
  const runPerCoin = useCallback(async (
    coins: string[],
    baseConfig: Omit<BacktestConfig, 'coins' | 'strategies' | 'min_confluence'>
  ) => {
    if (runningRef.current) return
    runningRef.current = true
    cancelledRef.current = false
    setStatus('running'); setResults([]); setError(null); setNotification(null)
    setProgress({ processed: 0, total: coins.length, currentCoin: coins[0] })

    const acc: TradeResult[] = []
    let failures = 0
    let stopped = false

    for (let i = 0; i < coins.length; i++) {
      if (cancelledRef.current) { stopped = true; break }
      const coin = coins[i]
      const coinSetting = COIN_BEST_SETTINGS[coin]
      const strategies   = coinSetting?.strategies  ?? ['rsi_macd', 'ema_crossover']
      const confluence   = coinSetting?.confluence  ?? 1

      setProgress({ processed: i, total: coins.length, currentCoin: coin })

      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const res = await runBacktest({
          ...baseConfig,
          coins: [coin],
          strategies,
          min_confluence: confluence,
        } as BacktestConfig, 3, ctrl.signal)
        acc.push(...(res.results ?? []))
        setResults([...acc])
      } catch (e: any) {
        if (cancelledRef.current || e?.name === 'AbortError') { stopped = true; break }
        failures += 1
      }
      setProgress({ processed: i + 1, total: coins.length, currentCoin: coin })
    }

    runningRef.current = false
    abortRef.current = null
    _finish(stopped, failures, coins.length, acc)
  }, [])

  function _finish(stopped: boolean, failures: number, total: number, acc: TradeResult[]) {
    if (stopped) {
      setStatus('idle')
      setNotification({ kind: 'error', text: `Stopped — ${acc.length} trades saved so far.` })
    } else if (failures === total) {
      setError('Backtest failed — backend busy or range too large.')
      setStatus('error')
      setNotification({ kind: 'error', text: 'Backtest failed — try a shorter date range.' })
    } else {
      const note = failures > 0
        ? `Done — ${acc.length} trades (${failures} timed out).`
        : `Backtest complete — ${acc.length} trades.`
      if (failures > 0) setError(`${failures} of ${total} requests timed out — showing the rest.`)
      setStatus('done')
      setNotification({ kind: 'success', text: note })
    }
  }

  const stop    = useCallback(() => { cancelledRef.current = true; abortRef.current?.abort() }, [])
  const dismiss = useCallback(() => setNotification(null), [])

  return (
    <Ctx.Provider value={{ status, progress, results, error, notification, run, runPerCoin, stop, dismiss }}>
      {children}
    </Ctx.Provider>
  )
}

export function useBacktestCtx() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBacktestCtx must be used within BacktestProvider')
  return ctx
}
