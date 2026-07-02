/**
 * HYPER-OPTIMIZED REGIME-ADAPTIVE INSTITUTIONAL TRADING ENGINE
 *
 * Architecture:
 *   ┌─ Regime Detection ──────────────────────────────────────────┐
 *   │  BTC ADX(14) on every candle                                │
 *   │  ADX > 25  → TRENDING  : EMA Cross · Vol Momentum · ICT OB  │
 *   │  ADX ≤ 25  → RANGING   : Stoch RSI · Bollinger · VWAP Rev   │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌─ Signal Admission ──────────────────────────────────────────┐
 *   │  Signal Density Score: strategy firing on most coins wins   │
 *   │  Within same strategy: ranked by ATR volatility intensity   │
 *   │  Hard Portfolio Cap: MAX 5 concurrent positions             │
 *   │  Alpha Displacement: new signal evicts lowest live-score pos│
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌─ Risk Management ───────────────────────────────────────────┐
 *   │  Trailing SL: shift to Breakeven at TP1 (50% of TP dist)   │
 *   │  Trending TP=2.5% / SL=1.5%                                │
 *   │  Ranging  TP=1.5% / SL=1.0%                                │
 *   │  Max hold: 32 candles (~8h) — time-based exit              │
 *   └─────────────────────────────────────────────────────────────┘
 *   ┌─ Vercel Compatibility ──────────────────────────────────────┐
 *   │  Runs as local Node.js script (no serverless timeout)       │
 *   │  Cursor-paginated Supabase reads (1000 rows/page)           │
 *   │  Results saved to Supabase → served by /api/optimize routes │
 *   └─────────────────────────────────────────────────────────────┘
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

// ── TARGET UNIVERSE ──────────────────────────────────────────
const COINS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','DOGEUSDT',
  'UNIUSDT','LTCUSDT','APTUSDT','SUIUSDT','NEARUSDT',
  'OPUSDT','ARBUSDT','INJUSDT','TIAUSDT','SHIBUSDT',
]

// ── ENGINE CONSTANTS ─────────────────────────────────────────
const PORT_CAP     = 5
const MAX_HOLD     = 32          // max candles per position (~8h)
const ADX_TREND    = 25          // BTC ADX threshold for regime

// Regime-specific TP/SL
const TREND_TP = 2.5,  TREND_SL = 1.5
const RANGE_TP = 1.5,  RANGE_SL = 1.0

// Strategy IDs
const S = {
  EMA_CROSS:  'emaCross',
  VOL_MOM:    'volMomentum',
  ICT_OB:     'ictOB',
  STOCH_RSI:  'stochRsi',
  BOLLINGER:  'bollinger',
  VWAP_REV:   'vwapRev',
}

const REGIME_MAP = {
  trending: [S.EMA_CROSS, S.VOL_MOM,   S.ICT_OB],
  ranging:  [S.STOCH_RSI, S.BOLLINGER, S.VWAP_REV],
}

const STRATEGY_LABELS = {
  [S.EMA_CROSS]:  'EMA Crossover',
  [S.VOL_MOM]:    'Volume Momentum',
  [S.ICT_OB]:     'ICT Order Block',
  [S.STOCH_RSI]:  'Stoch RSI',
  [S.BOLLINGER]:  'Bollinger Squeeze',
  [S.VWAP_REV]:   'VWAP Reversion',
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
  let ag=0,al=0
  for (let i=1;i<=p;i++) { const d=closes[i]-closes[i-1]; if(d>0)ag+=d; else al-=d }
  ag/=p; al/=p; out[p]=al===0?100:100-100/(1+ag/al)
  for (let i=p+1;i<closes.length;i++) {
    const d=closes[i]-closes[i-1]
    ag=(ag*(p-1)+Math.max(d,0))/p; al=(al*(p-1)+Math.max(-d,0))/p
    out[i]=al===0?100:100-100/(1+ag/al)
  }
  return out
}
function stochRsiArr(closes, rp=14, sp=14) {
  const r=rsiArr(closes,rp)
  return r.map((v,i) => {
    if (i<rp+sp-2) return 50
    const sl=r.slice(i-sp+1,i+1),mn=Math.min(...sl),mx=Math.max(...sl)
    return mx===mn?50:(v-mn)/(mx-mn)*100
  })
}
function bollingerBands(closes, p=20, mult=2) {
  const up=[],lo=[],bw=[]
  for (let i=0;i<closes.length;i++) {
    if (i<p-1) { up.push(0);lo.push(0);bw.push(999);continue }
    const sl=closes.slice(i-p+1,i+1),avg=sl.reduce((a,b)=>a+b)/p
    const std=Math.sqrt(sl.reduce((s,v)=>s+(v-avg)**2,0)/p)
    up.push(avg+mult*std); lo.push(avg-mult*std)
    bw.push(avg>0?(mult*2*std)/avg*100:0)
  }
  return {up,lo,bw}
}
function vwapSeries(candles) {
  let cumTPV=0,cumV=0
  return candles.map(c => {
    const tp=(c.high+c.low+c.close)/3; cumTPV+=tp*c.volume; cumV+=c.volume
    return cumV>0?cumTPV/cumV:tp
  })
}
function atrSeries(candles, p=14) {
  const out=new Array(candles.length).fill(0)
  let smooth=0,sum=0
  for (let i=1;i<candles.length;i++) {
    const tr=Math.max(
      candles[i].high-candles[i].low,
      Math.abs(candles[i].high-candles[i-1].close),
      Math.abs(candles[i].low -candles[i-1].close)
    )
    if      (i<p)  sum+=tr
    else if (i===p) { smooth=(sum+tr)/p; out[i]=smooth }
    else            { smooth=(smooth*(p-1)+tr)/p; out[i]=smooth }
  }
  return out
}
function adxSeries(candles, p=14) {
  const n=candles.length, out=new Array(n).fill(0)
  if (n<p*3) return out
  const tr=[],pdm=[],mdm=[]
  for (let i=1;i<n;i++) {
    const h=candles[i].high,l=candles[i].low,pc=candles[i-1].close
    tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))
    const up=h-candles[i-1].high,dn=candles[i-1].low-l
    pdm.push(up>dn&&up>0?up:0); mdm.push(dn>up&&dn>0?dn:0)
  }
  const ws=arr => {
    const o=new Array(arr.length).fill(0)
    let s=arr.slice(0,p).reduce((a,b)=>a+b,0); o[p-1]=s
    for (let i=p;i<arr.length;i++) o[i]=o[i-1]-o[i-1]/p+arr[i]
    return o
  }
  const sTR=ws(tr),sPDM=ws(pdm),sMDM=ws(mdm)
  const diP=sTR.map((t,i)=>t>0?sPDM[i]/t*100:0)
  const diM=sTR.map((t,i)=>t>0?sMDM[i]/t*100:0)
  const dx=diP.map((v,i)=>{const s=v+diM[i];return s>0?Math.abs(v-diM[i])/s*100:0})
  let av=dx.slice(p-1,2*p-1).reduce((a,b)=>a+b,0)/p; out[2*p]=av
  for (let i=2*p+1;i<n;i++) { av=(av*(p-1)+dx[i-1])/p; out[i]=av }
  return out
}

function precompute(candles) {
  const closes=candles.map(c=>c.close)
  const vols  =candles.map(c=>c.volume)
  const bb    =bollingerBands(closes)
  return {
    closes,
    e8:       ema(closes,8),
    e21:      ema(closes,21),
    e55:      ema(closes,55),
    rsi14:    rsiArr(closes),
    stochK:   stochRsiArr(closes),
    bbUp:     bb.up,
    bbLo:     bb.lo,
    bbBW:     bb.bw,
    vwap:     vwapSeries(candles),
    volSma20: sma(vols,20),
    hiSma20:  sma(candles.map(c=>c.high),20),
    atr14:    atrSeries(candles),
    adx:      adxSeries(candles),
    vols,
  }
}

// ═══════════════════════════════════════════════════════════════
//  SIGNAL FUNCTIONS
//  Each returns true/false. All take (candles, i, p) signature.
// ═══════════════════════════════════════════════════════════════

// TRENDING STRATEGIES ─────────────────────────────────────────

// EMA Cross: EMA8 crosses above EMA21, price above EMA55
function sigEmaCross(candles, i, p) {
  return i >= 55
    && p.e8[i-1] <= p.e21[i-1]       // was below
    && p.e8[i]   >  p.e21[i]          // now above
    && candles[i].close > p.e55[i]    // long-term uptrend
    && candles[i].close > candles[i].open
}

// Volume Momentum: 2× vol surge + new high + EMA8 > EMA21
function sigVolMom(candles, i, p) {
  return i >= 22
    && candles[i].volume > p.volSma20[i] * 2.0
    && candles[i].close  > candles[i].open
    && candles[i].high   > p.hiSma20[i-1]
    && p.e8[i] > p.e21[i]
}

// ICT Order Block: bearish OB in last 5 bars, price reclaims top
function sigIctOB(candles, i, p) {
  if (i < 5) return false
  const ob = candles.slice(i-5, i).find(
    c => c.open > c.close && (c.open-c.close)/c.open > 0.003
  )
  return !!ob
    && candles[i].close   > ob.open
    && candles[i-1].close <= ob.open
    && candles[i].close   > candles[i].open
}

// RANGING STRATEGIES ──────────────────────────────────────────

// Stoch RSI: StochK crosses above 20 + volume confirmation
function sigStochRsi(candles, i, p) {
  return i >= 30
    && p.stochK[i-1] < 20
    && p.stochK[i]   > 20
    && candles[i].volume > p.volSma20[i] * 1.2
    && p.rsi14[i] < 55
}

// Bollinger Squeeze: BW at 20th pctile, price bounces off lower band
function sigBollinger(candles, i, p) {
  if (i < 22) return false
  const bwSlice = p.bbBW.slice(Math.max(0,i-50),i).filter(v=>v<999)
  if (!bwSlice.length) return false
  const squeeze = [...bwSlice].sort((a,b)=>a-b)[Math.floor(bwSlice.length*0.2)] ?? 0
  return p.bbBW[i-1]   <= squeeze
    && candles[i-1].close <= p.bbLo[i-1]
    && candles[i].close   >  p.bbLo[i]
}

// VWAP Reversion: price below VWAP, RSI oversold, bullish close
function sigVwapRev(candles, i, p) {
  return i >= 5
    && candles[i-1].close < p.vwap[i-1]
    && candles[i].close   > p.vwap[i]     // cross back above VWAP
    && p.rsi14[i] < 50
    && candles[i].close > candles[i].open
}

const SIGNAL_FN = {
  [S.EMA_CROSS]:  sigEmaCross,
  [S.VOL_MOM]:    sigVolMom,
  [S.ICT_OB]:     sigIctOB,
  [S.STOCH_RSI]:  sigStochRsi,
  [S.BOLLINGER]:  sigBollinger,
  [S.VWAP_REV]:   sigVwapRev,
}

// ── ATR Intensity score (used for tie-breaking within same strategy)
function atrScore(candles, i, p) {
  return p.atr14[i] / (candles[i].close || 1)
}

// ── Live position score for displacement decisions
function liveScore(pos, curClose) {
  return (curClose - pos.entryPrice) / pos.entryPrice * 100
}

// ── LOAD CANDLES (cursor-paginated) ──────────────────────────
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
      ts:r.ts, open:+r.open, high:+r.high, low:+r.low,
      close:+r.close, volume:+r.volume
    })))
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

// ── MAX DRAWDOWN helper ───────────────────────────────────────
function maxDD(arr) {
  let peak=0, dd=0, cum=0
  for (const t of arr) {
    cum += t
    if (cum > peak) peak = cum
    dd = Math.max(dd, peak - cum)
  }
  return dd
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗')
  console.log('║  HYPER-OPTIMIZED REGIME-ADAPTIVE INSTITUTIONAL ENGINE               ║')
  console.log('║  Trending (ADX>25): EMA Cross · Vol Momentum · ICT Order Block      ║')
  console.log('║  Ranging  (ADX≤25): Stoch RSI · Bollinger Squeeze · VWAP Reversion  ║')
  console.log('║  Risk: Trailing SL (Breakeven at TP1) · Cap=5 · Density Ranking     ║')
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n')

  // ── Load all coin data ──────────────────────────────────
  console.log('▸ Loading candle data from Supabase...')
  const coinData = {}, coinIdx = {}
  for (const coin of COINS) {
    process.stdout.write(`  ${coin}...`)
    const candles = await loadCandles(coin)
    coinData[coin] = candles
    coinIdx[coin]  = new Map(candles.map((c,i) => [c.ts, i]))
    process.stdout.write(` ${candles.length}\n`)
  }
  console.log()

  // ── Precompute indicators ───────────────────────────────
  console.log('▸ Precomputing indicators...')
  const cache = {}
  for (const coin of COINS) {
    cache[coin] = precompute(coinData[coin])
    process.stdout.write('.')
  }
  console.log(' done\n')

  const btcCandles = coinData['BTCUSDT']
  const btcCache   = cache['BTCUSDT']
  const N          = btcCandles.length

  console.log(`▸ Simulation: ${N} timestamps × ${COINS.length} coins`)
  console.log(`  6 strategies across 2 regimes · Density ranking · Cap=5 displacement\n`)

  // ── Per-coin result accumulators ────────────────────────
  const coinTrades    = {}   // coin → pnl[]
  const coinStrategy  = {}   // coin → most-used strategy id
  const coinStratMap  = {}   // coin → { stratId → tradeCount }
  const coinCapRej    = {}   // coin → rejection count
  const coinDisp      = {}   // coin → displaced count (as evicted)

  for (const c of COINS) {
    coinTrades[c]   = []
    coinStrategy[c] = null
    coinStratMap[c] = {}
    coinCapRej[c]   = 0
    coinDisp[c]     = 0
  }

  const openPos    = []
  const printEvery = Math.floor(N / 10)
  let trendBars    = 0

  // ── CHRONOLOGICAL GLOBAL LOOP ───────────────────────────
  for (let gi = 60; gi < N - MAX_HOLD - 2; gi++) {
    if (gi % printEvery === 0) process.stdout.write(`  ${Math.round(gi/N*100)}%`)

    const btcTs  = btcCandles[gi].ts
    const adxVal = btcCache.adx[gi]
    const regime = adxVal > ADX_TREND ? 'trending' : 'ranging'
    const tp     = regime === 'trending' ? TREND_TP : RANGE_TP
    const sl     = regime === 'trending' ? TREND_SL : RANGE_SL
    if (regime === 'trending') trendBars++

    // ── Step 1: Update open positions ──────────────────
    for (const pos of openPos) {
      if (pos.closed) continue
      const ci = coinIdx[pos.coin].get(btcTs)
      if (ci === undefined) continue
      const c = coinData[pos.coin][ci]

      // Trailing SL: shift to Breakeven at TP1 (50% of TP distance)
      const tp1Trig = pos.entryPrice * (1 + pos.tpPct * 0.5 / 100)
      if (!pos.beActivated && c.high >= tp1Trig) {
        pos.beActivated = true
        pos.slPrice     = pos.entryPrice   // move SL to exact entry = breakeven
      }

      const hitTP = c.high >= pos.tpPrice
      const hitSL = c.low  <= pos.slPrice
      let   result = null

      if      (hitTP && hitSL) result = c.close >= c.open ? pos.tpPct : (pos.beActivated ? 0 : -pos.slPct)
      else if (hitTP)          result = pos.tpPct
      else if (hitSL)          result = pos.beActivated ? 0 : -pos.slPct
      else if (gi >= pos.openGi + MAX_HOLD) {
        const ex = Math.min(ci, coinData[pos.coin].length-1)
        result = (coinData[pos.coin][ex].close - pos.entryPrice) / pos.entryPrice * 100
      }

      if (result !== null) {
        pos.closed = true
        coinTrades[pos.coin].push(result)
        coinStratMap[pos.coin][pos.stratId] = (coinStratMap[pos.coin][pos.stratId] ?? 0) + 1
      }
    }
    openPos.splice(0, openPos.length, ...openPos.filter(p => !p.closed))

    // ── Step 2: Collect signals from active regime strategies
    const activeStrats = REGIME_MAP[regime]
    const allSigs = []   // { coin, stratId, atrScore }

    for (const coin of COINS) {
      const ci = coinIdx[coin].get(btcTs)
      if (ci === undefined || ci < 60) continue
      if (openPos.some(p => p.coin === coin)) continue

      const candles = coinData[coin], p = cache[coin]

      for (const stratId of activeStrats) {
        if (!SIGNAL_FN[stratId](candles, ci, p)) continue
        allSigs.push({ coin, stratId, ci, atr: atrScore(candles, ci, p) })
        break  // one strategy per coin per bar (first match wins within regime)
      }
    }

    if (!allSigs.length) continue

    // ── Step 3: Density Ranking ─────────────────────────
    // Strategy with most simultaneous signals = highest density
    const densityCount = {}
    for (const s of allSigs) densityCount[s.stratId] = (densityCount[s.stratId]??0) + 1

    // Sort: primary = density (desc), secondary = ATR intensity (desc)
    allSigs.sort((a, b) => {
      const dDiff = densityCount[b.stratId] - densityCount[a.stratId]
      return dDiff !== 0 ? dDiff : b.atr - a.atr
    })

    // ── Step 4: Admit signals with Alpha Displacement ───
    for (const sig of allSigs) {
      const entry = coinData[sig.coin][sig.ci].close

      if (openPos.length < PORT_CAP) {
        openPos.push({
          coin:        sig.coin,
          stratId:     sig.stratId,
          openGi:      gi,
          entryPrice:  entry,
          tpPrice:     entry * (1 + tp / 100),
          slPrice:     entry * (1 - sl / 100),
          tpPct:       tp,
          slPct:       sl,
          beActivated: false,
          closed:      false,
        })
      } else {
        // Displacement: compare new signal vs worst live position by PnL%
        const scored = openPos.map(pos => {
          const ci2 = coinIdx[pos.coin].get(btcTs)
          const cur = ci2 !== undefined ? coinData[pos.coin][ci2].close : pos.entryPrice
          return { pos, score: liveScore(pos, cur), curClose: cur }
        })
        const worst = scored.sort((a,b) => a.score - b.score)[0]

        // Density-ranked signal displaces only deeply underwater positions
        const densityBonus = densityCount[sig.stratId] >= 3 ? 2.0 : 0  // bonus for high density
        if (densityBonus - worst.score > 0 || worst.score < -1.0) {
          const exitPnl = (worst.curClose - worst.pos.entryPrice) / worst.pos.entryPrice * 100
          worst.pos.closed = true
          coinTrades[worst.pos.coin].push(exitPnl)
          coinStratMap[worst.pos.coin][worst.pos.stratId] = (coinStratMap[worst.pos.coin][worst.pos.stratId]??0) + 1
          coinDisp[worst.pos.coin]++

          openPos.splice(openPos.indexOf(worst.pos), 1)
          openPos.push({
            coin:        sig.coin,
            stratId:     sig.stratId,
            openGi:      gi,
            entryPrice:  entry,
            tpPrice:     entry * (1 + tp / 100),
            slPrice:     entry * (1 - sl / 100),
            tpPct:       tp,
            slPct:       sl,
            beActivated: false,
            closed:      false,
          })
        } else {
          coinCapRej[sig.coin]++
        }
      }
    }
  }
  console.log('  100%\n')

  // Flush remaining open positions
  for (const pos of openPos.filter(p => !p.closed)) {
    const last   = coinData[pos.coin].length - 1
    const pnl    = (coinData[pos.coin][last].close - pos.entryPrice) / pos.entryPrice * 100
    coinTrades[pos.coin].push(pnl)
    coinStratMap[pos.coin][pos.stratId] = (coinStratMap[pos.coin][pos.stratId]??0)+1
  }

  const trendPct = +(trendBars/N*100).toFixed(1)

  // ── Build result rows ───────────────────────────────────
  const rows = COINS.map(coin => {
    const t   = coinTrades[coin]
    // Determine dominant strategy (most trades)
    const topStrat = Object.entries(coinStratMap[coin])
      .sort((a,b) => b[1]-a[1])[0]?.[0] ?? 'N/A'
    const regime    = REGIME_MAP.trending.includes(topStrat) ? 'Trending' : 'Ranging'

    if (!t.length) return {
      coin, regime, topStrat, trades:0,
      winRate:0, pnl:0, mdd:0,
      capRej:coinCapRej[coin], disp:coinDisp[coin],
    }
    const wins = t.filter(v => v > 0).length
    return {
      coin, regime,
      topStrat,
      trades:  t.length,
      winRate: wins/t.length*100,
      pnl:     t.reduce((a,b) => a+b, 0),
      mdd:     maxDD(t),
      capRej:  coinCapRej[coin],
      disp:    coinDisp[coin],
    }
  }).sort((a,b) => b.pnl - a.pnl)

  // ── Save to Supabase ────────────────────────────────────
  console.log('▸ Saving results to portfolio_optimization_results...')
  const { error: saveErr } = await supabase
    .from('portfolio_optimization_results')
    .upsert(
      rows.map(r => ({
        coin:                r.coin,
        regime_pct_trending: trendPct,
        selected_regime:     r.regime.toLowerCase(),
        best_strategy:       STRATEGY_LABELS[r.topStrat] ?? r.topStrat,
        win_rate_pct:        +r.winRate.toFixed(2),
        total_pnl_pct:       +r.pnl.toFixed(2),
        max_drawdown_pct:    +r.mdd.toFixed(1),
        total_trades:        r.trades,
        cap_rejected_trades: r.capRej,
        tp_pct:              r.regime==='Trending' ? TREND_TP : RANGE_TP,
        sl_pct:              r.regime==='Trending' ? TREND_SL : RANGE_SL,
        updated_at:          new Date().toISOString(),
      })),
      { onConflict: 'coin' }
    )
  if (saveErr) console.error('  Save error:', saveErr.message)
  else         console.log(`  ✓ Saved ${rows.length} rows\n`)

  // ═══════════════════════════════════════════════════════
  //  MASTER REPORT
  // ═══════════════════════════════════════════════════════
  const W = 112
  console.log('\n' + '═'.repeat(W))
  console.log('  HYPER-OPTIMIZED REGIME-ADAPTIVE ENGINE — 6-MONTH MASTER REPORT')
  console.log('  BTC ADX(14) Regime · 6 Strategies · Density Ranking · Cap=5 · Trailing SL')
  console.log('═'.repeat(W))
  console.log(
    ' # '.padEnd(4) +
    'Coin'.padEnd(9) +
    'Regime'.padEnd(10) +
    'Active Strategy'.padEnd(22) +
    '6M Win Rate'.padStart(12) +
    'Net PnL%'.padStart(10) +
    'Max DD%'.padStart(9) +
    'Trades'.padStart(8) +
    'Displaced'.padStart(11)
  )
  console.log('─'.repeat(W))

  let rank = 1
  for (const r of rows) {
    const pnlStr = (r.pnl >= 0 ? '+' : '') + r.pnl.toFixed(2) + '%'
    console.log(
      (' '+rank).padStart(3) + ' ' +
      r.coin.replace('USDT','').padEnd(9) +
      r.regime.padEnd(10) +
      (STRATEGY_LABELS[r.topStrat]??r.topStrat).padEnd(22) +
      (r.winRate.toFixed(1)+'%').padStart(12) +
      pnlStr.padStart(10) +
      (r.mdd.toFixed(1)+'%').padStart(9) +
      String(r.trades).padStart(8) +
      String(r.disp).padStart(11)
    )
    rank++
  }
  console.log('─'.repeat(W))

  const wt       = rows.filter(r => r.trades > 0)
  const totPnl   = rows.reduce((s,r) => s+r.pnl,    0)
  const avgWR    = wt.reduce((s,r) => s+r.winRate,  0) / (wt.length||1)
  const avgDD    = wt.reduce((s,r) => s+r.mdd,      0) / (wt.length||1)
  const totTrd   = rows.reduce((s,r) => s+r.trades,  0)
  const totDisp  = rows.reduce((s,r) => s+r.disp,    0)
  const totRej   = rows.reduce((s,r) => s+r.capRej,  0)
  const profCnt  = rows.filter(r => r.pnl > 0).length

  const B = 66
  console.log('\n  ' + '═'.repeat(B))
  console.log('  ║  FINAL METRICS SUMMARY'.padEnd(B-1) + '║')
  console.log('  ║' + '─'.repeat(B-2) + '║')
  console.log((`  ║  Combined Portfolio PnL    : ${(totPnl>=0?'+':'')+totPnl.toFixed(2)}%`).padEnd(B-1) + '║')
  console.log((`  ║  Average Win Rate          : ${avgWR.toFixed(1)}%`).padEnd(B-1) + '║')
  console.log((`  ║  Average Max DD            : ${avgDD.toFixed(1)}%`).padEnd(B-1) + '║')
  console.log((`  ║  Total Executions          : ${totTrd.toLocaleString()}`).padEnd(B-1) + '║')
  console.log((`  ║  Total Displaced Trades    : ${totDisp.toLocaleString()}`).padEnd(B-1) + '║')
  console.log((`  ║  Total Cap Rejections      : ${totRej.toLocaleString()}`).padEnd(B-1) + '║')
  console.log((`  ║  Profitable Coins          : ${profCnt}/20`).padEnd(B-1) + '║')
  console.log((`  ║  BTC Trending Regime       : ${trendPct}% of 6M bars`).padEnd(B-1) + '║')
  console.log('  ' + '═'.repeat(B) + '\n')
  console.log('  Trending TP=2.5%/SL=1.5% · Ranging TP=1.5%/SL=1.0%')
  console.log('  Trailing SL → Breakeven triggered at TP1 (50% of TP distance)')
  console.log('  Density ranking: strategy firing on most coins gets priority admission\n')
  console.log('✅ Regime-Adaptive Engine simulation complete. Results live on Vercel.\n')
}

main().catch(console.error)
