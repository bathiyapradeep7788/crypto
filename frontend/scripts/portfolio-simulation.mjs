/**
 * Institutional Portfolio Optimizer — v4 ALPHA DISPLACEMENT ENGINE
 *
 * CORE: Alpha-Based Position Displacement & Capital Recycling
 *   - Hard Cap = 5 (high-conviction only)
 *   - Alpha Score (0–100) per signal: ATR Ratio (40pts) + ADX (30pts) + Vol Expansion (30pts)
 *   - Displacement: if portfolio full and new signal alpha > worst live-scoring position,
 *     instantly close the loser at market price and recycle capital into the new trade
 *   - Cap rejections only when ALL 5 active positions outperform the incoming signal
 *
 * RETAINED FROM v3:
 *   - Trailing SL: shift SL to breakeven at 50% of TP distance
 *   - ETH/INJ 1H EMA21 trend confirmation filter + SL tightened ×0.85
 *   - Dynamic De-risk: if coin cumulative DD > 8%, scale next 5 trades to 50%
 *   - Per-strategy PnL tracking (true best-strategy winner per coin)
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

const COINS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','DOGEUSDT',
  'UNIUSDT','LTCUSDT','APTUSDT','SUIUSDT','NEARUSDT',
  'OPUSDT','ARBUSDT','INJUSDT','TIAUSDT','SHIBUSDT',
]

const PORT_CAP        = 5        // hard cap — displacement handles overflow
const MAX_HOLD        = 32
const DENSITY_WINDOW  = 10

// Micro-regime tuning (v3 retained)
const MICRO_TUNED   = new Set(['ETHUSDT','INJUSDT'])
const SL_TIGHTEN    = 0.85

// Dynamic de-risk (v3 retained)
const DERISK_DD_THRESHOLD = 8.0
const DERISK_SCALE        = 0.5
const DERISK_TRADE_COUNT  = 5

// Regime TP/SL defaults
const T_TP = 2.5, T_SL = 1.5
const R_TP = 1.5, R_SL = 1.0

// ═══════════════════════════════════════════════════════════════
//  INDICATORS
// ═══════════════════════════════════════════════════════════════
function ema(arr, p) {
  const k = 2/(p+1), out = new Array(arr.length).fill(0)
  let s = 0; for (let i=0;i<p;i++) s+=arr[i]; out[p-1]=s/p
  for (let i=p;i<arr.length;i++) out[i]=arr[i]*k+out[i-1]*(1-k)
  return out
}
function sma(arr, p) {
  return arr.map((_,i)=>{
    if(i<p-1) return 0
    let s=0; for(let j=i-p+1;j<=i;j++) s+=arr[j]; return s/p
  })
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
  let cumTPV=0,cumV=0
  return candles.map(c=>{
    const tp=(c.high+c.low+c.close)/3; cumTPV+=tp*c.volume; cumV+=c.volume
    return cumV>0?cumTPV/cumV:tp
  })
}
function computeATR(candles, p=14) {
  const out=new Array(candles.length).fill(0)
  let smooth=0, sum=0
  for(let i=1;i<candles.length;i++){
    const tr=Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i-1].close),
      Math.abs(candles[i].low  - candles[i-1].close)
    )
    if(i<p){ sum+=tr }
    else if(i===p){ smooth=(sum+tr)/p; out[i]=smooth }
    else{ smooth=(smooth*(p-1)+tr)/p; out[i]=smooth }
  }
  return out
}
function computeADX(candles, p=14) {
  const n=candles.length, out=new Array(n).fill(0)
  if(n<p*3) return out
  const tr=[],pdm=[],mdm=[]
  for(let i=1;i<n;i++){
    const h=candles[i].high,l=candles[i].low,pc=candles[i-1].close
    tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))
    const up=h-candles[i-1].high,dn=candles[i-1].low-l
    pdm.push(up>dn&&up>0?up:0); mdm.push(dn>up&&dn>0?dn:0)
  }
  const ws=arr=>{
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

// 1H trend EMA (v3 retained — for ETH/INJ)
function compute1HTrendEMA(candles) {
  const closes1h=[]
  for(let i=3;i<candles.length;i+=4) closes1h.push(candles[i].close)
  const ema1h=ema(closes1h,21)
  const mapped=new Array(candles.length).fill(0)
  for(let i=0;i<candles.length;i++){
    const h=Math.min(Math.floor(i/4),ema1h.length-1)
    mapped[i]=ema1h[h]
  }
  return mapped
}

function precompute(candles, coin) {
  const closes=candles.map(c=>c.close),highs=candles.map(c=>c.high)
  const lows=candles.map(c=>c.low),vols=candles.map(c=>c.volume)
  const bb=bollinger(closes)
  const p = {
    closes,highs,lows,vols,
    e21:ema(closes,21),e55:ema(closes,55),e8:ema(closes,8),
    rsi14:rsi(closes),stochK:stochRsi(closes),
    bbUp:bb.up,bbLo:bb.lo,bbMid:bb.mid,bbBW:bb.bw,
    vwap:vwapArr(candles),
    volSma20:sma(vols,20),hiSma20:sma(highs,20),
    atr14:computeATR(candles,14),   // ← NEW: for Alpha Score
    adx:computeADX(candles),
  }
  if(MICRO_TUNED.has(coin)) p.ema1h=compute1HTrendEMA(candles)
  return p
}

// ═══════════════════════════════════════════════════════════════
//  ALPHA SCORE (0–100) — core of the displacement engine
//
//  Component breakdown:
//    ATR Ratio   (40 pts): ATR14 / close → measures volatility intensity
//                          Normalized: 5% ATR ratio = max 40 pts
//    ADX         (30 pts): trend strength; 50+ ADX = max 30 pts
//    Vol Expand  (30 pts): volume / SMA20_vol → 3× avg = max 30 pts
// ═══════════════════════════════════════════════════════════════
function computeAlpha(candles, i, p, adxVal) {
  const atrRatio   = p.atr14[i] / (candles[i].close || 1)
  const atrPts     = Math.min(atrRatio / 0.05, 1) * 40          // 0–40

  const adxPts     = Math.min(adxVal / 50, 1) * 30              // 0–30

  const volRatio   = candles[i].volume / (p.volSma20[i] || 1)
  const volPts     = Math.min(volRatio / 3, 1) * 30             // 0–30

  return +(atrPts + adxPts + volPts).toFixed(2)   // 0–100
}

// ── Live position score at current candle ──────────────────────
// liveScore = entryAlpha + unrealised PnL%
// (higher alpha + already profitable = harder to displace)
function liveScore(pos, currentClose) {
  const unrealized = (currentClose - pos.entryPrice) / pos.entryPrice * 100
  return pos.entryAlpha + unrealized
}

// ═══════════════════════════════════════════════════════════════
//  SIGNAL FUNCTIONS (unchanged from v3)
// ═══════════════════════════════════════════════════════════════
const sigEmaCross    = (c,i,p)=>i>=60&&p.e21[i-1]<=p.e55[i-1]&&p.e21[i]>p.e55[i]
const sigVolMomentum = (c,i,p)=>i>=22&&c[i].volume>p.volSma20[i]*2&&c[i].close>c[i].open&&c[i].high>p.hiSma20[i-1]&&p.e8[i]>p.e21[i]
const sigIctOB       = (c,i,p)=>{
  if(i<5)return false
  const ob=c.slice(i-4,i).find(s=>s.open>s.close&&(s.open-s.close)/s.open>0.003)
  return !!ob&&c[i].close>ob.open&&c[i-1].close<=ob.open
}
const sigStochRsiVol = (c,i,p)=>i>=30&&p.stochK[i-1]<20&&p.stochK[i]>20&&c[i].volume>p.volSma20[i]*1.3
const sigBollinger   = (c,i,p)=>{
  if(i<22)return false
  const bwSlice=p.bbBW.slice(Math.max(0,i-50),i).filter(v=>v<999)
  const sq=bwSlice.sort((a,b)=>a-b)[Math.floor(bwSlice.length*0.2)]||0
  return p.bbBW[i-1]<=sq&&c[i-1].close<=p.bbLo[i-1]&&c[i].close>p.bbLo[i]
}
const sigVwap        = (c,i,p)=>i>=5&&c[i-1].close<p.vwap[i-1]&&c[i].close>p.vwap[i]&&p.rsi14[i]<55&&c[i].close>c[i].open

const STRATEGIES = [
  {id:'emaCross',    label:'EMA 21/55 Crossover',  regime:'trending', fn:sigEmaCross   },
  {id:'volMomentum', label:'Volume Momentum',       regime:'trending', fn:sigVolMomentum},
  {id:'ictOB',       label:'ICT Order Block',       regime:'trending', fn:sigIctOB      },
  {id:'stochRsiVol', label:'Stoch RSI + Volume',    regime:'ranging',  fn:sigStochRsiVol},
  {id:'bollinger',   label:'Bollinger Squeeze',     regime:'ranging',  fn:sigBollinger  },
  {id:'vwap',        label:'VWAP Reversion',        regime:'ranging',  fn:sigVwap       },
]

// ── LOAD CANDLES ──────────────────────────────────────────────
async function loadCandles(coin) {
  const rows=[],PAGE=1000; let from=0
  while(true){
    const {data,error}=await supabase
      .from('historical_15m_portfolio_data')
      .select('ts,open,high,low,close,volume')
      .eq('coin',coin)
      .order('ts',{ascending:true})
      .range(from,from+PAGE-1)
    if(error||!data||data.length===0) break
    rows.push(...data.map(r=>({ts:r.ts,open:+r.open,high:+r.high,low:+r.low,close:+r.close,volume:+r.volume})))
    if(data.length<PAGE) break
    from+=PAGE
  }
  return rows
}

// ── CLOSE A POSITION (displacement or normal) ─────────────────
function closePosition(pos, exitPnlPct, coin, stratTrades, derisk, displaced=false, displacedCount=null) {
  pos.closed = true
  const d = derisk[coin]
  const scaled = exitPnlPct * d.scale
  if(d.tradesLeft>0){ d.tradesLeft--; if(d.tradesLeft===0) d.scale=1.0 }
  d.cumPnl+=scaled
  if(d.cumPnl>d.peak) d.peak=d.cumPnl
  const dd=d.peak-d.cumPnl
  if(dd>=DERISK_DD_THRESHOLD&&d.scale===1.0){ d.scale=DERISK_SCALE; d.tradesLeft=DERISK_TRADE_COUNT }
  stratTrades[coin][pos.stratId].push(scaled)
  if(displaced&&displacedCount) displacedCount[coin]=(displacedCount[coin]||0)+1
}

// ── OPEN A POSITION ───────────────────────────────────────────
function openPosition(sig, entry, tp, sl, entryAlpha, gi) {
  return {
    coin:        sig.coin,
    stratId:     sig.strat.id,
    openGi:      gi,
    entryPrice:  entry,
    entryAlpha,
    tpPrice:     entry*(1+tp/100),
    slPrice:     entry*(1-sl/100),
    tpPct:       tp,
    slPct:       sl,
    beActivated: false,
    closed:      false,
  }
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  INSTITUTIONAL PORTFOLIO v4 — ALPHA DISPLACEMENT ENGINE     ║')
  console.log('║  Cap=5 · Alpha Score · Position Displacement · Trailing SL  ║')
  console.log('║  De-risk DD>8% · ETH/INJ 1H Filter + SL×0.85              ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  // ── Load & precompute ─────────────────────────────────────
  console.log('▸ Loading candle data from Supabase...')
  const coinData={},coinIdx={}
  for(const coin of COINS){
    process.stdout.write(`  ${coin}...`)
    const candles=await loadCandles(coin)
    coinData[coin]=candles
    coinIdx[coin]=new Map(candles.map((c,i)=>[c.ts,i]))
    process.stdout.write(` ${candles.length} candles\n`)
  }

  console.log('\n▸ Precomputing indicators (ATR14, ADX, 1H EMA for ETH/INJ)...')
  const cache={}
  for(const coin of COINS){cache[coin]=precompute(coinData[coin],coin);process.stdout.write('.')}
  console.log(' done\n')

  const btcCandles=coinData['BTCUSDT']
  const btcCache  =cache['BTCUSDT']
  const N=btcCandles.length
  console.log(`▸ Processing ${N} timestamps × ${COINS.length} coins`)
  console.log(`  Cap=${PORT_CAP} · Alpha Displacement ON · Trailing SL · De-risk · 1H Filter\n`)

  // ── Accumulators ──────────────────────────────────────────
  const stratTrades   = {}
  const capRejected   = {}
  const displacedCount= {}
  const regimeCounts  = {}
  const derisk        = {}

  for(const coin of COINS){
    stratTrades[coin]={}
    for(const s of STRATEGIES) stratTrades[coin][s.id]=[]
    capRejected[coin]=0
    displacedCount[coin]=0
    regimeCounts[coin]={trending:0,total:0}
    derisk[coin]={cumPnl:0,peak:0,scale:1.0,tradesLeft:0}
  }

  const openPos    =[]
  const printEvery =Math.floor(N/10)

  for(let gi=60;gi<N-MAX_HOLD-2;gi++){
    if(gi%printEvery===0) process.stdout.write(`  ${Math.round(gi/N*100)}%`)

    const btcTs  =btcCandles[gi].ts
    const adxVal =btcCache.adx[gi]
    const regime =adxVal>25?'trending':'ranging'

    // ── Step 1: Update open positions (trailing SL + close checks) ──
    for(const pos of openPos){
      if(pos.closed) continue
      const ci=coinIdx[pos.coin].get(btcTs)
      if(ci===undefined) continue
      const c=coinData[pos.coin][ci]

      // Trailing SL: shift to breakeven at 50% of TP
      const beTrig=pos.entryPrice*(1+pos.tpPct*0.5/100)
      if(!pos.beActivated&&c.high>=beTrig){
        pos.beActivated=true
        pos.slPrice=pos.entryPrice
      }

      const hitTP=c.high>=pos.tpPrice
      const hitSL=c.low <=pos.slPrice
      let result=null
      if(hitTP&&hitSL) result=c.close>=c.open?pos.tpPct:(pos.beActivated?0:-pos.slPct)
      else if(hitTP)   result=pos.tpPct
      else if(hitSL)   result=pos.beActivated?0:-pos.slPct
      else if(gi>=pos.openGi+MAX_HOLD){
        const exIdx=Math.min(ci,coinData[pos.coin].length-1)
        result=(coinData[pos.coin][exIdx].close-pos.entryPrice)/pos.entryPrice*100
      }
      if(result!==null) closePosition(pos,result,pos.coin,stratTrades,derisk)
    }
    openPos.splice(0,openPos.length,...openPos.filter(p=>!p.closed))

    // ── Step 2: Collect signals with Alpha Scores ──────────────
    const sigs=[]
    for(const coin of COINS){
      const ci=coinIdx[coin].get(btcTs)
      if(ci===undefined||ci<60) continue
      const candles=coinData[coin],p=cache[coin]
      regimeCounts[coin].total++
      if(regime==='trending') regimeCounts[coin].trending++

      // ETH/INJ: 1H trend confirmation gate
      if(MICRO_TUNED.has(coin)&&p.ema1h){
        if(!(p.ema1h[ci]>0&&candles[ci].close>p.ema1h[ci])) continue
      }

      for(const strat of STRATEGIES){
        if(strat.regime!==regime) continue
        if(!strat.fn(candles,ci,p)) continue
        if(openPos.some(pos=>pos.coin===coin&&pos.stratId===strat.id)) continue
        const alpha=computeAlpha(candles,ci,p,adxVal)
        sigs.push({coin,strat,alpha,ci})
      }
    }

    // ── Step 3: Alpha Displacement Engine ─────────────────────
    // Sort by alpha descending — highest-conviction signals first
    sigs.sort((a,b)=>b.alpha-a.alpha)

    for(const sig of sigs){
      const entry =coinData[sig.coin][sig.ci].close
      let   tp    =regime==='trending'?T_TP:R_TP
      let   sl    =regime==='trending'?T_SL:R_SL
      if(MICRO_TUNED.has(sig.coin)) sl=+(sl*SL_TIGHTEN).toFixed(3)

      if(openPos.length<PORT_CAP){
        // Slot available — open directly
        openPos.push(openPosition(sig,entry,tp,sl,sig.alpha,gi))

      } else {
        // ── DISPLACEMENT LOGIC ──────────────────────────────
        // Score each active position: entryAlpha + unrealized PnL%
        const scored=openPos.map(pos=>{
          const ci2=coinIdx[pos.coin].get(btcTs)
          const curClose=ci2!==undefined?coinData[pos.coin][ci2].close:pos.entryPrice
          return {pos,score:liveScore(pos,curClose),curClose}
        })

        // Find worst (lowest live score)
        const worst=scored.sort((a,b)=>a.score-b.score)[0]

        if(sig.alpha>worst.score){
          // NEW SIGNAL OUTPERFORMS ACTIVE LOSER — displace!
          const exitPnl=(worst.curClose-worst.pos.entryPrice)/worst.pos.entryPrice*100
          closePosition(
            worst.pos, exitPnl, worst.pos.coin,
            stratTrades, derisk,
            /*displaced=*/true, displacedCount
          )
          openPos.splice(openPos.indexOf(worst.pos),1)
          // Open new high-alpha position
          openPos.push(openPosition(sig,entry,tp,sl,sig.alpha,gi))
        } else {
          // All active positions have higher live scores — reject
          capRejected[sig.coin]++
        }
      }
    }
  }
  console.log('  100%\n')

  // Flush remaining open positions at last candle
  for(const pos of openPos.filter(p=>!p.closed)){
    const lastIdx=coinData[pos.coin].length-1
    const pnl=(coinData[pos.coin][lastIdx].close-pos.entryPrice)/pos.entryPrice*100
    closePosition(pos,pnl,pos.coin,stratTrades,derisk)
  }

  // ── Per-strategy aggregation ──────────────────────────────
  console.log('▸ Aggregating per-strategy results...\n')

  function maxDD(trades){
    let peak=0,dd=0,cum=0
    for(const t of trades){cum+=t;if(cum>peak)peak=cum;dd=Math.max(dd,peak-cum)}
    return dd
  }

  const finalRows=[]
  for(const coin of COINS){
    const rc=regimeCounts[coin]
    const trendPct=rc.total>0?Math.round(rc.trending/rc.total*100):0
    const domReg=trendPct>=50?'trending':'ranging'

    const summaries=STRATEGIES.map(s=>{
      const trades=stratTrades[coin][s.id]
      if(!trades.length) return null
      const wins=trades.filter(t=>t>0).length
      return {id:s.id,label:s.label,regime:s.regime,
        trades:trades.length,winRate:(wins/trades.length)*100,
        pnl:trades.reduce((a,b)=>a+b,0),maxDD:maxDD(trades)}
    }).filter(Boolean)

    if(!summaries.length){
      finalRows.push({coin,trendPct,regime:domReg,bestId:'',stratLabel:'No Signals',
        winRate:0,pnl:0,maxDD:0,trades:0,capRej:capRejected[coin],
        displaced:displacedCount[coin],tp:0,sl:0,allStrats:[]})
      continue
    }

    const best=[...summaries].sort((a,b)=>b.pnl-a.pnl)[0]
    const sl=MICRO_TUNED.has(coin)
      ? +((domReg==='trending'?T_SL:R_SL)*SL_TIGHTEN).toFixed(3)
      : (domReg==='trending'?T_SL:R_SL)

    finalRows.push({
      coin,trendPct,regime:domReg,bestId:best.id,stratLabel:best.label,
      winRate:best.winRate,pnl:best.pnl,maxDD:best.maxDD,
      trades:best.trades,capRej:capRejected[coin],
      displaced:displacedCount[coin],
      tp:domReg==='trending'?T_TP:R_TP,sl,
      allStrats:summaries,
    })
  }
  finalRows.sort((a,b)=>b.pnl-a.pnl)

  // ── Save to Supabase ──────────────────────────────────────
  console.log('▸ Saving v4 results to portfolio_optimization_results...')
  const {error:saveErr}=await supabase.from('portfolio_optimization_results').upsert(
    finalRows.map(r=>({
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
    {onConflict:'coin'}
  )
  if(saveErr) console.error('  Save error:',saveErr.message)
  else console.log(`  ✓ Saved ${finalRows.length} rows\n`)

  // ═══════════════════════════════════════════════════════════
  //  MASTER REPORT v4
  // ═══════════════════════════════════════════════════════════
  const W=132
  const div='═'.repeat(W)
  console.log('\n'+div)
  console.log('  6-MONTH INSTITUTIONAL PORTFOLIO MASTER v4 — ALPHA DISPLACEMENT ENGINE')
  console.log('  Cap=5 · Alpha Score(ATR+ADX+Vol) · Position Displacement · Trailing SL · De-risk · ETH/INJ 1H Filter')
  console.log(div)
  console.log(
    ' # '.padEnd(4)+
    'Coin'.padEnd(10)+
    'Regime'.padEnd(10)+
    'Strategy'.padEnd(26)+
    '6M WinRate'.padStart(11)+
    'Net PnL%'.padStart(10)+
    'Max DD%'.padStart(9)+
    'Trades'.padStart(8)+
    'Displaced'.padStart(10)+
    'CapRej'.padStart(8)+
    'TP/SL'.padStart(8)
  )
  console.log('─'.repeat(W))

  let rank=1
  for(const r of finalRows){
    const pnlStr=(r.pnl>=0?'+':'')+r.pnl.toFixed(2)+'%'
    const micro=MICRO_TUNED.has(r.coin)?'①':' '
    console.log(
      (' '+rank).padStart(3)+' '+
      (r.coin.replace('USDT','')+micro).padEnd(10)+
      (r.trendPct+'% Trend').padEnd(10)+
      r.stratLabel.padEnd(26)+
      (r.winRate.toFixed(1)+'%').padStart(11)+
      pnlStr.padStart(10)+
      (r.maxDD.toFixed(1)+'%').padStart(9)+
      String(r.trades).padStart(8)+
      String(r.displaced).padStart(10)+
      String(r.capRej).padStart(8)+
      (r.tp+'/'+r.sl).padStart(8)
    )
    for(const s of r.allStrats.sort((a,b)=>b.pnl-a.pnl)){
      const star=s.id===r.bestId?'★':' '
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
  const totPnl     =finalRows.reduce((s,r)=>s+r.pnl,0)
  const withTrades =finalRows.filter(r=>r.trades>0)
  const avgWR      =withTrades.reduce((s,r)=>s+r.winRate,0)/(withTrades.length||1)
  const totTrades  =finalRows.reduce((s,r)=>s+r.trades,0)
  const totRej     =finalRows.reduce((s,r)=>s+r.capRej,0)
  const totDisp    =finalRows.reduce((s,r)=>s+r.displaced,0)
  const avgDD      =withTrades.reduce((s,r)=>s+r.maxDD,0)/(withTrades.length||1)
  const profitable =finalRows.filter(r=>r.pnl>0).length

  console.log(`\n  ╔══ PORTFOLIO SUMMARY ════════════════════════════════════════════╗`)
  console.log(`  ║  Combined Portfolio PnL:    ${(totPnl>=0?'+':'')+totPnl.toFixed(2)}%`.padEnd(70)+'║')
  console.log(`  ║  Average Max Drawdown:      ${avgDD.toFixed(1)}%`.padEnd(70)+'║')
  console.log(`  ║  Average Win Rate:          ${avgWR.toFixed(1)}%`.padEnd(70)+'║')
  console.log(`  ║  Total Displaced Trades:    ${totDisp.toLocaleString()}  (capital recycled)`.padEnd(70)+'║')
  console.log(`  ║  Total Cap Rejections:      ${totRej.toLocaleString()}  (v3 had 5,607 | v2 had 10,318)`.padEnd(70)+'║')
  console.log(`  ║  Total Trades Executed:     ${totTrades.toLocaleString()}`.padEnd(70)+'║')
  console.log(`  ║  Profitable Coins:          ${profitable}/20`.padEnd(70)+'║')
  console.log(`  ╚════════════════════════════════════════════════════════════════════╝\n`)
  console.log('  ① ETH & INJ: 1H EMA21 trend filter + SL ×0.85\n')
  console.log('✅ v4 ALPHA DISPLACEMENT simulation complete. Results saved.\n')
}

main().catch(console.error)
