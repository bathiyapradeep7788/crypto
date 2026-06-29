/**
 * Institutional Portfolio Optimizer — 6-Month Dynamic Regime-Filtered Engine
 *
 * Architecture:
 *  - ADX(14) on BTCUSDT determines market regime per 15m candle
 *  - Trending (ADX > 25): EMA Cross, Volume Momentum, ICT Order Block
 *  - Ranging  (ADX ≤ 25): Stoch RSI+Vol, Bollinger Squeeze, VWAP Reversion
 *  - Portfolio Cap: max 3 concurrent open positions across all 20 coins
 *  - Ranking: signal density score (signals fired in last 10 candles)
 *  - Independent TP/SL simulation per accepted signal
 *  - Results saved to portfolio_optimization_results (separate table)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Load .env ─────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url))
const envRaw = readFileSync(join(__dir, '../../.env'), 'utf8')
const env = Object.fromEntries(
  envRaw.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const idx = l.indexOf('='); return [l.slice(0,idx).trim(), l.slice(idx+1).trim()] })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const COINS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','DOGEUSDT',
  'UNIUSDT','LTCUSDT','APTUSDT','SUIUSDT','NEARUSDT',
  'OPUSDT','ARBUSDT','INJUSDT','TIAUSDT',
  // MATICUSDT excluded — no data in Supabase
]

// ── Regime TP/SL ──────────────────────────────────────────────
const T_TP = 2.5, T_SL = 1.5   // Trending
const R_TP = 1.5, R_SL = 1.0   // Ranging
const MAX_HOLD  = 32             // candles before timeout exit
const PORT_CAP  = 3              // max concurrent open positions
const DENSITY_WINDOW = 10        // candles back for signal density score

// ═══════════════════════════════════════════════════════════════
//  INDICATORS (pure math, precomputed per coin)
// ═══════════════════════════════════════════════════════════════

function ema(arr, p) {
  const k = 2/(p+1), out = new Array(arr.length).fill(0)
  let s = 0; for (let i=0;i<p;i++) s+=arr[i]; out[p-1]=s/p
  for (let i=p;i<arr.length;i++) out[i]=arr[i]*k+out[i-1]*(1-k)
  return out
}
function sma(arr, p) {
  return arr.map((_,i)=>{ if(i<p-1)return 0; let s=0; for(let j=i-p+1;j<=i;j++) s+=arr[j]; return s/p })
}
function rsi(closes, p=14) {
  const out=new Array(closes.length).fill(50)
  let ag=0,al=0
  for(let i=1;i<=p;i++){const d=closes[i]-closes[i-1];if(d>0)ag+=d;else al-=d}
  ag/=p;al/=p; out[p]=al===0?100:100-100/(1+ag/al)
  for(let i=p+1;i<closes.length;i++){
    const d=closes[i]-closes[i-1]
    ag=(ag*(p-1)+Math.max(d,0))/p; al=(al*(p-1)+Math.max(-d,0))/p
    out[i]=al===0?100:100-100/(1+ag/al)
  }
  return out
}
function stochRsi(closes, rp=14, sp=14) {
  const r=rsi(closes,rp)
  return r.map((v,i)=>{
    if(i<rp+sp-2)return 50
    const sl=r.slice(i-sp+1,i+1),mn=Math.min(...sl),mx=Math.max(...sl)
    return mx===mn?50:(v-mn)/(mx-mn)*100
  })
}
function bollinger(closes, p=20, mult=2) {
  const up=[],lo=[],mid=[],bw=[]
  for(let i=0;i<closes.length;i++){
    if(i<p-1){up.push(0);lo.push(0);mid.push(0);bw.push(999);continue}
    const sl=closes.slice(i-p+1,i+1),avg=sl.reduce((a,b)=>a+b)/p
    const std=Math.sqrt(sl.reduce((s,v)=>s+(v-avg)**2,0)/p)
    up.push(avg+mult*std);lo.push(avg-mult*std);mid.push(avg)
    bw.push(avg>0?(avg+mult*std-(avg-mult*std))/avg*100:0)
  }
  return {up,lo,mid,bw}
}
function vwapArr(candles) {
  let cumTPV=0,cumV=0; return candles.map(c=>{
    const tp=(c.high+c.low+c.close)/3; cumTPV+=tp*c.volume; cumV+=c.volume
    return cumV>0?cumTPV/cumV:tp
  })
}

// ADX with Wilder smoothing
function computeADX(candles, p=14) {
  const n=candles.length, adxOut=new Array(n).fill(0)
  if(n<p*3) return adxOut
  const tr=[],pdm=[],mdm=[]
  for(let i=1;i<n;i++){
    const h=candles[i].high,l=candles[i].low,pc=candles[i-1].close,pH=candles[i-1].high,pL=candles[i-1].low
    tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))
    const up=h-pH,dn=pL-l
    pdm.push(up>dn&&up>0?up:0); mdm.push(dn>up&&dn>0?dn:0)
  }
  function ws(arr){ // Wilder smoothing
    const out=new Array(arr.length).fill(0)
    let s=arr.slice(0,p).reduce((a,b)=>a+b,0); out[p-1]=s
    for(let i=p;i<arr.length;i++) out[i]=out[i-1]-out[i-1]/p+arr[i]
    return out
  }
  const sTR=ws(tr),sPDM=ws(pdm),sMDM=ws(mdm)
  const diP=sTR.map((t,i)=>t>0?sPDM[i]/t*100:0)
  const diM=sTR.map((t,i)=>t>0?sMDM[i]/t*100:0)
  const dx=diP.map((pv,i)=>{const s=pv+diM[i];return s>0?Math.abs(pv-diM[i])/s*100:0})
  // ADX = Wilder smooth of DX
  let av=dx.slice(p-1,2*p-1).reduce((a,b)=>a+b,0)/p; adxOut[2*p]=av
  for(let i=2*p+1;i<n;i++){av=(av*(p-1)+dx[i-1])/p;adxOut[i]=av}
  return adxOut
}

// ═══════════════════════════════════════════════════════════════
//  PRECOMPUTE cache per coin
// ═══════════════════════════════════════════════════════════════

function precompute(candles) {
  const closes=candles.map(c=>c.close),highs=candles.map(c=>c.high)
  const lows=candles.map(c=>c.low),vols=candles.map(c=>c.volume)
  const bb=bollinger(closes)
  return {
    closes,highs,lows,vols,
    e21:ema(closes,21),e55:ema(closes,55),e8:ema(closes,8),
    rsi14:rsi(closes),stochK:stochRsi(closes),
    bbUp:bb.up,bbLo:bb.lo,bbMid:bb.mid,bbBW:bb.bw,
    vwap:vwapArr(candles),
    volSma20:sma(vols,20),hiSma20:sma(highs,20),
    adx:computeADX(candles),
  }
}

// ═══════════════════════════════════════════════════════════════
//  SIGNAL FUNCTIONS — per candle index i
// ═══════════════════════════════════════════════════════════════

// TRENDING strategies
function sigEmaCross(candles,i,p)   { return i>=60&&p.e21[i-1]<=p.e55[i-1]&&p.e21[i]>p.e55[i] }
function sigVolMomentum(candles,i,p){ return i>=22&&candles[i].volume>p.volSma20[i]*2&&candles[i].close>candles[i].open&&candles[i].high>p.hiSma20[i-1]&&p.e8[i]>p.e21[i] }
function sigIctOB(candles,i,p) {
  if(i<5)return false
  const slice=candles.slice(i-4,i)
  const ob=slice.find(s=>s.open>s.close&&(s.open-s.close)/s.open>0.003)
  return !!ob&&candles[i].close>ob.open&&candles[i-1].close<=ob.open
}

// RANGING strategies
function sigStochRsiVol(candles,i,p){ return i>=30&&p.stochK[i-1]<20&&p.stochK[i]>20&&candles[i].volume>p.volSma20[i]*1.3 }
function sigBollinger(candles,i,p) {
  if(i<22)return false
  const bwSlice=p.bbBW.slice(Math.max(0,i-50),i).filter(v=>v<999)
  const sq=bwSlice.sort((a,b)=>a-b)[Math.floor(bwSlice.length*0.2)]||0
  return p.bbBW[i-1]<=sq&&candles[i-1].close<=p.bbLo[i-1]&&candles[i].close>p.bbLo[i]
}
function sigVwap(candles,i,p)       { return i>=5&&candles[i-1].close<p.vwap[i-1]&&candles[i].close>p.vwap[i]&&p.rsi14[i]<55&&candles[i].close>candles[i].open }

const TRENDING_SIGS = [sigEmaCross, sigVolMomentum, sigIctOB]
const RANGING_SIGS  = [sigStochRsiVol, sigBollinger, sigVwap]

function getStrategyLabel(regime, signals, candles, i, p) {
  const fns = regime==='trending' ? TRENDING_SIGS : RANGING_SIGS
  const lblsT = ['EMA 21/55 Crossover','Volume Momentum','ICT Order Block']
  const lblsR = ['Stoch RSI + Volume','Bollinger Squeeze','VWAP Reversion']
  const lbls = regime==='trending' ? lblsT : lblsR
  for (let k=0;k<fns.length;k++) if(fns[k](candles,i,p)) return lbls[k]
  return 'Mixed'
}

function hasSignal(regime, candles, i, p) {
  const fns = regime==='trending' ? TRENDING_SIGS : RANGING_SIGS
  return fns.some(fn=>fn(candles,i,p))
}

function signalDensity(regime, candles, i, p) {
  const fns = regime==='trending' ? TRENDING_SIGS : RANGING_SIGS
  let count=0, start=Math.max(60,i-DENSITY_WINDOW+1)
  for(let k=start;k<=i;k++) count+=fns.filter(fn=>fn(candles,k,p)).length
  return count
}

// ═══════════════════════════════════════════════════════════════
//  TRADE SIMULATION — independent, TP vs SL by candle direction
// ═══════════════════════════════════════════════════════════════

function simulateTrade(candles, entryIdx, tpPct, slPct) {
  const entry=candles[entryIdx].close
  const tp=entry*(1+tpPct/100), sl=entry*(1-slPct/100)
  for(let j=entryIdx+1;j<Math.min(entryIdx+MAX_HOLD+1,candles.length);j++){
    const {high,low,open,close}=candles[j]
    if(high>=tp&&low<=sl) return close>=open?tpPct:-slPct
    if(high>=tp) return tpPct
    if(low<=sl)  return -slPct
  }
  const ex=Math.min(entryIdx+MAX_HOLD,candles.length-1)
  return (candles[ex].close-entry)/entry*100
}

// ═══════════════════════════════════════════════════════════════
//  LOAD CANDLES FROM SUPABASE
// ═══════════════════════════════════════════════════════════════

async function loadCandles(coin) {
  const rows=[], PAGE=1000; let from=0
  while(true){
    const {data,error}=await supabase.from('historical_15m_portfolio_data')
      .select('ts,open,high,low,close,volume').eq('coin',coin)
      .order('ts',{ascending:true}).range(from,from+PAGE-1)
    if(error||!data||data.length===0) break
    rows.push(...data.map(r=>({ts:r.ts,open:+r.open,high:+r.high,low:+r.low,close:+r.close,volume:+r.volume})))
    if(data.length<PAGE) break
    from+=PAGE
  }
  return rows
}

// ═══════════════════════════════════════════════════════════════
//  MAIN SIMULATION
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║   INSTITUTIONAL PORTFOLIO OPTIMIZER — 6-MONTH REGIME ENGINE  ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  // ── Load all coin data ──────────────────────────────────────
  console.log('▸ Loading candle data from Supabase...')
  const coinData = {}
  const coinIdx  = {}   // coin → Map<ts, array_index>

  for (const coin of COINS) {
    process.stdout.write(`  ${coin}...`)
    const candles = await loadCandles(coin)
    coinData[coin] = candles
    coinIdx[coin]  = new Map(candles.map((c,i)=>[c.ts,i]))
    process.stdout.write(` ${candles.length} candles\n`)
  }

  // ── Precompute indicators per coin ─────────────────────────
  console.log('\n▸ Precomputing indicators (EMA/RSI/BB/VWAP/ADX)...')
  const cache = {}
  for (const coin of COINS) { cache[coin] = precompute(coinData[coin]); process.stdout.write(`.`) }
  console.log(' done\n')

  // ── Use BTC timestamps as global timeline reference ─────────
  const btcCandles = coinData['BTCUSDT']
  const btcCache   = cache['BTCUSDT']
  const N = btcCandles.length
  console.log(`▸ Processing global timeline: ${N} timestamps × ${COINS.length} coins...`)

  // ── Per-coin stats ──────────────────────────────────────────
  const stats = {}
  for (const coin of COINS) {
    stats[coin] = {
      trades:[], capRejected:0, trendingCandles:0, totalCandles:0,
      labels:{}, strategyLabel:'Mixed'
    }
  }

  // ── Portfolio position tracker ──────────────────────────────
  // pos: { coin, globalIdx, tpPrice, slPrice, tpPct, slPct, closed:false }
  const openPos = []

  // ── Timeline loop ───────────────────────────────────────────
  const printEvery = Math.floor(N/10)
  for (let gi=60; gi<N-MAX_HOLD-2; gi++) {
    if(gi%printEvery===0) process.stdout.write(`  ${Math.round(gi/N*100)}%`)

    const btcTs    = btcCandles[gi].ts
    const regime   = btcCache.adx[gi] > 25 ? 'trending' : 'ranging'
    const tpPct    = regime==='trending' ? T_TP : R_TP
    const slPct    = regime==='trending' ? T_SL : R_SL

    // Step 1: Close positions that hit TP/SL at this candle
    for (const pos of openPos) {
      if(pos.closed) continue
      const ci = coinIdx[pos.coin].get(btcTs)
      if(ci===undefined) continue
      const c = coinData[pos.coin][ci]
      const hitTP = c.high >= pos.tpPrice, hitSL = c.low <= pos.slPrice
      if(hitTP&&hitSL){ pos.pnl=c.close>=c.open?pos.tpPct:-pos.slPct; pos.closed=true }
      else if(hitTP)  { pos.pnl=pos.tpPct;  pos.closed=true }
      else if(hitSL)  { pos.pnl=-pos.slPct; pos.closed=true }
      // Timeout
      else if(gi>=pos.globalIdx+MAX_HOLD) {
        const ex=coinData[pos.coin][Math.min(ci+MAX_HOLD,coinData[pos.coin].length-1)]
        pos.pnl=(ex.close-pos.entryPrice)/pos.entryPrice*100; pos.closed=true
      }
    }
    // Remove closed from open list, record trades
    const justClosed=openPos.filter(p=>p.closed&&!p.recorded)
    for(const pos of justClosed){
      stats[pos.coin].trades.push(pos.pnl)
      pos.recorded=true
    }
    openPos.splice(0,openPos.length,...openPos.filter(p=>!p.closed))

    // Step 2: Find new signals across all coins
    const sigs=[]
    for(const coin of COINS){
      // Only 1 open position per coin at a time
      if(openPos.some(p=>p.coin===coin)) continue
      const ci=coinIdx[coin].get(btcTs)
      if(ci===undefined||ci<60) continue
      const candles=coinData[coin], p=cache[coin]
      if(!hasSignal(regime,candles,ci,p)) continue
      const density=signalDensity(regime,candles,ci,p)
      const label=getStrategyLabel(regime,sigs,candles,ci,p)
      sigs.push({coin,density,ci,label})
    }

    // Step 3: Rank by density, apply portfolio cap
    sigs.sort((a,b)=>b.density-a.density)
    const available=PORT_CAP-openPos.length
    const accepted=sigs.slice(0,available)
    const rejected=sigs.slice(available)

    for(const sig of rejected) stats[sig.coin].capRejected++

    // Step 4: Open new positions
    for(const sig of accepted){
      const entry=coinData[sig.coin][sig.ci].close
      stats[sig.coin].labels[sig.label]=(stats[sig.coin].labels[sig.label]||0)+1
      openPos.push({
        coin:sig.coin, globalIdx:gi, ci:sig.ci,
        entryPrice:entry,
        tpPrice:entry*(1+tpPct/100), slPrice:entry*(1-slPct/100),
        tpPct,slPct,closed:false,recorded:false
      })
    }

    // Track regime distribution
    for(const coin of COINS){
      const ci=coinIdx[coin].get(btcTs)
      if(ci===undefined) continue
      stats[coin].totalCandles++
      if(regime==='trending') stats[coin].trendingCandles++
    }
  }
  console.log('  100%\n')

  // Close any remaining open positions at last candle
  for(const pos of openPos){
    if(pos.closed) continue
    const lastIdx=coinData[pos.coin].length-1
    const exit=coinData[pos.coin][lastIdx]
    pos.pnl=(exit.close-pos.entryPrice)/pos.entryPrice*100
    stats[pos.coin].trades.push(pos.pnl)
  }

  // ── Aggregate results ────────────────────────────────────────
  console.log('▸ Aggregating results...\n')

  function maxDD(trades){
    let peak=0,dd=0,cum=0
    for(const t of trades){cum+=t;if(cum>peak)peak=cum;dd=Math.max(dd,peak-cum)}
    return dd
  }

  const finalRows = []
  for (const coin of COINS) {
    const s=stats[coin], t=s.trades
    if(t.length===0){ finalRows.push({coin,trades:0,winRate:0,pnl:0,maxDD:0,capRej:s.capRejected,trendPct:0,strategy:'No Signals',tp:0,sl:0}); continue }
    const wins=t.filter(p=>p>0).length
    const totalPnl=t.reduce((a,b)=>a+b,0)
    const topLabel=Object.entries(s.labels).sort((a,b)=>b[1]-a[1])[0]?.[0]||'Mixed'
    const trendPct=s.totalCandles>0?Math.round(s.trendingCandles/s.totalCandles*100):0
    const regime=trendPct>=50?'trending':'ranging'
    finalRows.push({
      coin,
      trendPct,
      regime,
      strategy:topLabel,
      winRate:+((wins/t.length)*100).toFixed(1),
      pnl:+totalPnl.toFixed(2),
      maxDD:+maxDD(t).toFixed(1),
      trades:t.length,
      capRej:s.capRejected,
      tp:regime==='trending'?T_TP:R_TP,
      sl:regime==='trending'?T_SL:R_SL,
    })
  }

  finalRows.sort((a,b)=>b.pnl-a.pnl)

  // ── Save to Supabase ─────────────────────────────────────────
  console.log('▸ Saving to portfolio_optimization_results...')
  const upsertRows = finalRows.map(r=>({
    coin:r.coin, regime_pct_trending:r.trendPct, selected_regime:r.regime,
    best_strategy:r.strategy, win_rate_pct:r.winRate, total_pnl_pct:r.pnl,
    max_drawdown_pct:r.maxDD, total_trades:r.trades,
    cap_rejected_trades:r.capRej, tp_pct:r.tp, sl_pct:r.sl,
    updated_at:new Date().toISOString()
  }))
  const {error:saveErr}=await supabase.from('portfolio_optimization_results').upsert(upsertRows,{onConflict:'coin'})
  if(saveErr) console.error('  Save error:', saveErr.message)
  else console.log(`  ✓ Saved ${upsertRows.length} rows\n`)

  // ═══════════════════════════════════════════════════════════
  //  FINAL REPORT TABLE
  // ═══════════════════════════════════════════════════════════
  const divider='═'.repeat(108)
  console.log('\n'+divider)
  console.log('  6-MONTH REGIME-FILTERED INSTITUTIONAL PORTFOLIO — FINAL RESULTS')
  console.log('  Portfolio Cap: 3 concurrent positions | ADX(14) regime filter | Independent TP/SL simulation')
  console.log(divider)
  console.log(
    ' #  ' +
    'Coin'.padEnd(8)+
    'Regime'.padEnd(10)+
    'Strategy'.padEnd(26)+
    'WinRate'.padStart(8)+
    'PnL%'.padStart(10)+
    'MaxDD%'.padStart(8)+
    'Trades'.padStart(8)+
    'CapRej'.padStart(8)+
    'TP/SL'.padStart(8)
  )
  console.log('─'.repeat(108))

  let rank=1
  for(const r of finalRows){
    const pnlStr=(r.pnl>=0?'+':'')+r.pnl.toFixed(2)+'%'
    const wrStr=r.winRate.toFixed(1)+'%'
    console.log(
      (' '+rank).padStart(3)+' '+
      r.coin.replace('USDT','').padEnd(8)+
      (r.trendPct+'% Trend').padEnd(10)+
      r.strategy.padEnd(26)+
      wrStr.padStart(8)+
      pnlStr.padStart(10)+
      (r.maxDD.toFixed(1)+'%').padStart(8)+
      String(r.trades).padStart(8)+
      String(r.capRej).padStart(8)+
      (r.tp+'/'+r.sl).padStart(8)
    )
    rank++
  }

  console.log('─'.repeat(108))
  const totPnl=finalRows.reduce((s,r)=>s+r.pnl,0)
  const avgWR=finalRows.filter(r=>r.trades>0).reduce((s,r)=>s+r.winRate,0)/finalRows.filter(r=>r.trades>0).length||0
  const totTrades=finalRows.reduce((s,r)=>s+r.trades,0)
  const totRej=finalRows.reduce((s,r)=>s+r.capRej,0)
  console.log(`  TOTALS   Coins: ${finalRows.length}/19   Avg WR: ${avgWR.toFixed(1)}%   Combined PnL: ${totPnl>=0?'+':''}${totPnl.toFixed(2)}%   Total Trades: ${totTrades}   Cap-Rejected: ${totRej}`)
  console.log(divider+'\n')

  console.log('✅ Simulation complete. Results saved to portfolio_optimization_results table.')
  console.log('   Frontend: /api/optimize/portfolio-results endpoint ready to use.\n')
}

main().catch(console.error)
