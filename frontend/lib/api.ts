import { BacktestConfig, JobStatus, TradeSessionConfig, TradingSession, CombinedStrategy, LogEntry } from '@/types'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Serverless cold starts (~12s) make the first request after idle 503/time out.
// Retry GETs a few times with a short backoff so a cold start doesn't surface
// as an error in the UI.
export async function getJSON<T>(path: string, retries = 3): Promise<T> {
  let lastErr: any
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`${BASE}${path}`)
      if (res.status === 503 || res.status === 502 || res.status === 504) {
        throw new Error(`warming up (${res.status})`)
      }
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    } catch (e) {
      lastErr = e
      if (i < retries) await new Promise(r => setTimeout(r, 1500))
    }
  }
  throw lastErr
}

// ── Backtest ──────────────────────────────────────────────────
export async function startBacktest(config: BacktestConfig): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/backtest/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  return getJSON<JobStatus>(`/backtest/status/${jobId}`)
}

// ── Logs (polling) ────────────────────────────────────────────
export async function getRecentLogs(afterId = 0): Promise<{ logs: LogEntry[]; last_id: number }> {
  return getJSON(`/logs/recent?after_id=${afterId}`, 1)
}

// ── Combined Strategies ───────────────────────────────────────
export async function listCombined(): Promise<CombinedStrategy[]> {
  try {
    return await getJSON<CombinedStrategy[]>('/strategies/combined')
  } catch {
    return []
  }
}

export async function createCombined(payload: {
  name: string; strategy_a: string; strategy_b: string; params?: Record<string, number>
}): Promise<CombinedStrategy> {
  const res = await fetch(`${BASE}/strategies/combined`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error((await res.json()).detail || `API error: ${res.status}`)
  return res.json()
}

export async function updateCombined(
  id: string,
  payload: Partial<{ name: string; strategy_a: string; strategy_b: string; params: Record<string, number> }>
): Promise<CombinedStrategy> {
  const res = await fetch(`${BASE}/strategies/combined/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error((await res.json()).detail || `API error: ${res.status}`)
  return res.json()
}

export async function deleteCombined(id: string): Promise<void> {
  await fetch(`${BASE}/strategies/combined/${id}`, { method: 'DELETE' })
}

// ── Paper Trade ───────────────────────────────────────────────
export async function startPaperTrade(config: TradeSessionConfig): Promise<{ session_id: string }> {
  const res = await fetch(`${BASE}/paper-trade/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function stopPaperTrade(sessionId: string): Promise<void> {
  await fetch(`${BASE}/paper-trade/stop/${sessionId}`, { method: 'POST' })
}

export async function getPaperStatus(sessionId: string): Promise<TradingSession> {
  const res = await fetch(`${BASE}/paper-trade/status/${sessionId}`)
  if (!res.ok) throw new Error(`Status error: ${res.status}`)
  return res.json()
}

export async function getAllPaperSessions(): Promise<TradingSession[]> {
  try {
    return await getJSON<TradingSession[]>('/paper-trade/sessions')
  } catch {
    return []
  }
}

// ── Live Trade ────────────────────────────────────────────────
export async function startLiveTrade(config: TradeSessionConfig): Promise<{ session_id: string }> {
  const res = await fetch(`${BASE}/live-trade/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function stopLiveTrade(sessionId: string): Promise<void> {
  await fetch(`${BASE}/live-trade/stop/${sessionId}`, { method: 'POST' })
}

export async function getLiveStatus(sessionId: string): Promise<TradingSession> {
  const res = await fetch(`${BASE}/live-trade/status/${sessionId}`)
  if (!res.ok) throw new Error(`Status error: ${res.status}`)
  return res.json()
}

export async function getAllLiveSessions(): Promise<TradingSession[]> {
  try {
    return await getJSON<TradingSession[]>('/live-trade/sessions')
  } catch {
    return []
  }
}

// ── Best-per-coin (backtest) — one coin per request to avoid serverless timeout ──
export async function getBestPerCoin(params: {
  coins: string[]
  start_dt: string
  end_dt: string
  interval?: string
  tp_pct?: number
  tp2_pct?: number
  sl_pct?: number
  onProgress?: (done: number, total: number, result: any) => void
}): Promise<{ results: any[] }> {
  const results: any[] = []
  const base = {
    start_dt: params.start_dt,
    end_dt:   params.end_dt,
    interval: params.interval ?? '15m',
    tp_pct:   String(params.tp_pct ?? 2.0),
    tp2_pct:  String(params.tp2_pct ?? 4.0),
    sl_pct:   String(params.sl_pct ?? 1.5),
  }
  for (let i = 0; i < params.coins.length; i++) {
    const coin = params.coins[i]
    const qs = new URLSearchParams({ coin, ...base })
    try {
      const r = await getJSON<any>(`/backtest/best-per-coin?${qs}`, 2)
      results.push(r)
    } catch (e: any) {
      results.push({ coin, error: e.message, best_strategy: null, win_rate: 0, total_pnl_pct: 0, total_trades: 0, all_strategies: [] })
    }
    params.onProgress?.(i + 1, params.coins.length, results[results.length - 1])
  }
  return { results }
}

// ── Monitor ───────────────────────────────────────────────────
export interface MonitorConfig {
  coins: string[]
  interval: string
  strategy: string
  tp_pct: number
  tp2_pct: number
  sl_pct: number
  trade_usdt: number
  ai_min_confidence: number
}

export async function checkMonitor(mode: 'paper' | 'live', config: MonitorConfig): Promise<any> {
  const res = await fetch(`${BASE}/${mode === 'paper' ? 'paper-trade' : 'live-trade'}/monitor/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function getMonitorPositions(mode: 'paper' | 'live'): Promise<{ positions: any[] }> {
  return getJSON(`/${mode === 'paper' ? 'paper-trade' : 'live-trade'}/monitor/positions`)
}

export async function getMonitorTrades(mode: 'paper' | 'live'): Promise<{ trades: any[] }> {
  return getJSON(`/${mode === 'paper' ? 'paper-trade' : 'live-trade'}/monitor/trades`)
}

export async function closeMonitorPosition(mode: 'paper' | 'live', id: string): Promise<any> {
  const res = await fetch(`${BASE}/${mode === 'paper' ? 'paper-trade' : 'live-trade'}/monitor/close/${id}`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function thinkMonitorPosition(mode: 'paper' | 'live', id: string): Promise<any> {
  const res = await fetch(`${BASE}/${mode === 'paper' ? 'paper-trade' : 'live-trade'}/monitor/think/${id}`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ── Report ────────────────────────────────────────────────────
export async function getReport(coin: string, start_dt: string, end_dt: string): Promise<any> {
  const qs = new URLSearchParams({ coin, start_dt, end_dt })
  return getJSON(`/report/coin?${qs}`)
}

// ── Strategy Optimisation per coin ───────────────────────────
export type OptimizeResult = {
  coin: string
  best_strategy: string | null
  best_strategy_label: string | null
  optimized_params: { tp_pct: number; tp2_pct: number; sl_pct: number }
  win_rate: number
  total_pnl_pct: number
  total_trades: number
  all_strategies: { strategy: string; strategy_label: string; win_rate: number; total_pnl_pct: number; total_trades: number }[]
  error?: string
}

export async function optimizeAllCoins(params: {
  coins: string[]
  start_dt: string
  end_dt: string
  interval?: string
  save?: boolean
  onProgress?: (done: number, total: number, result: OptimizeResult) => void
}): Promise<{ results: OptimizeResult[] }> {
  const results: OptimizeResult[] = []
  const base = {
    start_dt: params.start_dt,
    end_dt:   params.end_dt,
    interval: params.interval ?? '15m',
    save:     String(params.save ?? false),
  }
  for (let i = 0; i < params.coins.length; i++) {
    const coin = params.coins[i]
    const qs = new URLSearchParams({ coin, ...base })
    try {
      const r = await getJSON<OptimizeResult>(`/backtest/optimize-coin?${qs}`, 2)
      results.push(r)
    } catch (e: any) {
      results.push({
        coin, error: e.message, best_strategy: null, best_strategy_label: null,
        optimized_params: { tp_pct: 2, tp2_pct: 4, sl_pct: 1.5 },
        win_rate: 0, total_pnl_pct: 0, total_trades: 0, all_strategies: [],
      })
    }
    params.onProgress?.(i + 1, params.coins.length, results[results.length - 1])
  }
  return { results }
}

export async function getDashboard(): Promise<{ rows: any[] }> {
  return getJSON('/backtest/dashboard')
}
