/**
 * POST /api/optimize/run-master
 * Creates a backtest run record and spawns the simulation script locally.
 * On Vercel (no child_process), returns run_id + instructions.
 *
 * Body: { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", engine?: string }
 *
 * GET /api/optimize/run-master?runId=xxx
 * Returns current status of a run (for polling).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

export const runtime     = 'nodejs'
export const maxDuration = 30

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// ── POST: create run + spawn simulation ──────────────────────
export async function POST(req: NextRequest) {
  try {
    const body      = await req.json()
    const startDate = body.startDate as string
    const endDate   = body.endDate   as string
    const engine    = body.engine    ?? 'v2-regime-adaptive'

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 })
    }

    // Validate range (max 12 months)
    const start = new Date(startDate), end = new Date(endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 })
    if (end <= start)
      return NextResponse.json({ error: 'endDate must be after startDate' }, { status: 400 })
    if ((end.getTime() - start.getTime()) > 366 * 24 * 60 * 60 * 1000)
      return NextResponse.json({ error: 'Date range cannot exceed 366 days' }, { status: 400 })

    const runId = `run_${Date.now()}_${randomUUID().slice(0,8)}`

    // Create run record
    const { error: insertErr } = await supabase
      .from('backtest_runs')
      .insert({
        run_id:     runId,
        status:     'pending',
        start_date: startDate,
        end_date:   endDate,
        engine,
        config: { startDate, endDate, engine, coins: 20, cap: 5 },
      })

    if (insertErr) throw new Error(insertErr.message)
    console.log(`[run-master] Created run ${runId} (${startDate} → ${endDate})`)

    // Try to spawn locally (works on local dev server, fails gracefully on Vercel)
    let spawned = false
    try {
      const { spawn } = await import('child_process')
      const { join }  = await import('path')
      const scriptPath = join(process.cwd(), 'scripts', 'portfolio-simulation.mjs')
      const proc = spawn(
        'node',
        [scriptPath, '--runId', runId, '--start', startDate, '--end', endDate],
        { detached: true, stdio: 'ignore', shell: false }
      )
      proc.unref()
      spawned = true
      console.log(`[run-master] Spawned simulation PID=${proc.pid}`)

      // Mark as running
      await supabase
        .from('backtest_runs')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('run_id', runId)
    } catch {
      // On Vercel: no child_process — user must run script manually
      console.log(`[run-master] Could not spawn script (Vercel env). Run manually.`)
    }

    return NextResponse.json({
      ok:       true,
      runId,
      status:   spawned ? 'running' : 'pending',
      message:  spawned
        ? `Simulation started. Poll /api/optimize/run-master?runId=${runId} for progress.`
        : `Run created (ID: ${runId}). Execute: node frontend/scripts/portfolio-simulation.mjs --runId ${runId} --start ${startDate} --end ${endDate}`,
      command: `node frontend/scripts/portfolio-simulation.mjs --runId ${runId} --start ${startDate} --end ${endDate}`,
      spawned,
    })
  } catch (e: any) {
    console.error('[run-master] POST error:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

// ── GET: poll run status ──────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const runId = req.nextUrl.searchParams.get('runId')

    if (runId) {
      // Fetch specific run
      const { data, error } = await supabase
        .from('backtest_runs')
        .select('*')
        .eq('run_id', runId)
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 404 })
      return NextResponse.json({ run: data })
    }

    // Return latest 5 runs
    const { data, error } = await supabase
      .from('backtest_runs')
      .select('run_id,status,start_date,end_date,engine,progress_pct,cap_rejected,displaced,created_at,completed_at,error_message')
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) throw error
    return NextResponse.json({ runs: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
