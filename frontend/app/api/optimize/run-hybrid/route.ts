/**
 * /api/optimize/run-hybrid
 *
 * Spawns the V3+V5 Hybrid simulation script as a detached background process.
 * Works when the Next.js server is running locally (dev or local prod build).
 * On Vercel (read-only filesystem), returns a 501 with instructions.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { join } from 'path'

export const runtime    = 'nodejs'
export const maxDuration = 10

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST() {
  // Count existing results so UI can show "running fresh vs stale"
  const { count } = await supabase
    .from('portfolio_optimization_results')
    .select('*', { count: 'exact', head: true })

  // Try to spawn locally — will fail gracefully on Vercel
  try {
    const { spawn } = await import('child_process')
    const scriptPath = join(process.cwd(), 'scripts', 'portfolio-simulation.mjs')
    const proc = spawn('node', [scriptPath], {
      detached: true,
      stdio:    'ignore',
      shell:    false,
    })
    proc.unref()
    return NextResponse.json({
      status:   'started',
      pid:      proc.pid,
      message:  'Hybrid simulation started. Results will appear in 3–5 minutes.',
      existing: count ?? 0,
    })
  } catch {
    // On Vercel: inform user to run locally
    return NextResponse.json({
      status:  'local_required',
      message: 'Run locally: node frontend/scripts/portfolio-simulation.mjs',
      existing: count ?? 0,
    }, { status: 200 })
  }
}

export async function GET() {
  const { data, error } = await supabase
    .from('portfolio_optimization_results')
    .select('coin, total_pnl_pct, selected_regime, updated_at')
    .order('total_pnl_pct', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const isHybrid = data?.[0]?.selected_regime === 'hybrid_v3v5'
  return NextResponse.json({
    status:   data?.length ? (isHybrid ? 'hybrid_complete' : 'stale') : 'empty',
    count:    data?.length ?? 0,
    isHybrid,
    updatedAt: data?.[0]?.updated_at ?? null,
    coins:    data?.map(r => ({ coin: r.coin, pnl: r.total_pnl_pct })) ?? [],
  })
}
