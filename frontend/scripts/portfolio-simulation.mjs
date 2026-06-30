/**
 * V5 PRECISION ALPHA ENGINE
 *
 * RULES (strict):
 *   1. Strategy: Bollinger Squeeze + ADX > 25 for ALL 20 coins
 *   2. Alpha Displacement: Cap=5, new signal evicts worst if alpha > worst live score
 *      Alpha Score = ADX Intensity (50pts) + Volume Expansion (50pts)
 *   3. Trailing SL → Breakeven at 50% of TP distance
 *   4. Portfolio Cool-off: if total portfolio DD hits 5% from equity peak,
 *      freeze all new entries for 96 candles (24 hours of 15m bars)
 *   5. TP=2.0% / SL=1.2% (trending regime justified wider TP)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const envRaw = readFileSync(join(__dir, '../../.env'), 'utf8')
const env = Object.fromEntries(
  envRaw.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()] })
)
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// ── ALL 20 COINS — single unified strategy ────────────────────
const COINS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','DOGEUSDT',
  'UNIUSDT','LTCUSDT','APTUSDT','SUIUSDT','NEARUSDT',
  'OPUSDT','ARBUSDT','INJUSDT','TIAUSDT','SHIBUSDT',
]

// ── ENGINE CONSTANTS ─────────────────────────────────────────
const PORT_CAP              = 5
const MAX_HOLD              = 32          // candles max hold (~8h)
const TP_PCT                = 2.0
const SL_PCT                = 1.2
const ADX_THRESHOLD         = 25         // regime gate
const COOLOFF_CANDLES       = 96         // 24h × 4 candles/h
const PORTFOLIO_DD_TRIGGER  = 5.0        // % portfolio DD before cooloff

// ═══════════════════════════════════════════════════════════════
//  INDICATORS
// ═══════════════════════════════════════════════════════════════
function ema(arr, p) {
  const k = 2/(p+1), out = new Array(arr.length).fill(0)
  let s = 0
  for (let i = 0; i < p; i++) s += arr[i]
  out[p-1] = s / p
  for (let i = p; i < arr.length; i++) out[i] = arr[i]*k + out[i-1]*(1-k)
  return out
}
function sma(arr, p) {
  return arr.map((_, i) => {
    if (i < p-1) return 0
    let s = 0
    for (let j = i-p+1; j <= i; j++) s += arr[j]
    return s / p
  })
}
function bollingerBands(closes, p=20, mult=2) {
  const up=[], lo=[], bw=[]
  for (let i = 0; i < closes.length; i++) {
    if (i < p-1) { up.push(0); lo.push(0); bw.push(999); continue }
    const sl  = closes.slice(i-p+1, i+1)
    const avg = sl.reduce((a,b) => a+b) / p
    const std = Math.sqrt(sl.reduce((s,v) => s+(v-avg)**2, 0) / p)
    up.push(avg + mult*std)
    lo.push(avg - mult*std)
    bw.push(avg > 0 ? (mult*2*std) / avg * 100 : 0)
  }
  return { up, lo, bw }
}
function atrSeries(candles, p=14) {
  const out = new Array(candles.length).fill(0)
  let smooth = 0, sum = 0
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i-1].close),
      Math.abs(candles[i].low  - candles[i-1].close)
    )
    if      (i < p)  sum += tr
    else if (i === p) { smooth = (sum+tr)/p; out[i] = smooth }
    else              { smooth = (smooth*(p-1)+tr)/p; out[i] = smooth }
  }
  return out
}
function adxSeries(candles, p=14) {
  const n = candles.length, out = new Array(n).fill(0)
  if (n < p*3) return out
  const tr=[], pdm=[], mdm=[]
  for (let i = 1; i < n; i++) {
    const h=candles[i].high, l=candles[i].low, pc=candles[i-1].close
    tr.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)))
    const up=h-candles[i-1].high, dn=candles[i-1].low-l
    pdm.push(up>dn&&up>0?up:0)
    mdm.push(dn>up&&dn>0?dn:0)
  }
  const ws = arr => {
    const o = new Array(arr.length).fill(0)
    let s = arr.slice(0,p).reduce((a,b)=>a+b,0); o[p-1] = s
    for (let i = p; i < arr.length; i++) o[i] = o[i-1] - o[i-1]/p + arr[i]
    return o
  }
  const sTR=ws(tr), sPDM=ws(pdm), sMDM=ws(mdm)
  const diP = sTR.map((t,i) => t>0 ? sPDM[i]/t*100 : 0)
  const diM = sTR.map((t,i) => t>0 ? sMDM[i]/t*100 : 0)
  const dx  = diP.map((v,i) => { const s=v+diM[i]; return s>0?Math.abs(v-diM[i])/s*100:0 })
  let av = dx.slice(p-1, 2*p-1).reduce((a,b)=>a+b,0)/p; out[2*p] = av
  for (let i = 2*p+1; i < n; i++) { av = (av*(p-1)+dx[i-1])/p; out[i] = av }
  return out
}

function precompute(candles) {
  const closes = candles.map(c => c.close)
  const vols   = candles.map(c => c.volume)
  const bb     = bollingerBands(closes)
  return {
    closes,
    bbLo:     bb.lo,
    bbBW:     bb.bw,
    volSma20: sma(vols, 20),
    atr14:    atrSeries(candles),
    adx:      adxSeries(candles),
    vols,
  }
}

// ── BOLLINGER SQUEEZE SIGNAL ──────────────────────────────────
// Fires when:
//   1. BTC ADX > 25  (trending regime)
//   2. Bandwidth is at 20th-percentile squeeze (lowest volatility)
//   3. Price was touching lower band last candle, now closes above it
function sigBollinger(candles, i, p, adxVal) {
  if (adxVal <= ADX_THRESHOLD) return false
  if (i < 22) return false
  const bwSlice = p.bbBW.slice(Math.max(0, i-50), i).filter(v => v < 999)
  if (!bwSlice.length) return false
  const squeeze20 = [...bwSlice].sort((a,b) => a-b)[Math.floor(bwSlice.length*0.2)] ?? 0
  return (
    p.bbBW[i-1]   <= squeeze20          &&  // bandwidth in squeeze
    candles[i-1].close <= p.bbLo[i-1]  &&  // last close was below/at lower band
    candles[i].close   >  p.bbLo[i]        // this close broke above lower band
  )
}

// ── ALPHA SCORE: ADX Intensity (50) + Volume Expansion (50) ──
function alphaScore(candles, i, p, adxVal) {
  const adxPts   = Math.min(adxVal / 50, 1) * 50
  const volRatio = candles[i].volume / (p.volSma20[i] || 1)
  const volPts   = Math.min(volRatio / 3, 1) * 50
  return +(adxPts + volPts).toFixed(2)
}

// Live score for displacement: entryAlpha + unrealised PnL%
function liveScore(pos, curClose) {
  return pos.entryAlpha + (curClose - pos.entryPrice) / pos.entryPrice * 100
}

// ── LOAD CANDLES ─────────────────────────────────────────────
async function loadCandles(coin) {
  const rows = []; const PAGE = 1000; let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('historical_15m_portfolio_data')
      .select('ts,open,high,low,close,volume')
      .eq('coin', coin)
      .order('ts', { ascending: true })
      .range(from, from+PAGE-1)
    if (error || !data || !data.length) break
    rows.push(...data.map(r => ({
      ts:r.ts, open:+r.open, high:+r.high, low:+r.low, close:+r.close, volume:+r.volume
    })))
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗')
  console.log('║  V5 PRECISION ALPHA ENGINE                                       ║')
  console.log('║  Strategy : Bollinger Squeeze (ADX > 25) — ALL 20 COINS         ║')
  console.log('║  Risk     : Trailing SL + Portfolio 5% DD Cool-off (24h)         ║')
  console.log('║  Capital  : Alpha Displacement Cap=5 (ADX + Volume score)        ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝\n')

  // ── Load & precompute ────────────────────────────────────
  console.log('▸ Loading candle data from Supabase...')
  const coinData = {}, coinIdx = {}
  for (const coin of COINS) {
    process.stdout.write(`  ${coin}...`)
    const candles = await loadCandles(coin)
    coinData[coin] = candles
    coinIdx[coin]  = new Map(candles.map((c,i) => [c.ts, i]))
    process.stdout.write(` ${candles.length}\n`)
  }

  console.log('\n▸ Precomputing indicators...')
  const cache = {}
  for (const coin of COINS) { cache[coin] = precompute(coinData[coin]); process.stdout.write('.') }
  console.log(' done\n')

  const btcCandles = coinData['BTCUSDT']
  const btcADX     = cache['BTCUSDT'].adx
  const N          = btcCandles.length

  console.log(`▸ Simulation: ${N} timestamps × ${COINS.length} coins`)
  console.log(`  Bollinger+ADX>25 · Cap=5 · TrailingSL · Portfolio 5% DD Cool-off\n`)

  // ── Accumulators ─────────────────────────────────────────
  const trades    = {}  // coin → pnl[]
  const displaced = {}  // coin → count
  const capRej    = {}  // coin → count
  for (const c of COINS) { trades[c]=[]; displaced[c]=0; capRej[c]=0 }

  const openPos = []

  // Portfolio equity tracking for cool-off
  let portfolioCumPnl = 0
  let portfolioPeak   = 0
  let cooloffUntil    = -1   // gi index until which no new entries
  let cooloffEvents   = 0

  const printEvery = Math.floor(N / 10)
  let trendBars = 0

  // ── MAIN LOOP ────────────────────────────────────────────
  for (let gi = 60; gi < N - MAX_HOLD - 2; gi++) {
    if (gi % printEvery === 0) process.stdout.write(`  ${Math.round(gi/N*100)}%`)

    const btcTs  = btcCandles[gi].ts
    const adxVal = btcADX[gi]
    if (adxVal > ADX_THRESHOLD) trendBars++

    // ── Step 1: Update & close open positions ─────────────
    for (const pos of openPos) {
      if (pos.closed) continue
      const ci = coinIdx[pos.coin].get(btcTs)
      if (ci === undefined) continue
      const c = coinData[pos.coin][ci]

      // Trailing SL: move to breakeven at 50% of TP distance
      const beTrig = pos.entryPrice * (1 + TP_PCT * 0.5 / 100)
      if (!pos.beActivated && c.high >= beTrig) {
        pos.beActivated = true
        pos.slPrice     = pos.entryPrice
      }

      const hitTP = c.high >= pos.tpPrice
      const hitSL = c.low  <= pos.slPrice
      let   result = null

      if      (hitTP && hitSL) result = c.close >= c.open ? TP_PCT : (pos.beActivated ? 0 : -SL_PCT)
      else if (hitTP)          result = TP_PCT
      else if (hitSL)          result = pos.beActivated ? 0 : -SL_PCT
      else if (gi >= pos.openGi + MAX_HOLD) {
        const ex = Math.min(ci, coinData[pos.coin].length-1)
        result = (coinData[pos.coin][ex].close - pos.entryPrice) / pos.entryPrice * 100
      }

      if (result !== null) {
        pos.closed = true
        trades[pos.coin].push(result)
        portfolioCumPnl += result
        if (portfolioCumPnl > portfolioPeak) portfolioPeak = portfolioCumPnl

        // Check portfolio DD → trigger cool-off
        const portDD = portfolioPeak - portfolioCumPnl
        if (portDD >= PORTFOLIO_DD_TRIGGER && gi > cooloffUntil) {
          cooloffUntil = gi + COOLOFF_CANDLES
          cooloffEvents++
        }
      }
    }
    openPos.splice(0, openPos.length, ...openPos.filter(p => !p.closed))

    // ── Step 2: Collect signals (cool-off gate) ───────────
    if (gi <= cooloffUntil) continue  // 24h freeze active

    const sigs = []
    for (const coin of COINS) {
      const ci = coinIdx[coin].get(btcTs)
      if (ci === undefined || ci < 60) continue
      if (openPos.some(p => p.coin === coin)) continue

      const candles = coinData[coin], p = cache[coin]
      if (!sigBollinger(candles, ci, p, adxVal)) continue

      const alpha = alphaScore(candles, ci, p, adxVal)
      sigs.push({ coin, alpha, ci })
    }

    sigs.sort((a,b) => b.alpha - a.alpha)

    // ── Step 3: Alpha Displacement ────────────────────────
    for (const sig of sigs) {
      const entry = coinData[sig.coin][sig.ci].close

      if (openPos.length < PORT_CAP) {
        openPos.push({
          coin:        sig.coin,
          openGi:      gi,
          entryPrice:  entry,
          entryAlpha:  sig.alpha,
          tpPrice:     entry * (1 + TP_PCT / 100),
          slPrice:     entry * (1 - SL_PCT / 100),
          beActivated: false,
          closed:      false,
        })
      } else {
        // Score all live positions
        const scored = openPos.map(pos => {
          const ci2 = coinIdx[pos.coin].get(btcTs)
          const cur = ci2 !== undefined ? coinData[pos.coin][ci2].close : pos.entryPrice
          return { pos, score: liveScore(pos, cur), curClose: cur }
        })
        const worst = scored.sort((a,b) => a.score - b.score)[0]

        if (sig.alpha > worst.score) {
          // Displace worst → open new
          const exitPnl = (worst.curClose - worst.pos.entryPrice) / worst.pos.entryPrice * 100
          worst.pos.closed = true
          trades[worst.pos.coin].push(exitPnl)
          portfolioCumPnl += exitPnl
          if (portfolioCumPnl > portfolioPeak) portfolioPeak = portfolioCumPnl
          displaced[worst.pos.coin]++

          openPos.splice(openPos.indexOf(worst.pos), 1)
          openPos.push({
            coin:        sig.coin,
            openGi:      gi,
            entryPrice:  entry,
            entryAlpha:  sig.alpha,
            tpPrice:     entry * (1 + TP_PCT / 100),
            slPrice:     entry * (1 - SL_PCT / 100),
            beActivated: false,
            closed:      false,
          })
        } else {
          capRej[sig.coin]++
        }
      }
    }
  }
  console.log('  100%\n')

  // Flush remaining open positions at last close price
  for (const pos of openPos.filter(p => !p.closed)) {
    const last = coinData[pos.coin].length - 1
    const pnl  = (coinData[pos.coin][last].close - pos.entryPrice) / pos.entryPrice * 100
    trades[pos.coin].push(pnl)
    portfolioCumPnl += pnl
  }

  // ── Aggregate ─────────────────────────────────────────────
  function maxDD(arr) {
    let peak=0, dd=0, cum=0
    for (const t of arr) { cum+=t; if(cum>peak) peak=cum; dd=Math.max(dd,peak-cum) }
    return dd
  }

  const rows = COINS.map(coin => {
    const t = trades[coin]
    if (!t.length) return { coin, trades:0, winRate:0, pnl:0, mdd:0, displaced:displaced[coin], capRej:capRej[coin] }
    const wins = t.filter(v => v > 0).length
    return {
      coin,
      trades:   t.length,
      winRate:  wins / t.length * 100,
      pnl:      t.reduce((a,b) => a+b, 0),
      mdd:      maxDD(t),
      displaced:displaced[coin],
      capRej:   capRej[coin],
    }
  }).sort((a,b) => b.pnl - a.pnl)

  // ── Save to Supabase ──────────────────────────────────────
  console.log('▸ Saving results to portfolio_optimization_results...')
  const { error: saveErr } = await supabase.from('portfolio_optimization_results').upsert(
    rows.map(r => ({
      coin:                r.coin,
      regime_pct_trending: +(trendBars/N*100).toFixed(1),
      selected_regime:     'precision_v5',
      best_strategy:       'Bollinger Squeeze (ADX>25)',
      win_rate_pct:        +r.winRate.toFixed(2),
      total_pnl_pct:       +r.pnl.toFixed(2),
      max_drawdown_pct:    +r.mdd.toFixed(1),
      total_trades:        r.trades,
      cap_rejected_trades: r.capRej,
      tp_pct:              TP_PCT,
      sl_pct:              SL_PCT,
      updated_at:          new Date().toISOString(),
    })),
    { onConflict: 'coin' }
  )
  if (saveErr) console.error('  Save error:', saveErr.message)
  else         console.log(`  ✓ Saved ${rows.length} rows\n`)

  // ═══════════════════════════════════════════════════════════
  //  6-MONTH MASTER REPORT
  // ═══════════════════════════════════════════════════════════
  const W = 90
  const eq = '═'.repeat(W)
  const da = '─'.repeat(W)

  console.log('\n' + eq)
  console.log('  V5 PRECISION ALPHA ENGINE — 6-MONTH MASTER REPORT')
  console.log('  Strategy: Bollinger Squeeze (ADX>25) · ALL 20 Coins')
  console.log('  Risk: Trailing SL · Portfolio 5% DD Cool-off (24h freeze)')
  console.log(eq)
  console.log(
    ' # '.padEnd(4) +
    'Coin    '.padEnd(10) +
    'Win Rate'.padStart(10) +
    'Net PnL%'.padStart(11) +
    'Max DD%'.padStart(9) +
    'Trades'.padStart(8) +
    'Displaced'.padStart(11)
  )
  console.log(da)

  let rank = 1
  for (const r of rows) {
    const pnlStr = (r.pnl >= 0 ? '+' : '') + r.pnl.toFixed(2) + '%'
    const wrStr  = r.winRate.toFixed(1) + '%'
    const mddStr = r.mdd.toFixed(1) + '%'
    console.log(
      (' '+rank).padStart(3) + ' ' +
      r.coin.replace('USDT','').padEnd(10) +
      wrStr.padStart(10) +
      pnlStr.padStart(11) +
      mddStr.padStart(9) +
      String(r.trades).padStart(8) +
      String(r.displaced).padStart(11)
    )
    rank++
  }
  console.log(da)

  const wt          = rows.filter(r => r.trades > 0)
  const totPnl      = rows.reduce((s,r) => s+r.pnl, 0)
  const avgWR       = wt.reduce((s,r) => s+r.winRate, 0) / (wt.length||1)
  const avgDD       = wt.reduce((s,r) => s+r.mdd,     0) / (wt.length||1)
  const totTrades   = rows.reduce((s,r) => s+r.trades,    0)
  const totDisp     = rows.reduce((s,r) => s+r.displaced,  0)
  const totRej      = rows.reduce((s,r) => s+r.capRej,     0)
  const profitable  = rows.filter(r => r.pnl > 0).length

  const B = 60
  const eb = '═'.repeat(B), db = '─'.repeat(B)
  console.log('\n  ' + eb)
  console.log('  ║  SUMMARY'.padEnd(B-1) + '║')
  console.log('  ' + db)
  console.log((`  ║  Combined Portfolio PnL : ${(totPnl>=0?'+':'')+totPnl.toFixed(2)}%`).padEnd(B-1) + '║')
  console.log((`  ║  Average Win Rate       : ${avgWR.toFixed(1)}%`).padEnd(B-1) + '║')
  console.log((`  ║  Average Max Drawdown   : ${avgDD.toFixed(1)}%`).padEnd(B-1) + '║')
  console.log((`  ║  Total Executions       : ${totTrades.toLocaleString()}`).padEnd(B-1) + '║')
  console.log((`  ║  Total Displaced Trades : ${totDisp.toLocaleString()}`).padEnd(B-1) + '║')
  console.log((`  ║  Total Cap Rejections   : ${totRej.toLocaleString()}`).padEnd(B-1) + '║')
  console.log((`  ║  Profitable Coins       : ${profitable}/20`).padEnd(B-1) + '║')
  console.log((`  ║  Cool-off Events        : ${cooloffEvents} × 24h freezes`).padEnd(B-1) + '║')
  console.log((`  ║  BTC Trending Regime    : ${(trendBars/N*100).toFixed(1)}% of 6M bars`).padEnd(B-1) + '║')
  console.log('  ' + eb + '\n')
  console.log('  TP=2.0% · SL=1.2% · Bollinger(ADX>25) · Cap=5 Displacement')
  console.log('  Portfolio DD >5% → 24h entry freeze activated\n')
  console.log('✅ V5 PRECISION ALPHA ENGINE complete. Results live on Vercel.\n')
}

main().catch(console.error)
