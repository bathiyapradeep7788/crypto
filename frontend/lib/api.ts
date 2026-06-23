import { BacktestConfig, JobStatus, TradeSessionConfig, TradingSession, CombinedStrategy } from '@/types'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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
  const res = await fetch(`${BASE}/backtest/status/${jobId}`)
  if (!res.ok) throw new Error(`Status error: ${res.status}`)
  return res.json()
}

export function getLogStreamUrl(): string {
  return `${BASE}/logs/stream`
}

// ── Combined Strategies ───────────────────────────────────────
export async function listCombined(): Promise<CombinedStrategy[]> {
  const res = await fetch(`${BASE}/strategies/combined`)
  if (!res.ok) return []
  return res.json()
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
  const res = await fetch(`${BASE}/paper-trade/sessions`)
  if (!res.ok) return []
  return res.json()
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
  const res = await fetch(`${BASE}/live-trade/sessions`)
  if (!res.ok) return []
  return res.json()
}
