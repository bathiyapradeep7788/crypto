/**
 * Local Binance candle fetcher — writes directly to Supabase.
 * Bypasses Vercel entirely: no timeout, no gateway, no rate-limit cascade.
 *
 * Fetches 6 months of 15m OHLCV for all 20 coins into
 * historical_15m_portfolio_data (already truncated / clean).
 *
 * Rate limiting: 300ms between each page request.
 * Batch upsert: 500 rows per Supabase call.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
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
const SIX_MONTHS = 6 * 30 * 24 * 60 * 60 * 1000
const LIMIT      = 500    // candles per Binance request
const DELAY_MS   = 300    // ms between requests
const BATCH_SIZE = 500    // rows per Supabase upsert

const COINS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','DOGEUSDT',
  'UNIUSDT','LTCUSDT','APTUSDT','SUIUSDT','NEARUSDT',
  'OPUSDT','ARBUSDT','INJUSDT','TIAUSDT','SHIBUSDT',
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchCoin(coin, startTime, endTime) {
  let from = startTime, total = 0, page = 0

  while (from < endTime) {
    const url = `${BINANCE}/api/v3/klines?symbol=${coin}&interval=15m&startTime=${from}&limit=${LIMIT}`
    let raw

    // Retry loop for transient errors
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (res.status === 429) {
          process.stdout.write(` [rate-limit 65s]`)
          await sleep(65000)
          continue
        }
        if (!res.ok) {
          process.stdout.write(` [${res.status}]`)
          break
        }
        raw = await res.json()
        break
      } catch (e) {
        process.stdout.write(` [err:${e.message.slice(0,20)}]`)
        await sleep(2000)
      }
    }

    if (!raw?.length) break

    // Map Binance kline format → row
    const rows = raw.map(k => ({
      coin,
      ts:     new Date(k[0]).toISOString(),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))

    // Upsert in batches to avoid Supabase payload limits
    for (let b = 0; b < rows.length; b += BATCH_SIZE) {
      const batch = rows.slice(b, b + BATCH_SIZE)
      const { error } = await supabase
        .from('historical_15m_portfolio_data')
        .upsert(batch, { onConflict: 'coin,ts', ignoreDuplicates: true })
      if (error) process.stdout.write(` [upsert-err:${error.message.slice(0,30)}]`)
    }

    total += rows.length
    page++

    const lastTs = raw[raw.length - 1][0]
    const pct    = Math.min(99, Math.round((lastTs - startTime) / SIX_MONTHS * 100))
    process.stdout.write(` ${pct}%`)

    if (raw.length < LIMIT || lastTs >= endTime) break
    from = lastTs + 1
    await sleep(DELAY_MS)
  }

  return total
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  LOCAL BINANCE FETCHER — 6-Month 15m Data → Supabase        ║')
  console.log(`║  Coins: ${COINS.length} | Rate-limit safe | Batched upserts            ║`)
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  const endTime   = Date.now()
  const startTime = endTime - SIX_MONTHS
  const dateFrom  = new Date(startTime).toISOString().slice(0,10)
  const dateTo    = new Date(endTime).toISOString().slice(0,10)
  console.log(`▸ Window: ${dateFrom} → ${dateTo}\n`)

  let grandTotal = 0
  const failed   = []

  for (let ci = 0; ci < COINS.length; ci++) {
    const coin = COINS[ci]
    process.stdout.write(`  [${String(ci+1).padStart(2)}/${COINS.length}] ${coin.padEnd(10)}`)
    try {
      const n = await fetchCoin(coin, startTime, endTime)
      grandTotal += n
      process.stdout.write(`  ✓ ${n.toLocaleString()} rows\n`)
    } catch (e) {
      process.stdout.write(`  ✗ ${e.message}\n`)
      failed.push(coin)
    }
  }

  console.log(`\n✅ Done. Total rows inserted: ${grandTotal.toLocaleString()}`)
  if (failed.length) console.log(`⚠  Failed: ${failed.join(', ')}`)

  // Verify counts per coin
  console.log('\n▸ Verifying row counts in Supabase...')
  const { data: counts } = await supabase.rpc('', {}).then(() => ({ data: null })).catch(() => ({ data: null }))
  // Manual count
  for (const coin of COINS) {
    const { count } = await supabase
      .from('historical_15m_portfolio_data')
      .select('*', { count: 'exact', head: true })
      .eq('coin', coin)
    process.stdout.write(`  ${coin.padEnd(10)} ${String(count ?? '?').padStart(6)} rows\n`)
  }
}

main().catch(console.error)
