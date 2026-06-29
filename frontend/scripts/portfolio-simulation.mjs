/**
 * Institutional Portfolio Optimizer — v3 MASTER (3 Upgrades)
 *
 * UPGRADE 1: Dynamic Capital Scaling — Cap 5 → 10 (fractional equity model)
 *            Signals ranked by Cross-Asset Strength Score (density × regime confidence)
 *
 * UPGRADE 2: Risk Shield — Trailing SL at 50% TP → Breakeven (retained)
 *            + Dynamic De-risking: coin DD > 8% → 50% scale for next 5 trades
 *
 * UPGRADE 3: Micro-Regime Tuning for ETH & INJ
 *            - Secondary 1H trend confirmation (EMA21 on aggregated 1H candles)
 *            - SL tightened by 15% (faster bad-trade exit)
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
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const COINS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','DOGEUSDT',
  'UNIUSDT','LTCUSDT','APTUSDT','SUIUSDT','NEARUSDT',
  'OPUSDT','ARBUSDT','INJUSDT','TIAUSDT','SHIBUSDT',
]

// ── UPGRADE 1: Cap 5 → 10 ────────────────────────────────────
const PORT_CAP        = 10
const MAX_HOLD        = 32
const DENSITY_WINDOW  = 10

// ── UPGRADE 3: Coins with micro-regime tuning ─────────────────
const MICRO_TUNED     = new Set(['ETHUSDT','INJUSDT'])
const SL_TIGHTEN      = 0.85   // SL × 0.85 for micro-tuned coins

// ── UPGRADE 2: Dynamic de-risking threshold ───────────────────
const DERISK_DD_THRESHOLD = 8.0   // % coin DD trigger
const DERISK_SCALE        = 0.5   // scale PnL to 50%
const DERISK_TRADE_COUNT  = 5     // trades under reduced size

// Regime TP/SL defaults
const T_TP = 2.5, T_SL = 1.5
const R_TP = 1.5, R_SL = 1.0

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
function rsi(closes, p=14) {
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
function stochRsi(closes, rp=14, sp=14) {
  const r = rsi(closes, rp)
  return r.map((v,i) => {
    if (i < rp+sp-2) return 50
    const sl = r.slice(i-sp+1, i+1), mn = Math.min(...sl), mx = Math.max(...sl)
    return mx===mn ? 50 : (v-mn)/(mx-mn)*100
  })
}
function bollinger(closes, p=20, mult=2) {
  const up=[],lo=[],mid=[],bw=[]
  for (let i = 0; i < closes.length; i++) {
    if (i < p-1) { up.push(0);lo.push(0);mid.push(0);bw.push(999);continue }
    const sl = closes.slice(i-p+1,i+1), avg = sl.reduce((a,b)=>a+b)/p
    const std = Math.sqrt(sl.reduce((s,v)=>s+(v-avg)**2,0)/p)
    up.push(avg+mult*std); lo.push(avg-mult*std); mid.push(avg)
    bw.push(avg>0?(avg+mult*std-(avg-mult*std))/avg*100:0)
  }
  return {up,lo,mid,bw}
}
function vwapArr(candles) {
  let cumTPV=0,cumV=0
  return candles.map(c => {
    const tp=(c.high+c.low+c.close)/3; cumTPV+=tp*c.volume; cumV+=c.volume
    return cumV>0?cumTPV/cumV:tp
  })
}
function computeADX(candles, p=14) {
  const n=candles.length, out=new Array(n).fill(0)
  if (n<p*3) return out
  const tr=[],pdm=[],mdm=[]
  for (let i=1;i<n;i++){
    const h=candles[i].high,l=candles[i].low,pc=candles[i-1].close
    tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))
    const up=h-candles[i-1].high, dn=candles[i-1].low-l
    pdm.push(up>dn&&up>0?up:0); mdm.push(dn>up&&dn>0?dn:0)
  }
  const ws = arr => {
    const o=new Array(arr.length).fill(0)
    let s=arr.slice(0,p).reduce((a,b)=>a+b,0); o[p-1]=s
    for(let i=p;i<arr.length;i++) o[i]=o[i-1]-o[i-1]/p+arr[i]
    return o
  }
  const sTR=ws(tr),sPDM=ws(pdm),sMDM=ws(mdm)
  const diP=sTR.map((t,i)=>t>0?sPDM[i]/t*100:0)
  const diM=sTR.map((t,i)=>t>0?sMDM[i]/t*100:0)
  const dx=diP.map((v,i)=>{const s=v+diM[i];return s>0?Math.abs(v-diM[i])/s*100:0})
  let av=dx.slice(p-1,2*p-1).reduce((a,b)=>a+b,0)/p; out[2*p]=av
  for(let i=2*p+1;i<n;i++){av=(av*(p-1)+dx[i-1])/p;out[i]=av}
  return out
}

// ── UPGRADE 3: 1H trend filter ────────────────────────────────
// Aggregate 15m candles into 1H (every 4 candles), compute EMA(21),
// map back to 15m index so each 15m candle knows its current 1H trend.
function compute1HTrendEMA(candles) {
  // Build 1H close array: use close of last 15m in each 4-candle group
  const closes1h = []
  for (let i = 3; i < candles.length; i += 4) closes1h.push(candles[i].close)
  const ema1h = ema(closes1h, 21)

  // Map each 15m index → its 1H EMA value
  // 15m index i → 1H group floor(i/4), but capped at last available 1H index
  const mapped = new Array(candles.length).fill(0)
  for (let i = 0; i < candles.length; i++) {
    const h = Math.min(Math.floor(i/4), ema1h.length-1)
    mapped[i] = ema1h[h]
  }
  return mapped   // mapped[i] = 1H EMA21 value at 15m index i
}

function precompute(candles, coin) {
  const closes=candles.map(c=>c.close), highs=candles.map(c=>c.high)
  const lows=candles.map(c=>c.low), vols=candles.map(c=>c.volume)
  const bb=bollinger(closes)
  const base = {
    closes,highs,lows,vols,
    e21:ema(closes,21),e55:ema(closes,55),e8:ema(closes,8),
    rsi14:rsi(closes),stochK:stochRsi(closes),
    bbUp:bb.up,bbLo:bb.lo,bbMid:bb.mid,bbBW:bb.bw,
    vwap:vwapArr(candles),
    volSma20:sma(vols,20),hiSma20:sma(highs,20),
    adx:computeADX(candles),
  }
  // UPGRADE 3: add 1H trend EMA for micro-tuned coins
  if (MICRO_TUNED.has(coin)) base.ema1h = compute1HTrendEMA(candles)
  return base
}

// ═══════════════════════════════════════════════════════════════
//  SIGNAL FUNCTIONS (unchanged)
// ═══════════════════════════════════════════════════════════════
const sigEmaCross    = (c,i,p) => i>=60 && p.e21[i-1]<=p.e55[i-1] && p.e21[i]>p.e55[i]
const sigVolMomentum = (c,i,p) => i>=22 && c[i].volume>p.volSma20[i]*2 && c[i].close>c[i].open && c[i].high>p.hiSma20[i-1] && p.e8[i]>p.e21[i]
const sigIctOB       = (c,i,p) => {
  if (i<5) return false
  const ob = c.slice(i-4,i).find(s=>s.open>s.close&&(s.open-s.close)/s.open>0.003)
  return !!ob && c[i].close>ob.open && c[i-1].close<=ob.open
}
const sigStochRsiVol = (c,i,p) => i>=30 && p.stochK[i-1]<20 && p.stochK[i]>20 && c[i].volume>p.volSma20[i]*1.3
const sigBollinger   = (c,i,p) => {
  if (i<22) return false
  const bwSlice=p.bbBW.slice(Math.max(0,i-50),i).filter(v=>v<999)
  const sq=bwSlice.sort((a,b)=>a-b)[Math.floor(bwSlice.length*0.2)]||0
  return p.bbBW[i-1]<=sq && c[i-1].close<=p.bbLo[i-1] && c[i].close>p.bbLo[i]
}
const sigVwap        = (c,i,p) => i>=5 && c[i-1].close<p.vwap[i-1] && c[i].close>p.vwap[i] && p.rsi14[i]<55 && c[i].close>c[i].open

const STRATEGIES = [
  { id:'emaCross',    label:'EMA 21/55 Crossover',    regime:'trending', fn:sigEmaCross    },
  { id:'volMomentum', label:'Volume Momentum',         regime:'trending', fn:sigVolMomentum },
  { id:'ictOB',       label:'ICT Order Block',         regime:'trending', fn:sigIctOB       },
  { id:'stochRsiVol', label:'Stoch RSI + Volume',      regime:'ranging',  fn:sigStochRsiVol },
  { id:'bollinger',   label:'Bollinger Squeeze',       regime:'ranging',  fn:sigBollinger   },
  { id:'vwap',        label:'VWAP Reversion',          regime:'ranging',  fn:sigVwap        },
]

// ── Cross-Asset Strength Score (UPGRADE 1) ────────────────────
// density × (1 + adxBoost) where adxBoost rewards higher ADX certainty
function strengthScore(strat, candles, i, p, adxVal) {
  let density = 0
  const start = Math.max(60, i - DENSITY_WINDOW + 1)
  for (let k = start; k <= i; k++) if (strat.fn(candles, k, p)) density++
  // Regime confidence boost: ADX further from threshold = more confident
  const adxBoost = Math.min(Math.abs(adxVal - 25) / 25, 1.0)
  return density * (1 + adxBoost)
}

// ── LOAD CANDLES ──────────────────────────────────────────────
async function loadCandles(coin) {
  const rows = [], PAGE = 1000; let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('historical_15m_portfolio_data')
      .select('ts,open,high,low,close,volume')
      .eq('coin', coin)
      .order('ts', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    rows.push(...data.map(r => ({ ts:r.ts, open:+r.open, high:+r.high, low:+r.low, close:+r.close, volume:+r.volume })))
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  INSTITUTIONAL PORTFOLIO v3 MASTER — 3 UPGRADES ACTIVE      ║')
  console.log('║  U1: Cap=10 + Strength Score  U2: De-risk DD>8%             ║')
  console.log('║  U3: ETH/INJ 1H Filter + SL×0.85                           ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  // ── Load & precompute ─────────────────────────────────────
  console.log('▸ Loading candle data from Supabase...')
  const coinData = {}, coinIdx = {}
  for (const coin of COINS) {
    process.stdout.write(`  ${coin}...`)
    const candles = await loadCandles(coin)
    coinData[coin] = candles
    coinIdx[coin]  = new Map(candles.map((c,i) => [c.ts, i]))
    process.stdout.write(` ${candles.length} candles\n`)
  }

  console.log('\n▸ Precomputing indicators (incl. 1H EMA for ETH/INJ)...')
  const cache = {}
  for (const coin of COINS) { cache[coin] = precompute(coinData[coin], coin); process.stdout.write('.') }
  console.log(' done\n')

  const btcCandles = coinData['BTCUSDT']
  const btcCache   = cache['BTCUSDT']
  const N = btcCandles.length
  console.log(`▸ Processing ${N} timestamps × ${COINS.length} coins (Cap=${PORT_CAP}, Trailing SL, De-risk, 1H filter)...`)

  // ── Per-coin accumulators ─────────────────────────────────
  const stratTrades  = {}   // coin → stratId → raw pnl[]
  const capRejected  = {}
  const regimeCounts = {}

  // UPGRADE 2: De-risk state per coin
  const derisk = {}   // coin → { cumPnl, peak, ddPct, scale, tradesLeft }

  for (const coin of COINS) {
    stratTrades[coin]  = {}
    for (const s of STRATEGIES) stratTrades[coin][s.id] = []
    capRejected[coin]  = 0
    regimeCounts[coin] = { trending: 0, total: 0 }
    derisk[coin] = { cumPnl: 0, peak: 0, scale: 1.0, tradesLeft: 0 }
  }

  const openPos    = []
  const printEvery = Math.floor(N / 10)

  for (let gi = 60; gi < N - MAX_HOLD - 2; gi++) {
    if (gi % printEvery === 0) process.stdout.write(`  ${Math.round(gi/N*100)}%`)

    const btcTs  = btcCandles[gi].ts
    const adxVal = btcCache.adx[gi]
    const regime = adxVal > 25 ? 'trending' : 'ranging'

    // ── Step 1: Update open positions — trailing SL + de-risk ─
    for (const pos of openPos) {
      if (pos.closed) continue
      const ci = coinIdx[pos.coin].get(btcTs)
      if (ci === undefined) continue
      const c = coinData[pos.coin][ci]

      // UPGRADE 2: Trailing SL → breakeven at 50% TP
      const beTrigger = pos.entryPrice * (1 + pos.tpPct * 0.5 / 100)
      if (!pos.beActivated && c.high >= beTrigger) {
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

      if (result !== null) {
        pos.closed = true

        // UPGRADE 2: Apply de-risk scaling, then update coin DD state
        const d    = derisk[pos.coin]
        const scaled = result * d.scale
        if (d.tradesLeft > 0) {
          d.tradesLeft--
          if (d.tradesLeft === 0) d.scale = 1.0   // restore full size
        }

        // Update cumulative PnL + peak + DD
        d.cumPnl += scaled
        if (d.cumPnl > d.peak) d.peak = d.cumPnl
        const dd = d.peak - d.cumPnl
        if (dd >= DERISK_DD_THRESHOLD && d.scale === 1.0) {
          // Trigger de-risking for next 5 trades
          d.scale      = DERISK_SCALE
          d.tradesLeft = DERISK_TRADE_COUNT
        }

        stratTrades[pos.coin][pos.stratId].push(scaled)
      }
    }
    openPos.splice(0, openPos.length, ...openPos.filter(p => !p.closed))

    // ── Step 2: Collect signals with strength scores ───────────
    const sigs = []
    for (const coin of COINS) {
      const ci = coinIdx[coin].get(btcTs)
      if (ci === undefined || ci < 60) continue
      const candles = coinData[coin], p = cache[coin]
      regimeCounts[coin].total++
      if (regime === 'trending') regimeCounts[coin].trending++

      // UPGRADE 3: 1H trend confirmation gate for ETH & INJ
      const needsHFilter = MICRO_TUNED.has(coin) && p.ema1h
      const bullish1h    = !needsHFilter || (p.ema1h[ci] > 0 && candles[ci].close > p.ema1h[ci])
      if (!bullish1h) continue

      for (const strat of STRATEGIES) {
        if (strat.regime !== regime) continue
        if (!strat.fn(candles, ci, p)) continue
        if (openPos.some(pos => pos.coin === coin && pos.stratId === strat.id)) continue

        // UPGRADE 1: strength score (density × ADX confidence)
        const score = strengthScore(strat, candles, ci, p, adxVal)
        sigs.push({ coin, strat, score, ci })
      }
    }

    // ── Step 3: UPGRADE 1 — rank by strength, apply cap=10 ────
    sigs.sort((a, b) => b.score - a.score)
    const available = PORT_CAP - openPos.length
    for (const sig of sigs.slice(available)) capRejected[sig.coin]++

    for (const sig of sigs.slice(0, available)) {
      const entry  = coinData[sig.coin][sig.ci].close
      let   tp     = regime === 'trending' ? T_TP : R_TP
      let   sl     = regime === 'trending' ? T_SL : R_SL

      // UPGRADE 3: tighten SL by 15% for ETH and INJ
      if (MICRO_TUNED.has(sig.coin)) sl = +(sl * SL_TIGHTEN).toFixed(3)

      openPos.push({
        coin:        sig.coin,
        stratId:     sig.strat.id,
        openGi:      gi,
        entryPrice:  entry,
        tpPrice:     entry * (1 + tp / 100),
        slPrice:     entry * (1 - sl / 100),
        tpPct:       tp,
        slPct:       sl,
        beActivated: false,
        closed:      false,
      })
    }
  }
  console.log('  100%\n')

  // Flush remaining open positions at last candle
  for (const pos of openPos.filter(p => !p.closed)) {
    const lastIdx  = coinData[pos.coin].length - 1
    const rawPnl   = (coinData[pos.coin][lastIdx].close - pos.entryPrice) / pos.entryPrice * 100
    const d        = derisk[pos.coin]
    const scaled   = rawPnl * d.scale
    stratTrades[pos.coin][pos.stratId].push(scaled)
  }

  // ── Aggregate per-strategy results ────────────────────────
  console.log('▸ Aggregating per-strategy results...\n')

  function maxDD(trades) {
    let peak=0, dd=0, cum=0
    for (const t of trades) { cum+=t; if(cum>peak) peak=cum; dd=Math.max(dd,peak-cum) }
    return dd
  }

  const finalRows = []
  for (const coin of COINS) {
    const rc      = regimeCounts[coin]
    const trendPct = rc.total>0 ? Math.round(rc.trending/rc.total*100) : 0
    const domReg  = trendPct>=50 ? 'trending' : 'ranging'

    const summaries = STRATEGIES.map(s => {
      const trades = stratTrades[coin][s.id]
      if (!trades.length) return null
      const wins = trades.filter(t=>t>0).length
      return {
        id:s.id, label:s.label, regime:s.regime,
        trades:trades.length, winRate:(wins/trades.length)*100,
        pnl:trades.reduce((a,b)=>a+b,0), maxDD:maxDD(trades),
      }
    }).filter(Boolean)

    if (!summaries.length) {
      finalRows.push({ coin, trendPct, regime:domReg, bestId:'', stratLabel:'No Signals',
        winRate:0, pnl:0, maxDD:0, trades:0, capRej:capRejected[coin], tp:0, sl:0, allStrats:[] })
      continue
    }

    const best = [...summaries].sort((a,b)=>b.pnl-a.pnl)[0]
    const sl   = MICRO_TUNED.has(coin)
      ? +(domReg==='trending' ? T_SL : R_SL) * SL_TIGHTEN
      : (domReg==='trending' ? T_SL : R_SL)

    finalRows.push({
      coin, trendPct, regime:domReg, bestId:best.id, stratLabel:best.label,
      winRate:best.winRate, pnl:best.pnl, maxDD:best.maxDD,
      trades:best.trades, capRej:capRejected[coin],
      tp:domReg==='trending'?T_TP:R_TP, sl,
      allStrats:summaries,
    })
  }
  finalRows.sort((a,b)=>b.pnl-a.pnl)

  // ── Truncate + save results ────────────────────────────────
  console.log('▸ Truncating portfolio_optimization_results...')
  await supabase.from('portfolio_optimization_results').delete().neq('coin','__never__')
  console.log('▸ Saving v3 results...')
  const { error: saveErr } = await supabase.from('portfolio_optimization_results').upsert(
    finalRows.map(r => ({
      coin:                r.coin,
      regime_pct_trending: r.trendPct,
      selected_regime:     r.regime,
      best_strategy:       r.stratLabel,
      win_rate_pct:        +r.winRate.toFixed(2),
      total_pnl_pct:       +r.pnl.toFixed(2),
      max_drawdown_pct:    +r.maxDD.toFixed(1),
      total_trades:        r.trades,
      cap_rejected_trades: r.capRej,
      tp_pct:              r.tp,
      sl_pct:              r.sl,
      updated_at:          new Date().toISOString(),
    })),
    { onConflict: 'coin' }
  )
  if (saveErr) console.error('  Save error:', saveErr.message)
  else console.log(`  ✓ Saved ${finalRows.length} rows\n`)

  // ── MASTER REPORT v3 ──────────────────────────────────────
  const W   = 126
  const div = '═'.repeat(W)
  console.log('\n' + div)
  console.log('  6-MONTH INSTITUTIONAL PORTFOLIO MASTER v3')
  console.log('  Cap=10 · Trailing SL · Dynamic De-risk (DD>8%) · ETH/INJ 1H Filter + SL×0.85 · Strength Ranking')
  console.log(div)
  const hdr =
    ' # '.padEnd(4)+
    'Coin'.padEnd(10)+
    'Regime'.padEnd(10)+
    'Selected Strategy'.padEnd(26)+
    '6M WinRate'.padStart(11)+
    'Net PnL%'.padStart(10)+
    'Max DD%'.padStart(9)+
    'Trades'.padStart(8)+
    'CapRej'.padStart(8)+
    'TP/SL'.padStart(8)
  console.log(hdr)
  console.log('─'.repeat(W))

  let rank=1
  for (const r of finalRows) {
    const pnlStr = (r.pnl>=0?'+':'')+r.pnl.toFixed(2)+'%'
    const micro  = MICRO_TUNED.has(r.coin) ? '①' : ' '
    console.log(
      (' '+rank).padStart(3)+' '+
      (r.coin.replace('USDT','')+micro).padEnd(10)+
      (r.trendPct+'% Trend').padEnd(10)+
      r.stratLabel.padEnd(26)+
      (r.winRate.toFixed(1)+'%').padStart(11)+
      pnlStr.padStart(10)+
      (r.maxDD.toFixed(1)+'%').padStart(9)+
      String(r.trades).padStart(8)+
      String(r.capRej).padStart(8)+
      (r.tp+'/'+r.sl).padStart(8)
    )
    for (const s of r.allStrats.sort((a,b)=>b.pnl-a.pnl)) {
      const star = s.id===r.bestId ? '★' : ' '
      console.log(
        '     '+star+' '+
        s.label.padEnd(24)+
        (s.winRate.toFixed(1)+'%').padStart(9)+
        ((s.pnl>=0?'+':'')+s.pnl.toFixed(2)+'%').padStart(10)+
        (s.maxDD.toFixed(1)+'%').padStart(9)+
        ('('+s.trades+'T)').padStart(10)
      )
    }
    rank++
  }

  console.log('─'.repeat(W))
  const totPnl     = finalRows.reduce((s,r)=>s+r.pnl,0)
  const withTrades = finalRows.filter(r=>r.trades>0)
  const avgWR      = withTrades.reduce((s,r)=>s+r.winRate,0)/(withTrades.length||1)
  const totTrades  = finalRows.reduce((s,r)=>s+r.trades,0)
  const totRej     = finalRows.reduce((s,r)=>s+r.capRej,0)
  const avgDD      = withTrades.reduce((s,r)=>s+r.maxDD,0)/(withTrades.length||1)
  const profitable = finalRows.filter(r=>r.pnl>0).length
  console.log(`  PORTFOLIO SUMMARY`)
  console.log(`  Combined PnL:     ${totPnl>=0?'+':''}${totPnl.toFixed(2)}%`)
  console.log(`  Avg Win Rate:     ${avgWR.toFixed(1)}%`)
  console.log(`  Avg Max DD:       ${avgDD.toFixed(1)}%`)
  console.log(`  Cap Rejections:   ${totRej.toLocaleString()}  (was 10,318 in v2)`)
  console.log(`  Total Trades:     ${totTrades}`)
  console.log(`  Profitable Coins: ${profitable}/20`)
  console.log(div+'\n')
  console.log('  ① = Micro-tuned (ETH/INJ): 1H trend filter + SL×0.85\n')
  console.log('✅ v3 MASTER simulation complete. Results saved to portfolio_optimization_results.\n')
}

main().catch(console.error)
