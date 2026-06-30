/**
 * POST /api/optimize/reset
 * Hard-resets both candle and results tables.
 * Called by the System Admin "HARD RESET" button.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime     = 'nodejs'
export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const scope = body.scope ?? 'results'   // 'results' | 'all'

  try {
    const ops: Array<{ table: string; error: string | null }> = []

    if (scope === 'all') {
      const { error } = await supabase
        .from('historical_15m_portfolio_data')
        .delete()
        .gte('id', 0)  // delete all rows (RLS-safe alternative to TRUNCATE)
      ops.push({ table: 'historical_15m_portfolio_data', error: error?.message ?? null })
    }

    const { error: r1 } = await supabase
      .from('portfolio_optimization_results')
      .delete()
      .neq('run_id', '__keep__')
    ops.push({ table: 'portfolio_optimization_results', error: r1?.message ?? null })

    const { error: r2 } = await supabase
      .from('backtest_runs')
      .delete()
      .neq('run_id', '__keep__')   // delete all
    ops.push({ table: 'backtest_runs', error: r2?.message ?? null })

    const errors = ops.filter(o => o.error)
    if (errors.length) {
      return NextResponse.json({ ok: false, errors }, { status: 500 })
    }

    console.log(`[reset] scope=${scope} — tables cleared`)
    return NextResponse.json({ ok: true, scope, cleared: ops.map(o => o.table) })
  } catch (e: any) {
    console.error('[reset] error:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
