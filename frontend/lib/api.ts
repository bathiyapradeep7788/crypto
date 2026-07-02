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

// ── Signal Logger ─────────────────────────────────────────────
export async function scanSignals(params: {
  coin: string
  start_dt: string
  end_dt: string
  tp_pct?: number
  tp2_pct?: number
  sl_pct?: number
  strategies?: string[]
  strategyParams?: Record<string, Record<string, number>>
}): Promise<{ coin: string; signals_found: number; message?: string }> {
  const qs = new URLSearchParams({
    coin:     params.coin,
    start_dt: params.start_dt,
    end_dt:   params.end_dt,
    tp_pct:   String(params.tp_pct  ?? 2.0),
    tp2_pct:  String(params.tp2_pct ?? 4.0),
    sl_pct:   String(params.sl_pct  ?? 1.5),
  })
  if (params.strategies?.length) qs.set('strategies', params.strategies.join(','))
  if (params.strategyParams && Object.keys(params.strategyParams).length)
    qs.set('params', JSON.stringify(params.strategyParams))
  return getJSON(`/signals/scan?${qs}`, 2)
}

export type SignalListOpts = {
  coin?: string | string[]
  strategy_id?: string | string[]
  outcome?: string
  close_from?: string
  close_to?: string
  sort_by?: string
  sort_dir?: string
  limit?: number
  offset?: number
}

export async function listSignals(opts?: SignalListOpts): Promise<{ signals: any[]; total: number }> {
  const qs = new URLSearchParams()
  const coin = Array.isArray(opts?.coin) ? opts?.coin.join(',') : opts?.coin
  const sid  = Array.isArray(opts?.strategy_id) ? opts?.strategy_id.join(',') : opts?.strategy_id
  if (coin)              qs.set('coin',        coin)
  if (sid)               qs.set('strategy_id', sid)
  if (opts?.outcome)    qs.set('outcome',    opts.outcome)
  if (opts?.close_from) qs.set('close_from', opts.close_from)
  if (opts?.close_to)   qs.set('close_to',   opts.close_to)
  if (opts?.sort_by)    qs.set('sort_by',    opts.sort_by)
  if (opts?.sort_dir)   qs.set('sort_dir',   opts.sort_dir)
  qs.set('limit',  String(opts?.limit  ?? 1000))
  qs.set('offset', String(opts?.offset ?? 0))
  return getJSON(`/signals/list?${qs}`, 1)
}

// Fetch ALL matching signals by paging through /signals/list (1000/page),
// fetching 5 pages in parallel per batch to keep large datasets fast.
export async function listAllSignals(
  opts: Omit<SignalListOpts, 'limit' | 'offset'>,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ signals: any[]; total: number }> {
  const first = await listSignals({ ...opts, limit: 1000, offset: 0 })
  const total = first.total
  const all: any[] = [...first.signals]
  onProgress?.(all.length, total)

  const PARALLEL = 5
  let offset = 1000
  while (offset < total) {
    const offsets: number[] = []
    for (let i = 0; i < PARALLEL && offset < total; i++, offset += 1000) offsets.push(offset)
    const pages = await Promise.all(offsets.map(o => listSignals({ ...opts, limit: 1000, offset: o })))
    pages.forEach(p => all.push(...p.signals))
    onProgress?.(all.length, total)
  }
  return { signals: all, total }
}

export async function getSignalStats(opts?: { close_from?: string; close_to?: string }): Promise<{ stats: any[] }> {
  const qs = new URLSearchParams()
  if (opts?.close_from) qs.set('close_from', opts.close_from)
  if (opts?.close_to)   qs.set('close_to',   opts.close_to)
  return getJSON(`/signals/stats?${qs}`, 1)
}

export async function listMethods(): Promise<{ methods: { id: string; label: string; type: string }[] }> {
  return getJSON('/signals/methods', 1)
}

export async function checkSignal(id: string): Promise<any> {
  const res = await fetch(`${BASE}/signals/check/${id}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Check failed: ${res.status}`)
  return res.json()
}

export async function clearSignals(opts?: SignalListOpts): Promise<void> {
  const qs = new URLSearchParams()
  const coin = Array.isArray(opts?.coin) ? opts?.coin.join(',') : opts?.coin
  const sid  = Array.isArray(opts?.strategy_id) ? opts?.strategy_id.join(',') : opts?.strategy_id
  if (coin)              qs.set('coin',        coin)
  if (sid)               qs.set('strategy_id', sid)
  if (opts?.outcome)    qs.set('outcome',    opts.outcome)
  if (opts?.close_from) qs.set('close_from', opts.close_from)
  if (opts?.close_to)   qs.set('close_to',   opts.close_to)
  const q = qs.toString()
  await fetch(`${BASE}/signals/clear${q ? `?${q}` : ''}`, { method: 'DELETE' })
}
