/**
 * Institutional Portfolio Optimizer — v2 (3-Fix Upgrade)
 *
 * FIX 1: Portfolio cap 3 → 5 concurrent positions
 * FIX 2: Trailing SL — once price moves 50% toward TP, lock SL to breakeven
 * FIX 3: Per-strategy PnL tracking — best_strategy = actual highest-PnL strategy
 *         (not the most-frequently-fired one), giving all 6 regime strategies a fair shot
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
]

// FIX 1: cap raised 3 → 5
const PORT_CAP       = 5
const MAX_HOLD       = 32
const DENSITY_WINDOW = 10

// Regime TP/SL
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
  function ws(arr){
    const out=new Array(arr.length).fill(0)
    let s=arr.slice(0,p).reduce((a,b)=>a+b,0); out[p-1]=s
    for(let i=p;i<arr.length;i++) out[i]=out[i-1]-out[i-1]/p+arr[i]
    return out
  }
  const sTR=ws(tr),sPDM=ws(pdm),sMDM=ws(mdm)
  const diP=sTR.map((t,i)=>t>0?sPDM[i]/t*100:0)
  const diM=sTR.map((t,i)=>t>0?sMDM[i]/t*100:0)
  const dx=diP.map((pv,i)=>{const s=pv+diM[i];return s>0?Math.abs(pv-diM[i])/s*100:0})
  let av=dx.slice(p-1,2*p-1).reduce((a,b)=>a+b,0)/p; adxOut[2*p]=av
  for(let i=2*p+1;i<n;i++){av=(av*(p-1)+dx[i-1])/p;adxOut[i]=av}
  return adxOut
}

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
//  SIGNAL FUNCTIONS
// ═══════════════════════════════════════════════════════════════
const sigEmaCross    = (c,i,p) => i>=60 && p.e21[i-1]<=p.e55[i-1] && p.e21[i]>p.e55[i]
const sigVolMomentum = (c,i,p) => i>=22 && c[i].volume>p.volSma20[i]*2 && c[i].close>c[i].open && c[i].high>p.hiSma20[i-1] && p.e8[i]>p.e21[i]
const sigIctOB       = (c,i,p) => {
  if(i<5)return false
  const ob=c.slice(i-4,i).find(s=>s.open>s.close&&(s.open-s.close)/s.open>0.003)
  return !!ob && c[i].close>ob.open && c[i-1].close<=ob.open
}
const sigStochRsiVol = (c,i,p) => i>=30 && p.stochK[i-1]<20 && p.stochK[i]>20 && c[i].volume>p.volSma20[i]*1.3
const sigBollinger   = (c,i,p) => {
  if(i<22)return false
  const bwSlice=p.bbBW.slice(Math.max(0,i-50),i).filter(v=>v<999)
  const sq=bwSlice.sort((a,b)=>a-b)[Math.floor(bwSlice.length*0.2)]||0
  return p.bbBW[i-1]<=sq && c[i-1].close<=p.bbLo[i-1] && c[i].close>p.bbLo[i]
}
const sigVwap        = (c,i,p) => i>=5 && c[i-1].close<p.vwap[i-1] && c[i].close>p.vwap[i] && p.rsi14[i]<55 && c[i].close>c[i].open

// FIX 3: Strategy registry — each strategy tracked independently
const STRATEGIES = [
  { id:'emaCross',    label:'EMA 21/55 Crossover',    regime:'trending', fn:sigEmaCross    },
  { id:'volMomentum', label:'Volume Momentum',         regime:'trending', fn:sigVolMomentum },
  { id:'ictOB',       label:'ICT Order Block',         regime:'trending', fn:sigIctOB       },
  { id:'stochRsiVol', label:'Stoch RSI + Volume',      regime:'ranging',  fn:sigStochRsiVol },
  { id:'bollinger',   label:'Bollinger Squeeze',       regime:'ranging',  fn:sigBollinger   },
  { id:'vwap',        label:'VWAP Reversion',          regime:'ranging',  fn:sigVwap        },
]

// ═══════════════════════════════════════════════════════════════
//  FIX 2: TRAILING STOP LOSS
//  Entry → if price reaches 50% of TP distance → SL moves to breakeven (entry)
//  Position that hits breakeven exits at 0% instead of -SL%
// ═══════════════════════════════════════════════════════════════
// (Trailing logic embedded directly in the timeline loop for live positions)

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

function signalDensity(strat, candles, i, p) {
  let count = 0, start = Math.max(60, i - DENSITY_WINDOW + 1)
  for (let k = start; k <= i; k++) if (strat.fn(candles, k, p)) count++
  return count
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  INSTITUTIONAL PORTFOLIO v2 — 3-FIX UPGRADE                 ║')
  console.log('║  Fix1: Cap=5  Fix2: Trailing SL  Fix3: Per-Strat PnL Track  ║')
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  console.log('▸ Loading candle data from Supabase...')
  const coinData = {}, coinIdx = {}
  for (const coin of COINS) {
    process.stdout.write(`  ${coin}...`)
    const candles = await loadCandles(coin)
    coinData[coin] = candles
    coinIdx[coin]  = new Map(candles.map((c,i) => [c.ts, i]))
    process.stdout.write(` ${candles.length} candles\n`)
  }

  console.log('\n▸ Precomputing indicators...')
  const cache = {}
  for (const coin of COINS) { cache[coin] = precompute(coinData[coin]); process.stdout.write('.') }
  console.log(' done\n')

  const btcCandles = coinData['BTCUSDT']
  const btcCache   = cache['BTCUSDT']
  const N = btcCandles.length
  console.log(`▸ Processing ${N} timestamps × ${COINS.length} coins (Cap=${PORT_CAP}, Trailing SL ON)...`)

  // Per-coin per-strategy trade accumulator
  const stratTrades = {}
  const capRejected = {}
  const regimeCounts = {}
  for (const coin of COINS) {
    stratTrades[coin]  = {}
    for (const s of STRATEGIES) stratTrades[coin][s.id] = []
    capRejected[coin]  = 0
    regimeCounts[coin] = { trending: 0, total: 0 }
  }

  const openPos = []  // live positions
  const printEvery = Math.floor(N / 10)

  for (let gi = 60; gi < N - MAX_HOLD - 2; gi++) {
    if (gi % printEvery === 0) process.stdout.write(`  ${Math.round(gi/N*100)}%`)

    const btcTs  = btcCandles[gi].ts
    const regime = btcCache.adx[gi] > 25 ? 'trending' : 'ranging'
    const tpPct  = regime === 'trending' ? T_TP : R_TP
    const slPct  = regime === 'trending' ? T_SL : R_SL

    // ── Step 1: Update / close open positions ──────────────
    for (const pos of openPos) {
      if (pos.closed) continue
      const ci = coinIdx[pos.coin].get(btcTs)
      if (ci === undefined) continue
      const c = coinData[pos.coin][ci]

      // FIX 2: Check breakeven trail activation
      const beTrigger = pos.entryPrice * (1 + pos.tpPct * 0.5 / 100)
      if (!pos.beActivated && c.high >= beTrigger) {
        pos.beActivated = true
        pos.slPrice = pos.entryPrice  // move SL to breakeven
      }

      const hitTP = c.high >= pos.tpPrice
      const hitSL = c.low  <= pos.slPrice

      let result = null
      if (hitTP && hitSL) result = c.close >= c.open ? pos.tpPct : (pos.beActivated ? 0 : -pos.slPct)
      else if (hitTP)     result = pos.tpPct
      else if (hitSL)     result = pos.beActivated ? 0 : -pos.slPct
      else if (gi >= pos.openGi + MAX_HOLD) {
        const exIdx = Math.min(ci, coinData[pos.coin].length - 1)
        result = (coinData[pos.coin][exIdx].close - pos.entryPrice) / pos.entryPrice * 100
      }

      if (result !== null) {
        pos.closed = true
        stratTrades[pos.coin][pos.stratId].push(result)
      }
    }
    openPos.splice(0, openPos.length, ...openPos.filter(p => !p.closed))

    // ── Step 2: Collect new signals ────────────────────────
    const sigs = []
    for (const coin of COINS) {
      const ci = coinIdx[coin].get(btcTs)
      if (ci === undefined || ci < 60) continue
      const candles = coinData[coin], p = cache[coin]
      regimeCounts[coin].total++
      if (regime === 'trending') regimeCounts[coin].trending++

      for (const strat of STRATEGIES) {
        if (strat.regime !== regime) continue
        if (!strat.fn(candles, ci, p)) continue
        // Max 1 open position per (coin, strategy)
        if (openPos.some(pos => pos.coin === coin && pos.stratId === strat.id)) continue
        const density = signalDensity(strat, candles, ci, p)
        sigs.push({ coin, strat, density, ci })
      }
    }

    // ── Step 3: Apply portfolio cap ────────────────────────
    sigs.sort((a, b) => b.density - a.density)
    const available = PORT_CAP - openPos.length
    for (const sig of sigs.slice(available)) capRejected[sig.coin]++

    for (const sig of sigs.slice(0, available)) {
      const entry = coinData[sig.coin][sig.ci].close
      const tp    = regime === 'trending' ? T_TP : R_TP
      const sl    = regime === 'trending' ? T_SL : R_SL
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

  // Flush remaining open positions
  for (const pos of openPos.filter(p => !p.closed)) {
    const lastIdx = coinData[pos.coin].length - 1
    const pnl = (coinData[pos.coin][lastIdx].close - pos.entryPrice) / pos.entryPrice * 100
    stratTrades[pos.coin][pos.stratId].push(pnl)
  }

  // ── FIX 3: Per-strategy evaluation ────────────────────────
  console.log('▸ Aggregating per-strategy results...\n')

  function maxDD(trades) {
    let peak = 0, dd = 0, cum = 0
    for (const t of trades) { cum += t; if (cum > peak) peak = cum; dd = Math.max(dd, peak - cum) }
    return dd
  }

  const finalRows = []
  for (const coin of COINS) {
    const rc = regimeCounts[coin]
    const trendPct = rc.total > 0 ? Math.round(rc.trending / rc.total * 100) : 0
    const domRegime = trendPct >= 50 ? 'trending' : 'ranging'

    const stratSummaries = STRATEGIES.map(s => {
      const trades = stratTrades[coin][s.id]
      if (trades.length === 0) return null
      const wins = trades.filter(t => t > 0).length
      return {
        id:      s.id,
        label:   s.label,
        regime:  s.regime,
        trades:  trades.length,
        winRate: (wins / trades.length) * 100,
        pnl:     trades.reduce((a, b) => a + b, 0),
        maxDD:   maxDD(trades),
      }
    }).filter(Boolean)

    if (stratSummaries.length === 0) {
      finalRows.push({ coin, trendPct, regime: domRegime, stratLabel: 'No Signals', winRate: 0, pnl: 0, maxDD: 0, trades: 0, capRej: capRejected[coin], tp: 0, sl: 0, allStrats: [], bestId: '' })
      continue
    }

    // Pick best by PnL (the true winner — Fix 3 core)
    const best = [...stratSummaries].sort((a, b) => b.pnl - a.pnl)[0]

    finalRows.push({
      coin, trendPct,
      regime:     domRegime,
      bestId:     best.id,
      stratLabel: best.label,
      winRate:    best.winRate,
      pnl:        best.pnl,
      maxDD:      best.maxDD,
      trades:     best.trades,
      capRej:     capRejected[coin],
      tp:         domRegime === 'trending' ? T_TP : R_TP,
      sl:         domRegime === 'trending' ? T_SL : R_SL,
      allStrats:  stratSummaries,
    })
  }
  finalRows.sort((a, b) => b.pnl - a.pnl)

  // ── Save to Supabase ───────────────────────────────────────
  console.log('▸ Truncating old results...')
  await supabase.from('portfolio_optimization_results').delete().neq('coin', '__never__')
  console.log('▸ Saving new results...')
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

  // ── FINAL REPORT ───────────────────────────────────────────
  const W = 124
  const div = '═'.repeat(W)
  console.log('\n' + div)
  console.log('  6-MONTH INSTITUTIONAL PORTFOLIO v2 — Cap=5 | Trailing SL | Per-Strategy PnL Winner')
  console.log(div)
  console.log(
    ' # '.padEnd(4) +
    'Coin'.padEnd(8) +
    'Regime'.padEnd(12) +
    'Best Strategy'.padEnd(26) +
    'WinRate'.padStart(8) +
    'PnL%'.padStart(10) +
    'MaxDD%'.padStart(8) +
    'Trades'.padStart(8) +
    'CapRej'.padStart(8) +
    'TP/SL'.padStart(8)
  )
  console.log('─'.repeat(W))

  let rank = 1
  for (const r of finalRows) {
    const pnlStr = (r.pnl >= 0 ? '+' : '') + r.pnl.toFixed(2) + '%'
    console.log(
      (' ' + rank).padStart(3) + ' ' +
      r.coin.replace('USDT','').padEnd(8) +
      (r.trendPct + '% Trend').padEnd(12) +
      r.stratLabel.padEnd(26) +
      (r.winRate.toFixed(1)+'%').padStart(8) +
      pnlStr.padStart(10) +
      (r.maxDD.toFixed(1)+'%').padStart(8) +
      String(r.trades).padStart(8) +
      String(r.capRej).padStart(8) +
      (r.tp+'/'+r.sl).padStart(8)
    )
    // Sub-table: all strategies that actually fired for this coin
    for (const s of r.allStrats.sort((a,b)=>b.pnl-a.pnl)) {
      const star = s.id === r.bestId ? '★' : ' '
      console.log(
        '     ' + star + ' ' +
        s.label.padEnd(24) +
        (s.winRate.toFixed(1)+'%').padStart(8) +
        ((s.pnl>=0?'+':'')+s.pnl.toFixed(2)+'%').padStart(10) +
        (s.maxDD.toFixed(1)+'%').padStart(8) +
        ('('+s.trades+' trades)').padStart(14)
      )
    }
    rank++
  }

  console.log('─'.repeat(W))
  const totPnl     = finalRows.reduce((s, r) => s + r.pnl, 0)
  const withTrades = finalRows.filter(r => r.trades > 0)
  const avgWR      = withTrades.reduce((s, r) => s + r.winRate, 0) / (withTrades.length || 1)
  const totTrades  = finalRows.reduce((s, r) => s + r.trades, 0)
  const totRej     = finalRows.reduce((s, r) => s + r.capRej, 0)
  const avgDD      = withTrades.reduce((s, r) => s + r.maxDD, 0) / (withTrades.length || 1)
  console.log(`  TOTALS  Coins: ${finalRows.length}/19  Avg WR: ${avgWR.toFixed(1)}%  Avg MaxDD: ${avgDD.toFixed(1)}%  Combined PnL: ${totPnl>=0?'+':''}${totPnl.toFixed(2)}%  Trades: ${totTrades}  Cap-Rej: ${totRej}`)
  console.log(div + '\n')
  console.log('✅ v2 complete. Results saved to portfolio_optimization_results.\n')
}

main().catch(console.error)
