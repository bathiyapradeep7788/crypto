// Pull stored candles from Supabase, run all 10 strategies, save best result.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAllStrategies, pickBest, type Candle } from '@/lib/strategies'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(req: NextRequest) {
  const coin = req.nextUrl.searchParams.get('coin')?.toUpperCase()
  if (!coin) return NextResponse.json({ error: 'coin required' }, { status: 400 })

  // Fetch all stored candles for this coin (up to 15000 rows)
  const { data, error } = await supabase
    .from('historical_15m_data')
    .select('ts,open,high,low,close,volume')
    .eq('coin', coin)
    .order('ts', { ascending: true })
    .limit(15000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length < 100) {
    return NextResponse.json({ error: `Insufficient data for ${coin}: ${data?.length ?? 0} candles` }, { status: 422 })
  }

  const candles: Candle[] = data.map(r => ({
    ts:     r.ts,
    open:   Number(r.open),
    high:   Number(r.high),
    low:    Number(r.low),
    close:  Number(r.close),
    volume: Number(r.volume),
  }))

  // Run all 10 strategies
  const results = runAllStrategies(candles)
  const best    = pickBest(results)

  if (!best) {
    return NextResponse.json({ coin, error: 'No valid strategy found', results })
  }

  // Upsert best result to Supabase
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
      strategy:    best.name,
      label:       best.label,
      win_rate:    best.win_rate,
      total_pnl:   best.total_pnl_pct,
      max_dd:      best.max_drawdown_pct,
      trades:      best.total_trades,
      tp_pct:      best.tp_pct,
      tp2_pct:     best.tp2_pct,
      sl_pct:      best.sl_pct,
    },
    all_strategies: results.map(r => ({
      name:      r.name,
      label:     r.label,
      win_rate:  r.win_rate,
      total_pnl: r.total_pnl_pct,
      max_dd:    r.max_drawdown_pct,
      trades:    r.total_trades,
    })),
  })
}
