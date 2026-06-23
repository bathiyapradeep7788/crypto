import { BacktestConfig, JobStatus, TradeSessionConfig, TradingSession, CombinedStrategy, LogEntry, TradeResult } from '@/types'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Serverless cold starts (~13s on Vercel free tier) make the first request
// after idle return 503. Retry GETs with backoff long enough to outlast a cold
// start (≈15s) so it never surfaces as an error in the UI.
export async function getJSON<T>(path: string, retries = 6, delayMs = 2500): Promise<T> {
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
      if (i < retries) await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

// ── Backtest ──────────────────────────────────────────────────
// Runs synchronously on the backend and returns results in the response.
// Retries on cold-start 503; allows a long timeout for the computation.
export async function runBacktest(config: BacktestConfig, retries = 3): Promise<{ results: TradeResult[] }> {
  let lastErr: any
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 110000)
      const res = await fetch(`${BASE}/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        signal: ctrl.signal,
      })
      clearTimeout(t)
      if (res.status === 503 || res.status === 502 || res.status === 504) {
        throw new Error(`warming up (${res.status})`)
      }
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    } catch (e) {
      lastErr = e
      if (i < retries) await new Promise(r => setTimeout(r, 2500))
    }
  }
  throw lastErr
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
