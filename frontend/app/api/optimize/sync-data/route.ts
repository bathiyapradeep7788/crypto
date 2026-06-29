/**
 * /api/optimize/sync-data
 *
 * Resilient Binance 15m candle sync for one coin, one 5-day chunk at a time.
 * Designed for Vercel Pro (maxDuration=60s): each call fetches ≤480 candles
 * (5 days × 96 candles/day) and upserts to historical_15m_portfolio_data.
 *
 * Query params:
 *   coin      - e.g. BTCUSDT
 *   since     - epoch ms start (0 = beginning of 6-month window)
 *   reset     - "true" on first call to truncate the coin's rows
 *
 * Returns:
 *   { inserted, nextSince, done, progress, coin }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime    = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const BINANCE   = 'https://data-api.binance.vision'
const SIX_MONTHS = 6 * 30 * 24 * 60 * 60 * 1000   // ~180 days in ms
const CHUNK_MS   = 5 * 24 * 60 * 60 * 1000          // 5-day window per call
const LIMIT      = 480                                // 5d × 96 candles/15m

export async function GET(req: NextRequest) {
  const sp    = req.nextUrl.searchParams
  const coin  = sp.get('coin')?.toUpperCase()
  const since = parseInt(sp.get('since') ?? '0') || 0
  const reset = sp.get('reset') === 'true'

  if (!coin) return NextResponse.json({ error: 'coin required' }, { status: 400 })

  const endTime   = Date.now()
  const startTime = endTime - SIX_MONTHS
  const fetchFrom = since > 0 ? since : startTime

  // ── Step 0: Reset coin rows (first call only) ─────────────────
  if (reset) {
    const { error: delErr } = await supabase
      .from('historical_15m_portfolio_data')
      .delete()
      .eq('coin', coin)
    if (delErr) console.error(`[sync-data] reset ${coin}:`, delErr.message)
  }

  if (fetchFrom >= endTime) {
    return NextResponse.json({ inserted: 0, nextSince: null, done: true, progress: 100, coin })
  }

  // ── Step 1: Fetch one chunk from Binance mirror ───────────────
  const chunkEnd = Math.min(fetchFrom + CHUNK_MS, endTime)
  let raw: any[][]
  try {
    const url = `${BINANCE}/api/v3/klines?symbol=${coin}&interval=15m&startTime=${fetchFrom}&endTime=${chunkEnd}&limit=${LIMIT}`
    const res  = await fetch(url, { cache: 'no-store' })

    if (res.status === 429) {
      return NextResponse.json({ error: 'rate_limit', retryAfter: 60 }, { status: 429 })
    }
    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({ error: `Binance ${res.status}: ${txt.slice(0,200)}` }, { status: 502 })
    }
    raw = await res.json()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  if (!raw?.length) {
    // Gap in data — skip to next chunk
    const nextSince = chunkEnd + 1
    const done      = nextSince >= endTime
    const progress  = Math.min(99, Math.round((chunkEnd - startTime) / SIX_MONTHS * 100))
    return NextResponse.json({ inserted: 0, nextSince: done ? null : nextSince, done, progress, coin })
  }

  // ── Step 2: Map → upsert ──────────────────────────────────────
  const rows = raw.map(k => ({
    coin,
    ts:     new Date(k[0] as number).toISOString(),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }))

  const { error: upsertErr } = await supabase
    .from('historical_15m_portfolio_data')
    .upsert(rows, { onConflict: 'coin,ts', ignoreDuplicates: true })

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  // ── Step 3: Pagination state ──────────────────────────────────
  const lastTs    = raw[raw.length - 1][0] as number
  const nextSince = lastTs + 1
  const elapsed   = lastTs - startTime
  const progress  = Math.min(99, Math.round(elapsed / SIX_MONTHS * 100))
  const done      = nextSince >= endTime || raw.length < 10

  return NextResponse.json({
    inserted:  rows.length,
    nextSince: done ? null : nextSince,
    done,
    progress:  done ? 100 : progress,
    coin,
    cleared:   reset,
  })
}
