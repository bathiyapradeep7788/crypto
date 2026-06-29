// Fetch one page (≤1000) of 15m candles from Binance and upsert to Supabase.
// Pass `reset=true` on the very first call to wipe both tables before fetching.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const BINANCE       = 'https://data-api.binance.vision'
const FIVE_MONTHS   = 5 * 30 * 24 * 60 * 60 * 1000   // ~150 days in ms

export async function GET(req: NextRequest) {
  const sp    = req.nextUrl.searchParams
  const coin  = sp.get('coin')?.toUpperCase()
  const since = parseInt(sp.get('since') ?? '0') || 0
  const reset = sp.get('reset') === 'true'

  if (!coin) {
    return NextResponse.json({ error: 'coin param required' }, { status: 400 })
  }

  // ── Step 0: Reset DB (only on first call, reset=true) ────────
  if (reset) {
    try {
      // Delete in correct order (best_strategy_results has no FK but clear both)
      const { error: e1 } = await supabase
        .from('best_strategy_results')
        .delete()
        .neq('coin', '__never__')   // delete all rows

      const { error: e2 } = await supabase
        .from('historical_15m_data')
        .delete()
        .neq('coin', '__never__')   // delete all rows

      if (e1) console.error('[reset] best_strategy_results:', e1.message)
      if (e2) console.error('[reset] historical_15m_data:',   e2.message)
    } catch (err: any) {
      // Non-fatal: log and continue with fetch
      console.error('[reset] DB clear failed:', err.message)
    }
  }

  // ── Step 1: Determine time window ─────────────────────────────
  const endTime   = Date.now()
  const startTime = endTime - FIVE_MONTHS
  const fetchFrom = since > 0 ? since : startTime

  if (fetchFrom >= endTime) {
    return NextResponse.json({ inserted: 0, nextSince: null, done: true, progress: 100 })
  }

  // ── Step 2: Pull one page from Binance ────────────────────────
  let raw: any[][]
  try {
    const url = `${BINANCE}/api/v3/klines?symbol=${coin}&interval=15m&startTime=${fetchFrom}&limit=1000`
    const res = await fetch(url, { cache: 'no-store' })

    if (res.status === 429) {
      return NextResponse.json(
        { error: 'rate_limit', retryAfter: 60 },
        { status: 429 }
      )
    }
    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json(
        { error: `Binance ${res.status}: ${txt.slice(0, 200)}` },
        { status: 502 }
      )
    }
    raw = await res.json()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  if (!raw?.length) {
    return NextResponse.json({ inserted: 0, nextSince: null, done: true, progress: 100 })
  }

  // ── Step 3: Map Binance kline → row ───────────────────────────
  // Format: [openTime, open, high, low, close, volume, closeTime, ...]
  const rows = raw.map(k => ({
    coin,
    ts:     new Date(k[0] as number).toISOString(),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }))

  // ── Step 4: Upsert to Supabase ────────────────────────────────
  const { error: upsertErr } = await supabase
    .from('historical_15m_data')
    .upsert(rows, { onConflict: 'coin,ts', ignoreDuplicates: true })

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  // ── Step 5: Compute pagination state ──────────────────────────
  const lastOpenTime = raw[raw.length - 1][0] as number
  const nextSince    = lastOpenTime + 1           // +1 ms avoids re-fetching last candle
  const elapsed      = lastOpenTime - startTime
  const progress     = Math.min(99, Math.round((elapsed / FIVE_MONTHS) * 100))
  const done         = nextSince >= endTime || raw.length < 1000

  return NextResponse.json({
    inserted:  rows.length,
    nextSince: done ? null : nextSince,
    done,
    progress:  done ? 100 : progress,
    cleared:   reset,
  })
}
