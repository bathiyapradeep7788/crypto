/**
 * fetch-data.mjs — Resilient Binance → Supabase candle fetcher
 *
 * Fetches 6 months of 15m candle data for 20 coins directly from
 * Binance's geo-unblocked mirror and bulk-upserts into Supabase.
 *
 * Vercel-safe design:
 *   - 5-day chunks (480 candles per request) — same as /api/optimize/sync-data
 *   - Controlled concurrency: 3 coins in parallel, sequential chunks per coin
 *   - 500ms backoff between Binance calls to avoid 429 rate-limits
 *   - Idempotent upserts (coin+ts unique constraint) — safe to re-run
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync }  from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir  = dirname(fileURLToPath(import.meta.url))
const envRaw = readFileSync(join(__dir, '../../.env'), 'utf8')
const env    = Object.fromEntries(
  envRaw.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()] })
)

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const BINANCE    = 'https://data-api.binance.vision'
const SIX_MONTHS = 180 * 24 * 60 * 60 * 1000
const CHUNK_MS   = 5   * 24 * 60 * 60 * 1000   // 5-day window
const LIMIT      = 480                            // 5d × 96 candles/day
const CONCURRENCY = 3                             // parallel coins
const RATE_DELAY  = 500                           // ms between Binance calls

const COINS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','DOGEUSDT',
  'UNIUSDT','LTCUSDT','APTUSDT','SUIUSDT','NEARUSDT',
  'OPUSDT','ARBUSDT','INJUSDT','TIAUSDT','SHIBUSDT',
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchCoin(coin, startTime, endTime) {
  let fetched = 0, chunks = 0, errors = 0
  let from = startTime

  while (from < endTime) {
    const to  = Math.min(from + CHUNK_MS, endTime)
    const url = `${BINANCE}/api/v3/klines?symbol=${coin}&interval=15m` +
                `&startTime=${from}&endTime=${to}&limit=${LIMIT}`

    let raw
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.status === 429) {
        process.stdout.write(' [429-backoff]')
        await sleep(5000)
        continue
      }
      if (!res.ok) {
        process.stdout.write(` [${res.status}]`)
        errors++
        from = to + 1
        await sleep(RATE_DELAY)
        continue
      }
      raw = await res.json()
    } catch (e) {
      process.stdout.write(` [ERR:${e.message.slice(0,20)}]`)
      errors++
      from = to + 1
      await sleep(RATE_DELAY)
      continue
    }

    if (!raw?.length) { from = to + 1; await sleep(RATE_DELAY); continue }

    const rows = raw.map(k => ({
      coin,
      ts:     new Date(Number(k[0])).toISOString(),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))

    const { error } = await supabase
      .from('historical_15m_portfolio_data')
      .upsert(rows, { onConflict: 'coin,ts', ignoreDuplicates: true })

    if (error) {
      process.stdout.write(` [DB:${error.message.slice(0,30)}]`)
      errors++
    } else {
      fetched += rows.length
      chunks++
    }

    from = Number(raw[raw.length-1][0]) + 1
    await sleep(RATE_DELAY)
  }

  return { fetched, chunks, errors }
}

async function main() {
  const args = process.argv.slice(2)
  const argMap = {}
  for (let i = 0; i < args.length; i += 2) argMap[args[i]] = args[i+1]

  const endTime   = argMap['--end']   ? new Date(argMap['--end']).getTime()   : Date.now()
  const startTime = argMap['--start'] ? new Date(argMap['--start']).getTime() : endTime - SIX_MONTHS

  console.log('\n╔═══════════════════════════════════════════════════════╗')
  console.log('║  RESILIENT DATA FETCHER — Binance → Supabase          ║')
  console.log('║  6 months · 15m candles · 20 coins · 5-day chunks     ║')
  console.log('╚═══════════════════════════════════════════════════════╝\n')

  const start     = new Date(startTime).toISOString().slice(0,10)
  const end       = new Date(endTime).toISOString().slice(0,10)
  const totalChunks = Math.ceil(SIX_MONTHS / CHUNK_MS) * COINS.length
  console.log(`  Window  : ${start} → ${end}`)
  console.log(`  Coins   : ${COINS.length}`)
  console.log(`  Chunks  : ~${totalChunks} requests @ ${RATE_DELAY}ms backoff`)
  console.log(`  Concurrency: ${CONCURRENCY} coins in parallel\n`)

  let totalFetched = 0, totalErrors = 0
  const t0 = Date.now()

  // Process coins in batches of CONCURRENCY
  for (let i = 0; i < COINS.length; i += CONCURRENCY) {
    const batch = COINS.slice(i, i + CONCURRENCY)
    process.stdout.write(`\n  [${String(i+1).padStart(2)}-${Math.min(i+CONCURRENCY,COINS.length).toString().padStart(2)}/${COINS.length}] `)
    process.stdout.write(batch.map(c => c.replace('USDT','')).join(', ') + ' ...')

    const results = await Promise.all(batch.map(coin => fetchCoin(coin, startTime, endTime)))

    for (let j = 0; j < batch.length; j++) {
      const { fetched, chunks, errors } = results[j]
      totalFetched += fetched
      totalErrors  += errors
      process.stdout.write(`\n    ${batch[j].padEnd(12)} → ${String(fetched).padStart(6)} candles in ${chunks} chunks${errors ? ` (${errors} errors)` : ''}`)
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n\n  ✅ Done in ${elapsed}s — ${totalFetched.toLocaleString()} candles inserted, ${totalErrors} errors`)

  // Verify counts per coin
  console.log('\n  Verifying Supabase row counts...')
  const { data } = await supabase
    .from('historical_15m_portfolio_data')
    .select('coin', { count: 'exact' })
    .order('coin')
    // count per coin via group requires raw sql; just check total
  const { count } = await supabase
    .from('historical_15m_portfolio_data')
    .select('*', { count: 'exact', head: true })
  console.log(`  Total rows in DB: ${count?.toLocaleString()}\n`)
}

main().catch(console.error)
