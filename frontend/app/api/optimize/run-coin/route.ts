// Pull stored candles from Supabase, run concurrent signal engine, save best result.
// New engine: no position locking — every signal at every timestamp is captured
// independently, TP/SL resolved by candle direction (not SL-first).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAllStrategies, pickBest, type Candle } from '@/lib/strategies'

export const runtime    = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(req: NextRequest) {
  const coin = req.nextUrl.searchParams.get('coin')?.toUpperCase()
  if (!coin) return NextResponse.json({ error: 'coin required' }, { status: 400 })

  // ── Load all stored 15m candles for this coin ─────────────────
  // Supabase PostgREST default max_rows is 1000. We use range pagination
  // to retrieve the full dataset (up to 15 000 rows).
  const allRows: any[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('historical_15m_data')
      .select('ts,open,high,low,close,volume')
      .eq('coin', coin)
      .order('ts', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  if (allRows.length < 100) {
    return NextResponse.json(
      { error: `Insufficient data for ${coin}: ${allRows.length} candles` },
      { status: 422 }
    )
  }

  const candles: Candle[] = allRows.map(r => ({
    ts:     r.ts,
    open:   Number(r.open),
    high:   Number(r.high),
    low:    Number(r.low),
    close:  Number(r.close),
    volume: Number(r.volume),
  }))

  // ── Run all 10 strategies concurrently (no position locking) ──
  const allResults  = runAllStrategies(candles)
  const best        = pickBest(allResults)

  if (!best) {
    return NextResponse.json({ coin, error: 'No valid strategy found', all_strategies: allResults })
  }

  // ── Upsert best result to Supabase ────────────────────────────
  const { error: upsertErr } = await supabase
    .from('best_strategy_results')
    .upsert({
      coin,
      best_strategy_name:      best.name,
      win_rate_percentage:     parseFloat(best.win_rate.toFixed(2)),
      total_pnl_percentage:    parseFloat(best.total_pnl_pct.toFixed(2)),
      max_drawdown_percentage: parseFloat(best.max_drawdown_pct.toFixed(2)),
      total_trades:            best.total_trades,
      tp_pct:                  best.tp_pct,
      tp2_pct:                 best.tp2_pct,
      sl_pct:                  best.sl_pct,
      updated_at:              new Date().toISOString(),
    }, { onConflict: 'coin' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({
    coin,
    candles_used: candles.length,
    best: {
      strategy:  best.name,
      label:     best.label,
      win_rate:  best.win_rate,
      total_pnl: best.total_pnl_pct,
      max_dd:    best.max_drawdown_pct,
      trades:    best.total_trades,
      tp_pct:    best.tp_pct,
      tp2_pct:   best.tp2_pct,
      sl_pct:    best.sl_pct,
    },
    // Full breakdown — all 10 strategies, all concurrent signals captured
    all_strategies: allResults.map(r => ({
      name:      r.name,
      label:     r.label,
      win_rate:  parseFloat(r.win_rate.toFixed(1)),
      total_pnl: parseFloat(r.total_pnl_pct.toFixed(2)),
      max_dd:    parseFloat(r.max_drawdown_pct.toFixed(1)),
      trades:    r.total_trades,
      tp_pct:    r.tp_pct,
      tp2_pct:   r.tp2_pct,
      sl_pct:    r.sl_pct,
    })),
  })
}
