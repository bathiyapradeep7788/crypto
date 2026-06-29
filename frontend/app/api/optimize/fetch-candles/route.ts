// Fetch one page (≤1000) of 15m candles from Binance and upsert to Supabase.
// Called repeatedly by the frontend until nextSince === null.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const BINANCE = 'https://data-api.binance.vision'
const FIVE_MONTHS_MS = 5 * 30 * 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const coin = searchParams.get('coin')?.toUpperCase()
  const since = parseInt(searchParams.get('since') ?? '0') || 0

  if (!coin) {
    return NextResponse.json({ error: 'coin param required' }, { status: 400 })
  }

  const endTime   = Date.now()
  const startTime = endTime - FIVE_MONTHS_MS
  const fetchFrom = since || startTime

  if (fetchFrom >= endTime) {
    return NextResponse.json({ inserted: 0, nextSince: null, done: true })
  }

  // Fetch 1000 candles starting from fetchFrom
  let raw: any[][]
  try {
    const url = `${BINANCE}/api/v3/klines?symbol=${coin}&interval=15m&startTime=${fetchFrom}&limit=1000`
    const res = await fetch(url, { cache: 'no-store' })

    if (res.status === 429) {
      return NextResponse.json({ error: 'rate_limit', retryAfter: 60 }, { status: 429 })
    }
    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({ error: `Binance ${res.status}: ${txt}` }, { status: 502 })
    }
    raw = await res.json()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  if (!raw?.length) {
    return NextResponse.json({ inserted: 0, nextSince: null, done: true })
  }

  // Map Binance kline array → row objects
  // [openTime, open, high, low, close, volume, closeTime, ...]
  const rows = raw.map(k => ({
    coin,
    ts:     new Date(k[0]).toISOString(),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }))

  // Upsert batch (safe on duplicate coin+ts)
  const { error } = await supabase
    .from('historical_15m_data')
    .upsert(rows, { onConflict: 'coin,ts', ignoreDuplicates: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Next page starts after the last candle's open time
  const lastOpenTime = raw[raw.length - 1][0] as number
  const nextSince    = lastOpenTime + 1  // +1ms to avoid refetching last candle

  const done = nextSince >= endTime || raw.length < 1000

  return NextResponse.json({
    inserted:  rows.length,
    nextSince: done ? null : nextSince,
    done,
    progress:  Math.min(100, Math.round((nextSince - startTime) / FIVE_MONTHS_MS * 100)),
  })
}
