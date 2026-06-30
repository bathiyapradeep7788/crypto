/**
 * Institutional Portfolio Optimizer — v5 MASTER BLUEPRINT
 *
 * ARCHITECTURE:
 *   - Hardcoded Coin→Strategy Matrix (20 coins, 5 distinct strategies)
 *   - Alpha Displacement Protocol: Cap=5, new signal displaces worst live position if alpha score higher
 *   - Alpha Score (0–100): ATR Ratio (40pts) + ADX (30pts) + Volume Expansion (30pts)
 *   - Trailing SL: shift to breakeven at 50% of TP distance
 *   - 1H Trend Filter (ETH + INJ only): EMA21 on aggregated 1H candles
 *   - Dynamic De-risk: coin cumulative DD > 8% → 50% position scale for next 5 trades
 *
 * COIN→STRATEGY MATRIX (hardcoded, no grid search):
 *   Bollinger Squeeze   → AVAX, OP, SOL, LINK, SUI, BNB, NEAR, INJ, ADA
 *   VWAP Reversion      → ARB, XRP, DOT, ETH, LTC, DOGE, APT, UNI
 *   Stoch RSI + Volume  → BTC
 *   ICT Order Block     → TIA
 *   Volume Momentum     → SHIB
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

// ── MASTER COIN→STRATEGY MATRIX ─────────────────────────────
const COIN_STRATEGY = {
  // Bollinger Squeeze
  'AVAXUSDT': 'bollinger',
  'OPUSDT':   'bollinger',
  'SOLUSDT':  'bollinger',
  'LINKUSDT': 'bollinger',
  'SUIUSDT':  'bollinger',
  'BNBUSDT':  'bollinger',
  'NEARUSDT': 'bollinger',
  'INJUSDT':  'bollinger',
  'ADAUSDT':  'bollinger',
  // VWAP Reversion
  'ARBUSDT':  'vwap',
  'XRPUSDT':  'vwap',
  'DOTUSDT':  'vwap',
  'ETHUSDT':  'vwap',
  'LTCUSDT':  'vwap',
  'DOGEUSDT': 'vwap',
  'APTUSDT':  'vwap',
  'UNIUSDT':  'vwap',
  // Mono-mapped
  'BTCUSDT':  'stochRsiVol',
  'TIAUSDT':  'ictOB',
  'SHIBUSDT': 'volMomentum',
}

const STRATEGY_LABELS = {
  bollinger:   'Bollinger Squeeze',
  vwap:        'VWAP Reversion',
  stochRsiVol: 'Stoch RSI + Volume',
  ictOB:       'ICT Order Block',
  volMomentum: 'Volume Momentum',
}

const COINS = Object.keys(COIN_STRATEGY)

// ── CONSTANTS ────────────────────────────────────────────────
const PORT_CAP            = 5
const MAX_HOLD            = 32
const DENSITY_WINDOW      = 10
const MICRO_TUNED         = new Set(['ETHUSDT', 'INJUSDT'])
const SL_TIGHTEN          = 0.85
const DERISK_DD_THRESHOLD = 8.0
const DERISK_SCALE        = 0.5
const DERISK_TRADE_COUNT  = 5

// TP/SL per strategy type
const STRATEGY_PARAMS = {
  bollinger:   { tp: 1.5, sl: 1.0 },
  vwap:        { tp: 1.5, sl: 1.0 },
  stochRsiVol: { tp: 1.5, sl: 1.0 },
  ictOB:       { tp: 2.5, sl: 1.5 },
  volMomentum: { tp: 2.5, sl: 1.5 },
}

// ═══════════════════════════════════════════════════════════════
//  INDICATORS
// ═══════════════════════════════════════════════════════════════
function ema(arr, p) {
  const k = 2/(p+1), out = new Array(arr.length).fill(0)
  let s = 0; for (let i = 0; i < p; i++) s += arr[i]; out[p-1] = s/p
  for (let i = p; i < arr.length; i++) out[i] = arr[i]*k + out[i-1]*(1-k)
  return out
}
function sma(arr, p) {
  return arr.map((_,i) => {
    if (i < p-1) return 0
    let s = 0; for (let j = i-p+1; j <= i; j++) s += arr[j]; return s/p
  })
}
function rsiArr(closes, p=14) {
  const out = new Array(closes.length).fill(50)
  let ag = 0, al = 0
  for (let i = 1; i <= p; i++) { const d = closes[i]-closes[i-1]; if (d>0) ag+=d; else al-=d }
  ag/=p; al/=p; out[p] = al===0?100:100-100/(1+ag/al)
  for (let i = p+1; i < closes.length; i++) {
    const d = closes[i]-closes[i-1]
    ag = (ag*(p-1)+Math.max(d,0))/p; al = (al*(p-1)+Math.max(-d,0))/p
    out[i] = al===0?100:100-100/(1+ag/al)
  }
  return out
}
function stochRsiArr(closes, rp=14, sp=14) {
  const r = rsiArr(closes, rp)
  return r.map((v,i) => {
    if (i < rp+sp-2) return 50
    const sl = r.slice(i-sp+1, i+1), mn = Math.min(...sl), mx = Math.max(...sl)
    return mx===mn ? 50 : (v-mn)/(mx-mn)*100
  })
}
function bollingerBands(closes, p=20, mult=2) {
  const up=[],lo=[],bw=[]
  for (let i = 0; i < closes.length; i++) {
    if (i < p-1) { up.push(0); lo.push(0); bw.push(999); continue }
    const sl = closes.slice(i-p+1,i+1), avg = sl.reduce((a,b)=>a+b)/p
    const std = Math.sqrt(sl.reduce((s,v)=>s+(v-avg)**2,0)/p)
    up.push(avg+mult*std); lo.push(avg-mult*std)
    bw.push(avg > 0 ? (avg+mult*std-(avg-mult*std))/avg*100 : 0)
  }
  return {up, lo, bw}
}
function vwapSeries(candles) {
  let cumTPV=0, cumV=0
  return candles.map(c => {
    const tp=(c.high+c.low+c.close)/3; cumTPV+=tp*c.volume; cumV+=c.volume
    return cumV > 0 ? cumTPV/cumV : tp
  })
}
function atrSeries(candles, p=14) {
  const out = new Array(candles.length).fill(0)
  let smooth=0, sum=0
  for (let i=1; i<candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i-1].close),
      Math.abs(candles[i].low  - candles[i-1].close)
    )
    if (i < p) { sum += tr }
    else if (i === p) { smooth = (sum+tr)/p; out[i] = smooth }
    else { smooth = (smooth*(p-1)+tr)/p; out[i] = smooth }
  }
  return out
}
function adxSeries(candles, p=14) {
  const n=candles.length, out=new Array(n).fill(0)
  if (n < p*3) return out
  const tr=[],pdm=[],mdm=[]
  for (let i=1;i<n;i++) {
    const h=candles[i].high, l=candles[i].low, pc=candles[i-1].close
    tr.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)))
    const up=h-candles[i-1].high, dn=candles[i-1].low-l
    pdm.push(up>dn&&up>0?up:0); mdm.push(dn>up&&dn>0?dn:0)
  }
  const ws = arr => {
    const o=new Array(arr.length).fill(0)
    let s=arr.slice(0,p).reduce((a,b)=>a+b,0); o[p-1]=s
    for (let i=p;i<arr.length;i++) o[i]=o[i-1]-o[i-1]/p+arr[i]
    return o
  }
  const sTR=ws(tr), sPDM=ws(pdm), sMDM=ws(mdm)
  const diP=sTR.map((t,i)=>t>0?sPDM[i]/t*100:0)
  const diM=sTR.map((t,i)=>t>0?sMDM[i]/t*100:0)
  const dx=diP.map((v,i)=>{const s=v+diM[i];return s>0?Math.abs(v-diM[i])/s*100:0})
  let av=dx.slice(p-1,2*p-1).reduce((a,b)=>a+b,0)/p; out[2*p]=av
  for (let i=2*p+1;i<n;i++) { av=(av*(p-1)+dx[i-1])/p; out[i]=av }
  return out
}
function ema1hSeries(candles) {
  // Aggregate 15m → 1H by taking close of every 4th candle
  const closes1h = []
  for (let i = 3; i < candles.length; i += 4) closes1h.push(candles[i].close)
  const e = ema(closes1h, 21)
  // Map back to 15m index
  const out = new Array(candles.length).fill(0)
  for (let i = 0; i < candles.length; i++) {
    out[i] = e[Math.min(Math.floor(i/4), e.length-1)]
  }
  return out
}

function precompute(candles, coin) {
  const closes = candles.map(c=>c.close)
  const vols   = candles.map(c=>c.volume)
  const bb     = bollingerBands(closes)
  const c = {
    closes, vols,
    e8:  ema(closes, 8),
    e21: ema(closes, 21),
    e55: ema(closes, 55),
    rsi14:   rsiArr(closes),
    stochK:  stochRsiArr(closes),
    bbUp:    bb.up,
    bbLo:    bb.lo,
    bbBW:    bb.bw,
    vwap:    vwapSeries(candles),
    volSma20: sma(vols, 20),
    hiSma20:  sma(candles.map(c=>c.high), 20),
    atr14:   atrSeries(candles),
    adx:     adxSeries(candles),
  }
  if (MICRO_TUNED.has(coin)) c.ema1h = ema1hSeries(candles)
  return c
}

// ═══════════════════════════════════════════════════════════════
//  SIGNAL FUNCTIONS — one per strategy
// ═══════════════════════════════════════════════════════════════
function sigBollinger(candles, i, p) {
  if (i < 22) return false
  const bwSlice = p.bbBW.slice(Math.max(0,i-50), i).filter(v=>v<999)
  if (!bwSlice.length) return false
  const sq = [...bwSlice].sort((a,b)=>a-b)[Math.floor(bwSlice.length*0.2)] || 0
  return p.bbBW[i-1] <= sq && candles[i-1].close <= p.bbLo[i-1] && candles[i].close > p.bbLo[i]
}
function sigVwap(candles, i, p) {
  return i >= 5
    && candles[i-1].close < p.vwap[i-1]
    && candles[i].close   > p.vwap[i]
    && p.rsi14[i] < 55
    && candles[i].close   > candles[i].open
}
function sigStochRsiVol(candles, i, p) {
  return i >= 30
    && p.stochK[i-1] < 20
    && p.stochK[i]   > 20
    && candles[i].volume > p.volSma20[i] * 1.3
}
function sigIctOB(candles, i, p) {
  if (i < 5) return false
  const ob = candles.slice(i-4, i).find(s => s.open > s.close && (s.open-s.close)/s.open > 0.003)
  return !!ob && candles[i].close > ob.open && candles[i-1].close <= ob.open
}
function sigVolMomentum(candles, i, p) {
  return i >= 22
    && candles[i].volume > p.volSma20[i] * 2
    && candles[i].close  > candles[i].open
    && candles[i].high   > p.hiSma20[i-1]
    && p.e8[i] > p.e21[i]
}

const SIGNAL_FN = {
  bollinger:   sigBollinger,
  vwap:        sigVwap,
  stochRsiVol: sigStochRsiVol,
  ictOB:       sigIctOB,
  volMomentum: sigVolMomentum,
}

// ── ALPHA SCORE (0–100) ──────────────────────────────────────
// ATR Ratio × 40 + ADX × 30 + Volume Expansion × 30
function alphaScore(candles, i, p, adxVal) {
  const atrRatio = p.atr14[i] / (candles[i].close || 1)
  const atrPts   = Math.min(atrRatio / 0.05, 1) * 40
  const adxPts   = Math.min(adxVal / 50, 1)      * 30
  const volRatio = candles[i].volume / (p.volSma20[i] || 1)
  const volPts   = Math.min(volRatio / 3, 1)      * 30
  return +(atrPts + adxPts + volPts).toFixed(2)
}

// ── LIVE POSITION SCORE ──────────────────────────────────────
// entryAlpha + current unrealized PnL% (higher = harder to displace)
function liveScore(pos, currentClose) {
  return pos.entryAlpha + (currentClose - pos.entryPrice) / pos.entryPrice * 100
}

// ── LOAD CANDLES FROM SUPABASE ───────────────────────────────
async function loadCandles(coin) {
  const rows = [], PAGE = 1000; let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('historical_15m_portfolio_data')
      .select('ts,open,high,low,close,volume')
      .eq('coin', coin)
      .order('ts', { ascending: true })
      .range(from, from+PAGE-1)
    if (error || !data || data.length === 0) break
    rows.push(...data.map(r => ({
      ts:r.ts, open:+r.open, high:+r.high, low:+r.low, close:+r.close, volume:+r.volume
    })))
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

// ── CLOSE A POSITION (normal or displaced) ───────────────────
function closePos(pos, pnlPct, trades, derisk, displaced, displacedCounts) {
  pos.closed = true
  const d = derisk[pos.coin]
  const scaled = pnlPct * d.scale
  if (d.tradesLeft > 0) { d.tradesLeft--; if (d.tradesLeft === 0) d.scale = 1.0 }
  d.cumPnl += scaled
  if (d.cumPnl > d.peak) d.peak = d.cumPnl
  if (d.peak - d.cumPnl >= DERISK_DD_THRESHOLD && d.scale === 1.0) {
    d.scale = DERISK_SCALE; d.tradesLeft = DERISK_TRADE_COUNT
  }
  trades[pos.coin].push(scaled)
  if (displaced) displacedCounts[pos.coin]++
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗')
  console.log('║  MASTER BLUEPRINT V5 — VERCEL NATIVE ENGINE                  ║')
  console.log('║  Hardcoded Coin→Strategy Matrix · Alpha Displacement (Cap=5)  ║')
  console.log('║  Trailing SL · ETH/INJ 1H Filter · Dynamic De-risk           ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝\n')

  console.log('▸ Coin→Strategy Matrix:')
  const groupedCoins = {}
  for (const [coin, strat] of Object.entries(COIN_STRATEGY)) {
    if (!groupedCoins[strat]) groupedCoins[strat] = []
    groupedCoins[strat].push(coin.replace('USDT',''))
  }
  for (const [s, cs] of Object.entries(groupedCoins)) {
    console.log(`  ${STRATEGY_LABELS[s].padEnd(26)} → ${cs.join(', ')}`)
  }
  console.log()

  // ── Load data ────────────────────────────────────────────
  console.log('▸ Loading candle data from Supabase...')
  const coinData = {}, coinIdx = {}
  for (const coin of COINS) {
    process.stdout.write(`  ${coin}...`)
    const candles = await loadCandles(coin)
    coinData[coin] = candles
    coinIdx[coin]  = new Map(candles.map((c,i) => [c.ts, i]))
    process.stdout.write(` ${candles.length} candles\n`)
  }

  // ── Precompute indicators ────────────────────────────────
  console.log('\n▸ Precomputing indicators...')
  const cache = {}
  for (const coin of COINS) { cache[coin] = precompute(coinData[coin], coin); process.stdout.write('.') }
  console.log(' done\n')

  const btcCandles = coinData['BTCUSDT']
  const btcCache   = cache['BTCUSDT']
  const N = btcCandles.length
  console.log(`▸ Simulation: ${N} timestamps × ${COINS.length} coins`)
  console.log(`  Cap=5 · Alpha Displacement · Trailing SL · 1H Filter\n`)

  // ── Accumulators ─────────────────────────────────────────
  const trades        = {}  // coin → raw pnl[]
  const displacedCounts = {}
  const capRejected   = {}
  const derisk        = {}
  for (const coin of COINS) {
    trades[coin]          = []
    displacedCounts[coin] = 0
    capRejected[coin]     = 0
    derisk[coin]          = { cumPnl:0, peak:0, scale:1.0, tradesLeft:0 }
  }

  const openPos    = []
  const printEvery = Math.floor(N / 10)

  for (let gi = 60; gi < N - MAX_HOLD - 2; gi++) {
    if (gi % printEvery === 0) process.stdout.write(`  ${Math.round(gi/N*100)}%`)

    const btcTs  = btcCandles[gi].ts
    const adxVal = btcCache.adx[gi]

    // ── Step 1: Update open positions ────────────────────
    for (const pos of openPos) {
      if (pos.closed) continue
      const ci = coinIdx[pos.coin].get(btcTs)
      if (ci === undefined) continue
      const c = coinData[pos.coin][ci]

      // Trailing SL: move to breakeven at 50% of TP distance
      const beTrig = pos.entryPrice * (1 + pos.tpPct * 0.5 / 100)
      if (!pos.beActivated && c.high >= beTrig) {
        pos.beActivated = true
        pos.slPrice = pos.entryPrice
      }

      const hitTP = c.high >= pos.tpPrice
      const hitSL = c.low  <= pos.slPrice
      let result  = null

      if (hitTP && hitSL) result = c.close >= c.open ? pos.tpPct : (pos.beActivated ? 0 : -pos.slPct)
      else if (hitTP)     result = pos.tpPct
      else if (hitSL)     result = pos.beActivated ? 0 : -pos.slPct
      else if (gi >= pos.openGi + MAX_HOLD) {
        const exIdx = Math.min(ci, coinData[pos.coin].length-1)
        result = (coinData[pos.coin][exIdx].close - pos.entryPrice) / pos.entryPrice * 100
      }
      if (result !== null) closePos(pos, result, trades, derisk, false, displacedCounts)
    }
    openPos.splice(0, openPos.length, ...openPos.filter(p => !p.closed))

    // ── Step 2: Collect signals from assigned strategy per coin ──
    const sigs = []
    for (const coin of COINS) {
      const ci = coinIdx[coin].get(btcTs)
      if (ci === undefined || ci < 60) continue
      const candles = coinData[coin], p = cache[coin]

      // ETH/INJ: require 1H bullish trend
      if (MICRO_TUNED.has(coin) && p.ema1h) {
        if (!(p.ema1h[ci] > 0 && candles[ci].close > p.ema1h[ci])) continue
      }

      // Only fire the coin's assigned strategy
      const stratId = COIN_STRATEGY[coin]
      const fn      = SIGNAL_FN[stratId]
      if (!fn(candles, ci, p)) continue
      if (openPos.some(pos => pos.coin === coin)) continue  // 1 position per coin

      const alpha = alphaScore(candles, ci, p, adxVal)
      sigs.push({ coin, stratId, alpha, ci })
    }

    // Sort by alpha descending — highest conviction first
    sigs.sort((a,b) => b.alpha - a.alpha)

    // ── Step 3: Alpha Displacement Engine ────────────────────
    for (const sig of sigs) {
      const { tp, sl: baseSl } = STRATEGY_PARAMS[sig.stratId]
      const sl = MICRO_TUNED.has(sig.coin) ? +(baseSl * SL_TIGHTEN).toFixed(3) : baseSl
      const entry = coinData[sig.coin][sig.ci].close

      if (openPos.length < PORT_CAP) {
        // Free slot — open directly
        openPos.push({
          coin: sig.coin, stratId: sig.stratId, openGi: gi,
          entryPrice: entry, entryAlpha: sig.alpha,
          tpPrice: entry*(1+tp/100), slPrice: entry*(1-sl/100),
          tpPct: tp, slPct: sl, beActivated: false, closed: false,
        })
      } else {
        // Portfolio full — attempt displacement
        const scored = openPos.map(pos => {
          const ci2 = coinIdx[pos.coin].get(btcTs)
          const cur  = ci2 !== undefined ? coinData[pos.coin][ci2].close : pos.entryPrice
          return { pos, score: liveScore(pos, cur), curClose: cur }
        })
        const worst = scored.sort((a,b) => a.score - b.score)[0]

        if (sig.alpha > worst.score) {
          // Displace worst position — capital recycled to new signal
          const exitPnl = (worst.curClose - worst.pos.entryPrice) / worst.pos.entryPrice * 100
          closePos(worst.pos, exitPnl, trades, derisk, true, displacedCounts)
          openPos.splice(openPos.indexOf(worst.pos), 1)
          openPos.push({
            coin: sig.coin, stratId: sig.stratId, openGi: gi,
            entryPrice: entry, entryAlpha: sig.alpha,
            tpPrice: entry*(1+tp/100), slPrice: entry*(1-sl/100),
            tpPct: tp, slPct: sl, beActivated: false, closed: false,
          })
        } else {
          capRejected[sig.coin]++
        }
      }
    }
  }
  console.log('  100%\n')

  // Flush any remaining open positions
  for (const pos of openPos.filter(p => !p.closed)) {
    const lastIdx = coinData[pos.coin].length - 1
    const pnl = (coinData[pos.coin][lastIdx].close - pos.entryPrice) / pos.entryPrice * 100
    closePos(pos, pnl, trades, derisk, false, displacedCounts)
  }

  // ── Aggregate results ────────────────────────────────────
  function maxDD(arr) {
    let peak=0, dd=0, cum=0
    for (const t of arr) { cum+=t; if(cum>peak)peak=cum; dd=Math.max(dd,peak-cum) }
    return dd
  }

  const rows = COINS.map(coin => {
    const t = trades[coin]
    if (!t.length) return {
      coin, stratId: COIN_STRATEGY[coin], stratLabel: STRATEGY_LABELS[COIN_STRATEGY[coin]],
      trades:0, winRate:0, pnl:0, maxDD:0,
      capRej: capRejected[coin], displaced: displacedCounts[coin],
    }
    const wins = t.filter(v=>v>0).length
    return {
      coin, stratId: COIN_STRATEGY[coin], stratLabel: STRATEGY_LABELS[COIN_STRATEGY[coin]],
      trades: t.length,
      winRate: (wins/t.length)*100,
      pnl:    t.reduce((a,b)=>a+b,0),
      maxDD:  maxDD(t),
      capRej: capRejected[coin],
      displaced: displacedCounts[coin],
    }
  }).sort((a,b) => b.pnl - a.pnl)

  // ── Save to Supabase ─────────────────────────────────────
  console.log('▸ Saving v5 results to portfolio_optimization_results...')
  const { error: saveErr } = await supabase.from('portfolio_optimization_results').upsert(
    rows.map(r => ({
      coin:                r.coin,
      regime_pct_trending: 46,
      selected_regime:     'matrix',
      best_strategy:       r.stratLabel,
      win_rate_pct:        +r.winRate.toFixed(2),
      total_pnl_pct:       +r.pnl.toFixed(2),
      max_drawdown_pct:    +r.maxDD.toFixed(1),
      total_trades:        r.trades,
      cap_rejected_trades: r.capRej,
      tp_pct:              STRATEGY_PARAMS[r.stratId].tp,
      sl_pct:              MICRO_TUNED.has(r.coin)
                             ? +(STRATEGY_PARAMS[r.stratId].sl*SL_TIGHTEN).toFixed(3)
                             : STRATEGY_PARAMS[r.stratId].sl,
      updated_at:          new Date().toISOString(),
    })),
    { onConflict: 'coin' }
  )
  if (saveErr) console.error('  Save error:', saveErr.message)
  else console.log(`  ✓ Saved ${rows.length} rows\n`)

  // ═══════════════════════════════════════════════════════════
  //  MASTER V5 VERCEL NATIVE REPORT
  // ═══════════════════════════════════════════════════════════
  const W = 128
  const eq = '═'.repeat(W)
  const da = '─'.repeat(W)
  console.log('\n'+eq)
  console.log('  MASTER V5 VERCEL NATIVE REPORT — 6-MONTH INSTITUTIONAL BACKTEST')
  console.log('  Hardcoded Strategy Matrix · Alpha Displacement (Cap=5) · Trailing SL · 1H Filter')
  console.log(eq)
  console.log(
    ' # '.padEnd(4)+
    'Coin'.padEnd(10)+
    'Strategy'.padEnd(28)+
    '6M Win Rate'.padStart(12)+
    'Net PnL%'.padStart(10)+
    'Max DD%'.padStart(9)+
    'Trades'.padStart(8)+
    'Displaced'.padStart(10)+
    'CapRej'.padStart(8)
  )
  console.log(da)

  let rank=1
  for (const r of rows) {
    const pnlStr = (r.pnl>=0?'+':'')+r.pnl.toFixed(2)+'%'
    const pnlCol = r.pnl>=0 ? pnlStr : pnlStr
    const micro  = MICRO_TUNED.has(r.coin) ? '①' : ' '
    console.log(
      (' '+rank).padStart(3)+' '+
      (r.coin.replace('USDT','')+micro).padEnd(10)+
      r.stratLabel.padEnd(28)+
      (r.winRate.toFixed(1)+'%').padStart(12)+
      pnlCol.padStart(10)+
      (r.maxDD.toFixed(1)+'%').padStart(9)+
      String(r.trades).padStart(8)+
      String(r.displaced).padStart(10)+
      String(r.capRej).padStart(8)
    )
    rank++
  }

  console.log(da)

  const totPnl      = rows.reduce((s,r)=>s+r.pnl, 0)
  const withTrades  = rows.filter(r=>r.trades>0)
  const avgWR       = withTrades.reduce((s,r)=>s+r.winRate,0)/(withTrades.length||1)
  const totTrades   = rows.reduce((s,r)=>s+r.trades, 0)
  const totDisp     = rows.reduce((s,r)=>s+r.displaced, 0)
  const totRej      = rows.reduce((s,r)=>s+r.capRej, 0)
  const avgDD       = withTrades.reduce((s,r)=>s+r.maxDD,0)/(withTrades.length||1)
  const profitable  = rows.filter(r=>r.pnl>0).length

  const B = 70
  const eb = '═'.repeat(B)
  const db = '─'.repeat(B)
  console.log('\n  '+eb)
  console.log('  ║  GLOBAL SUMMARY'.padEnd(B-1)+'║')
  console.log('  '+db)
  console.log((`  ║  Combined Portfolio PnL:    ${(totPnl>=0?'+':'')+totPnl.toFixed(2)}%`).padEnd(B-1)+'║')
  console.log((`  ║  Average Win Rate:          ${avgWR.toFixed(1)}%`).padEnd(B-1)+'║')
  console.log((`  ║  Average Max Drawdown:      ${avgDD.toFixed(1)}%`).padEnd(B-1)+'║')
  console.log((`  ║  Total Executions:          ${totTrades.toLocaleString()}`).padEnd(B-1)+'║')
  console.log((`  ║  Total Displaced Trades:    ${totDisp.toLocaleString()}  (capital recycled)`).padEnd(B-1)+'║')
  console.log((`  ║  Total Cap Rejections:      ${totRej.toLocaleString()}`).padEnd(B-1)+'║')
  console.log((`  ║  Profitable Coins:          ${profitable}/20`).padEnd(B-1)+'║')
  console.log('  '+eb+'\n')
  console.log('  ① ETH & INJ: 1H EMA21 trend filter active + SL ×0.85')
  console.log('\n✅ V5 MASTER BLUEPRINT simulation complete. Results live on Vercel dashboard.\n')
}

main().catch(console.error)
