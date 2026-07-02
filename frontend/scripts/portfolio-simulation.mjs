/**
 * ALPHA QUALITY ENGINE v3
 *
 * 3 focused, mathematically sound strategies:
 *
 *  1. EMA PULLBACK  — uptrending coins only (EMA8>EMA21>EMA55)
 *                     price pulls to EMA21 then bounces
 *                     TP = 2.5×ATR  SL = 1.0×ATR  → 2.5:1 ratio
 *
 *  2. BB REVERSION  — ranging coins (ADX < 22)
 *                     price touches lower BB + RSI < 35
 *                     TP = middle BB (SMA20)  SL = 1.0×ATR
 *                     ONLY if TP:SL ≥ 1.5 (else skip)
 *
 *  3. VOL BREAKOUT  — all coins
 *                     new 48-bar high + volume > 2×avg + ADX > 15
 *                     TP = 3.0×ATR  SL = 1.2×ATR  → 2.5:1 ratio
 *
 *  SKIP RULE: if coin in clear downtrend (EMA8 < EMA21 by >1.5%) → skip
 *
 *  Portfolio: Cap=5, density ranking, trailing SL at 50% TP distance
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

// CLI args
const args      = process.argv.slice(2)
const argMap    = {}
for (let i = 0; i < args.length; i += 2) argMap[args[i]] = args[i+1]
const RUN_ID    = argMap['--runId']    ?? `run_${Date.now()}`
const START_ARG = argMap['--start']    ?? null
const END_ARG   = argMap['--end']      ?? null

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const COINS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','DOGEUSDT',
  'UNIUSDT','LTCUSDT','APTUSDT','SUIUSDT','NEARUSDT',
  'OPUSDT','ARBUSDT','INJUSDT','TIAUSDT','SHIBUSDT',
]

const PORT_CAP   = 5
const MAX_HOLD_S = 48    // EMA Pullback max candles (~12h)
const MAX_HOLD_B = 32    // BB Reversion max candles (~8h)
const MAX_HOLD_V = 64    // Vol Breakout max candles (~16h)

const S = { EMA_PB: 'emaPullback', BB_REV: 'bbReversion', VOL_BRK: 'volBreakout' }

const LABELS = {
  [S.EMA_PB]:  'EMA Pullback',
  [S.BB_REV]:  'BB Reversion',
  [S.VOL_BRK]: 'Vol Breakout',
}

// ── INDICATORS ────────────────────────────────────────────────────────────────
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
  let ag=0, al=0
  for (let i=1; i<=p; i++) { const d=closes[i]-closes[i-1]; if(d>0) ag+=d; else al-=d }
  ag/=p; al/=p; out[p] = al===0?100:100-100/(1+ag/al)
  for (let i=p+1; i<closes.length; i++) {
    const d=closes[i]-closes[i-1]
    ag=(ag*(p-1)+Math.max(d,0))/p; al=(al*(p-1)+Math.max(-d,0))/p
    out[i]=al===0?100:100-100/(1+ag/al)
  }
  return out
}
function bollingerBands(closes, p=20, mult=2) {
  const up=[],lo=[],mid=[],bw=[]
  for (let i=0; i<closes.length; i++) {
    if (i<p-1) { up.push(0);lo.push(0);mid.push(0);bw.push(999);continue }
    const sl=closes.slice(i-p+1,i+1)
    const avg=sl.reduce((a,b)=>a+b)/p
    const std=Math.sqrt(sl.reduce((s,v)=>s+(v-avg)**2,0)/p)
    up.push(avg+mult*std); lo.push(avg-mult*std)
    mid.push(avg)
    bw.push(avg>0?(mult*2*std)/avg*100:0)
  }
  return {up,lo,mid,bw}
}
function atrSeries(candles, p=14) {
  const out=new Array(candles.length).fill(0)
  let smooth=0, sum=0
  for (let i=1; i<candles.length; i++) {
    const tr=Math.max(
      candles[i].high-candles[i].low,
      Math.abs(candles[i].high-candles[i-1].close),
      Math.abs(candles[i].low -candles[i-1].close)
    )
    if      (i<p)   sum+=tr
    else if (i===p) { smooth=(sum+tr)/p; out[i]=smooth }
    else            { smooth=(smooth*(p-1)+tr)/p; out[i]=smooth }
  }
  return out
}
function adxSeries(candles, p=14) {
  const n=candles.length, out=new Array(n).fill(0)
  if (n<p*3) return out
  const tr=[],pdm=[],mdm=[]
  for (let i=1; i<n; i++) {
    const h=candles[i].high,l=candles[i].low,pc=candles[i-1].close
    tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))
    const up=h-candles[i-1].high, dn=candles[i-1].low-l
    pdm.push(up>dn&&up>0?up:0); mdm.push(dn>up&&dn>0?dn:0)
  }
  const ws=arr => {
    const o=new Array(arr.length).fill(0)
    let s=arr.slice(0,p).reduce((a,b)=>a+b,0); o[p-1]=s
    for (let i=p; i<arr.length; i++) o[i]=o[i-1]-o[i-1]/p+arr[i]
    return o
  }
  const sTR=ws(tr),sPDM=ws(pdm),sMDM=ws(mdm)
  const diP=sTR.map((t,i)=>t>0?sPDM[i]/t*100:0)
  const diM=sTR.map((t,i)=>t>0?sMDM[i]/t*100:0)
  const dx=diP.map((v,i)=>{const s=v+diM[i];return s>0?Math.abs(v-diM[i])/s*100:0})
  let av=dx.slice(p-1,2*p-1).reduce((a,b)=>a+b,0)/p; out[2*p]=av
  for (let i=2*p+1; i<n; i++) { av=(av*(p-1)+dx[i-1])/p; out[i]=av }
  return out
}

function precompute(candles) {
  const closes = candles.map(c=>c.close)
  const vols   = candles.map(c=>c.volume)
  const bb     = bollingerBands(closes)
  const volSma = sma(vols, 20)
  return {
    closes,
    opens:   candles.map(c=>c.open),
    vols,
    e8:      ema(closes,8),
    e21:     ema(closes,21),
    e55:     ema(closes,55),
    rsi14:   rsiArr(closes),
    bbUp:    bb.up,
    bbLo:    bb.lo,
    bbMid:   bb.mid,
    bbBW:    bb.bw,
    atr14:   atrSeries(candles),
    adx:     adxSeries(candles),
    volSma,
    hi48:    closes.map((_,i) => i<47 ? 0 : Math.max(...closes.slice(i-47,i))),
  }
}

// ── SIGNAL FUNCTIONS ──────────────────────────────────────────────────────────

// 1. EMA PULLBACK LONG
function sigEmaPullback(i, ind) {
  if (i < 60) return false
  const { closes, opens, e8, e21, e55, rsi14, vols, volSma, adx } = ind
  if (e8[i] < e21[i] * 0.985) return false       // downtrend guard
  if (e8[i] <= e21[i] || e21[i] <= e55[i]) return false  // full alignment
  if (adx[i] < 16) return false
  if (rsi14[i] < 42 || rsi14[i] > 70) return false
  const prevPct = (closes[i-1] - e21[i-1]) / e21[i-1] * 100
  if (prevPct > 1.0 || prevPct < -2.0) return false
  if (closes[i] <= e8[i]) return false
  if (closes[i-1] > e8[i-1]) return false
  if (vols[i] < volSma[i] * 1.1) return false
  if (closes[i] <= opens[i]) return false
  return true
}

// 2. BB LOWER REVERSION
function sigBBReversion(i, ind) {
  if (i < 25) return false
  const { closes, opens, bbLo, bbMid, rsi14, atr14, adx } = ind
  if (adx[i] > 22) return false
  if (closes[i] > bbLo[i] * 1.004) return false
  if (rsi14[i] >= 35) return false
  const atr = atr14[i]
  if (atr <= 0) return false
  const tpDist = bbMid[i] - closes[i]
  const slDist = atr
  if (tpDist <= 0) return false
  if (tpDist / slDist < 1.5) return false
  if (closes[i-1] < bbLo[i-1] * 0.985) return false
  return true
}

// 3. VOLUME BREAKOUT
function sigVolBreakout(i, ind) {
  if (i < 50) return false
  const { closes, opens, e21, vols, volSma, adx, atr14, hi48 } = ind
  if (closes[i] < e21[i] * 0.99) return false
  if (closes[i] <= hi48[i]) return false
  if (vols[i] < volSma[i] * 2.0) return false
  if (adx[i] < 15) return false
  if (closes[i] <= opens[i]) return false
  if (atr14[i] <= 0) return false
  return true
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
async function loadCandles(coin) {
  const rows = []
  const PAGE = 1000
  let from = 0
  let q = supabase.from('historical_15m_portfolio_data')
    .select('ts,open,high,low,close,volume')
    .eq('coin', coin)
    .order('ts', { ascending: true })
  if (START_ARG) q = q.gte('ts', START_ARG)
  if (END_ARG)   q = q.lte('ts', END_ARG + 'T23:59:59Z')
  while (true) {
    const { data, error } = await q.range(from, from+PAGE-1)
    if (error) throw error
    if (!data?.length) break
    for (const r of data) rows.push({
      ts: r.ts, open: +r.open, high: +r.high, low: +r.low,
      close: +r.close, volume: +r.volume,
    })
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

function maxDD(trades) {
  let peak=0, dd=0, cum=0
  for (const t of trades) {
    cum+=t; if(cum>peak) peak=cum
    const d=peak-cum; if(d>dd) dd=d
  }
  return dd
}

async function updateProgress(pct) {
  await supabase.from('backtest_runs')
    .update({ progress_pct: pct, updated_at: new Date().toISOString() })
    .eq('run_id', RUN_ID)
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '╔' + '═'.repeat(72) + '╗')
  console.log('║  ALPHA QUALITY ENGINE v3 — BACKTEST' + ' '.repeat(35) + '║')
  console.log('║  EMA Pullback · BB Reversion · Vol Breakout · ATR TP/SL' + ' '.repeat(14) + '║')
  console.log('╚' + '═'.repeat(72) + '╝\n')
  console.log(`  Run ID : ${RUN_ID}`)
  console.log(`  Range  : ${START_ARG ?? 'all'} → ${END_ARG ?? 'all'}\n`)

  await supabase.from('backtest_runs')
    .update({ status: 'running', updated_at: new Date().toISOString(), engine: 'alpha-quality-v3' })
    .eq('run_id', RUN_ID)

  console.log('▸ Loading candles from Supabase...')
  const coinData = {}
  for (const coin of COINS) {
    coinData[coin] = await loadCandles(coin)
    process.stdout.write(`  ${coin.padEnd(10)}... ${coinData[coin].length}\n`)
  }

  console.log('\n▸ Precomputing indicators...')
  const indicators = {}
  for (const coin of COINS) {
    indicators[coin] = precompute(coinData[coin])
    process.stdout.write('.')
  }
  console.log(' done\n')

  const N = coinData['BTCUSDT'].length
  if (N < 100) { console.error('  ✗ No data — run fetch-data.mjs first'); process.exit(1) }
  console.log(`▸ Timeline: ${N} bars × ${COINS.length} coins\n`)

  const coinTrades   = Object.fromEntries(COINS.map(c => [c, []]))
  const coinStratMap = Object.fromEntries(COINS.map(c => [c, {}]))
  const coinCapRej   = Object.fromEntries(COINS.map(c => [c, 0]))
  const coinActive   = Object.fromEntries(COINS.map(c => [c, null]))

  let openPos = []
  let lastPct = 0
  await updateProgress(0)

  for (let gi = 0; gi < N; gi++) {
    const pct = Math.floor(gi / N * 100)
    if (pct >= lastPct + 10) {
      lastPct = pct
      process.stdout.write(`  ${pct}%  `)
      await updateProgress(pct)
    }

    // Update open positions
    for (const pos of openPos) {
      if (pos.closed) continue
      const cd = coinData[pos.coin]
      if (gi >= cd.length) continue
      const candle = cd[gi]

      if (!pos.beActivated) {
        const halfTP = pos.entryPrice + (pos.tpPrice - pos.entryPrice) * 0.5
        if (candle.high >= halfTP) {
          pos.slPrice     = Math.max(pos.slPrice, pos.entryPrice * 1.001)
          pos.beActivated = true
        }
      }

      let pnl = null
      if      (candle.low  <= pos.slPrice)                  pnl = (pos.slPrice  - pos.entryPrice) / pos.entryPrice * 100
      else if (candle.high >= pos.tpPrice)                  pnl = (pos.tpPrice  - pos.entryPrice) / pos.entryPrice * 100
      else if (gi - pos.openGi >= pos.maxHold)              pnl = (candle.close - pos.entryPrice) / pos.entryPrice * 100

      if (pnl !== null) {
        pos.closed = true
        coinTrades[pos.coin].push(pnl)
        coinStratMap[pos.coin][pos.stratId] = (coinStratMap[pos.coin][pos.stratId]??0)+1
        coinActive[pos.coin] = null
      }
    }
    openPos = openPos.filter(p => !p.closed)

    // Collect signals
    const signals = []
    for (const coin of COINS) {
      const ind = indicators[coin]
      if (gi >= coinData[coin].length) continue
      if (coinActive[coin] !== null) continue
      const close = ind.closes[gi]
      const atr   = ind.atr14[gi]
      if (atr <= 0 || close <= 0) continue

      if (sigEmaPullback(gi, ind)) {
        signals.push({ coin, stratId: S.EMA_PB,
          entry: close, tp: close + 2.5*atr, sl: close - 1.0*atr,
          score: ind.vols[gi]/(ind.volSma[gi]||1), maxHold: MAX_HOLD_S })
      }
      if (sigBBReversion(gi, ind)) {
        const tp = ind.bbMid[gi], sl = close - 1.0*atr
        if (tp > close && sl < close)
          signals.push({ coin, stratId: S.BB_REV,
            entry: close, tp, sl,
            score: (tp-close)/(close-sl), maxHold: MAX_HOLD_B })
      }
      if (sigVolBreakout(gi, ind)) {
        signals.push({ coin, stratId: S.VOL_BRK,
          entry: close, tp: close + 3.0*atr, sl: close - 1.2*atr,
          score: ind.vols[gi]/(ind.volSma[gi]||1), maxHold: MAX_HOLD_V })
      }
    }

    if (!signals.length) continue

    // Density ranking
    const density = {}
    for (const sig of signals) density[sig.stratId] = (density[sig.stratId]??0)+1
    signals.sort((a, b) => {
      const dd = (density[b.stratId]??0) - (density[a.stratId]??0)
      return dd !== 0 ? dd : b.score - a.score
    })

    for (const sig of signals) {
      if (coinActive[sig.coin] !== null) continue
      if (openPos.length < PORT_CAP) {
        openPos.push({
          coin: sig.coin, stratId: sig.stratId, openGi: gi,
          entryPrice: sig.entry, tpPrice: sig.tp, slPrice: sig.sl,
          beActivated: false, closed: false, maxHold: sig.maxHold,
        })
        coinActive[sig.coin] = sig.stratId
      } else {
        coinCapRej[sig.coin]++
      }
    }
  }
  process.stdout.write('  100%\n\n')
  await updateProgress(100)

  // Flush remaining
  for (const pos of openPos.filter(p => !p.closed)) {
    const cd  = coinData[pos.coin]
    const pnl = (cd[cd.length-1].close - pos.entryPrice) / pos.entryPrice * 100
    coinTrades[pos.coin].push(pnl)
    coinStratMap[pos.coin][pos.stratId] = (coinStratMap[pos.coin][pos.stratId]??0)+1
  }

  // Build rows
  const rows = COINS.map(coin => {
    const t = coinTrades[coin]
    const topStrat = Object.entries(coinStratMap[coin]).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? 'N/A'
    const ind = indicators[coin], lastI = coinData[coin].length-1
    const regime = (ind.e8[lastI] > ind.e21[lastI] && ind.adx[lastI] > 18) ? 'Trending' : 'Ranging'
    if (!t.length) return { coin, regime, topStrat, trades:0, winRate:0, pnl:0, mdd:0, capRej:coinCapRej[coin], disp:0 }
    const wins = t.filter(v=>v>0).length
    return { coin, regime, topStrat, trades:t.length, winRate:wins/t.length*100,
             pnl:t.reduce((a,b)=>a+b,0), mdd:maxDD(t), capRej:coinCapRej[coin], disp:0 }
  }).sort((a,b) => b.pnl-a.pnl)

  // Save
  console.log('▸ Saving results...')
  const trendPct = +(rows.filter(r=>r.regime==='Trending').length/COINS.length*100).toFixed(1)
  const { error: saveErr } = await supabase.from('portfolio_optimization_results').upsert(
    rows.map(r => ({
      coin: r.coin, regime_pct_trending: trendPct,
      selected_regime: r.regime.toLowerCase(),
      best_strategy: LABELS[r.topStrat] ?? r.topStrat,
      win_rate_pct: +r.winRate.toFixed(2), total_pnl_pct: +r.pnl.toFixed(2),
      max_drawdown_pct: +r.mdd.toFixed(1), total_trades: r.trades,
      cap_rejected_trades: r.capRej, tp_pct: 0, sl_pct: 0,
      updated_at: new Date().toISOString(), run_id: RUN_ID,
    })),
    { onConflict: 'coin' }
  )
  if (saveErr) console.error('  Save error:', saveErr.message)
  else         console.log(`  ✓ ${rows.length} coin results saved\n`)

  const totPnl  = rows.reduce((s,r)=>s+r.pnl, 0)
  const totTrd  = rows.reduce((s,r)=>s+r.trades, 0)
  const totRej  = rows.reduce((s,r)=>s+r.capRej, 0)
  const profCnt = rows.filter(r=>r.pnl>0).length
  const wt      = rows.filter(r=>r.trades>0)
  const avgWR   = wt.reduce((s,r)=>s+r.winRate,0)/(wt.length||1)
  const avgDD   = wt.reduce((s,r)=>s+r.mdd,0)/(wt.length||1)

  await supabase.from('backtest_runs').update({
    status: 'completed', progress_pct: 100,
    total_candles: N*COINS.length, total_signals: totTrd+totRej,
    cap_rejected: totRej, displaced: 0,
    results_summary: { combinedPnl: +totPnl.toFixed(2), avgWinRate: +avgWR.toFixed(1),
      avgMaxDD: +avgDD.toFixed(1), totalTrades: totTrd, profitableCoins: profCnt, engine: 'alpha-quality-v3' },
    completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('run_id', RUN_ID)

  // Report
  const W = 110
  console.log('═'.repeat(W))
  console.log('  ALPHA QUALITY ENGINE v3 — 6-MONTH MASTER REPORT')
  console.log(`  Run: ${RUN_ID}`)
  console.log('═'.repeat(W))
  console.log(' # '.padEnd(4)+'Coin'.padEnd(9)+'Regime'.padEnd(10)+'Strategy'.padEnd(16)+
    'Win%'.padStart(8)+'Net PnL%'.padStart(11)+'Max DD%'.padStart(9)+'Trades'.padStart(8)+'CapRej'.padStart(8))
  console.log('─'.repeat(W))
  rows.forEach((r,idx) => {
    const pnlStr = (r.pnl>=0?'+':'')+r.pnl.toFixed(2)+'%'
    console.log((' '+(idx+1)).padStart(3)+' '+r.coin.replace('USDT','').padEnd(9)+
      r.regime.padEnd(10)+(LABELS[r.topStrat]??r.topStrat).padEnd(16)+
      (r.winRate.toFixed(1)+'%').padStart(8)+pnlStr.padStart(11)+
      (r.mdd.toFixed(1)+'%').padStart(9)+String(r.trades).padStart(8)+String(r.capRej).padStart(8))
  })
  console.log('─'.repeat(W))
  const B = 68
  console.log('\n  '+'═'.repeat(B))
  console.log(`  ║  Combined Portfolio PnL   : ${(totPnl>=0?'+':'')+totPnl.toFixed(2)}%`.padEnd(B-1)+'║')
  console.log(`  ║  Average Win Rate         : ${avgWR.toFixed(1)}%`.padEnd(B-1)+'║')
  console.log(`  ║  Average Max Drawdown     : ${avgDD.toFixed(1)}%`.padEnd(B-1)+'║')
  console.log(`  ║  Total Executions         : ${totTrd.toLocaleString()}`.padEnd(B-1)+'║')
  console.log(`  ║  Total Cap Rejections     : ${totRej.toLocaleString()}`.padEnd(B-1)+'║')
  console.log(`  ║  Profitable Coins         : ${profCnt}/20`.padEnd(B-1)+'║')
  console.log('  '+'═'.repeat(B))
  console.log('\n✅ Run complete — results live on dashboard.\n')
}

main().catch(console.error)
