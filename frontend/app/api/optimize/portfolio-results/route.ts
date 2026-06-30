import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime     = 'nodejs'
export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('portfolio_optimization_results')
      .select('*')
      .order('total_pnl_pct', { ascending: false })

    if (error) throw error

    const results = data ?? []

    // Aggregate summary for dashboard header cards
    const withTrades = results.filter(r => r.total_trades > 0)
    const summary = {
      combinedPnl:  +results.reduce((s,r) => s + r.total_pnl_pct,    0).toFixed(2),
      avgWinRate:   withTrades.length
        ? +(withTrades.reduce((s,r) => s + r.win_rate_pct,    0) / withTrades.length).toFixed(1)
        : 0,
      avgMaxDD:     withTrades.length
        ? +(withTrades.reduce((s,r) => s + r.max_drawdown_pct, 0) / withTrades.length).toFixed(1)
        : 0,
      totalTrades:  results.reduce((s,r) => s + r.total_trades,        0),
      totalRejected:results.reduce((s,r) => s + r.cap_rejected_trades,  0),
      profitableCoins: results.filter(r => r.total_pnl_pct > 0).length,
      engine:       results[0]?.selected_regime ?? 'unknown',
      updatedAt:    results[0]?.updated_at ?? null,
    }

    return NextResponse.json({ results, summary })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
