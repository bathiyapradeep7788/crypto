// ============================================================
//  AlgoBot — 10 Strategy Engine (pure TypeScript, no deps)
// ============================================================

export type Candle = {
  ts: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type StrategyResult = {
  name: string
  label: string
  win_rate: number
  total_pnl_pct: number
  max_drawdown_pct: number
  total_trades: number
  tp_pct: number
  tp2_pct: number
  sl_pct: number
}

// ── Math Helpers ──────────────────────────────────────────────

function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out = new Array(data.length).fill(0)
  // seed with SMA of first period values
  let sum = 0
  for (let i = 0; i < period && i < data.length; i++) sum += data[i]
  out[period - 1] = sum / period
  for (let i = period; i < data.length; i++) {
    out[i] = data[i] * k + out[i - 1] * (1 - k)
  }
  return out
}

function sma(data: number[], period: number): number[] {
  return data.map((_, i) => {
    if (i < period - 1) return 0
    let s = 0
    for (let j = i - period + 1; j <= i; j++) s += data[j]
    return s / period
  })
}

function rsi(closes: number[], period = 14): number[] {
  const out = new Array(closes.length).fill(50)
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) avgGain += d; else avgLoss -= d
  }
  avgGain /= period; avgLoss /= period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

function macd(closes: number[]): { line: number[]; signal: number[]; hist: number[] } {
  const fast = ema(closes, 12)
  const slow = ema(closes, 26)
  const line = fast.map((v, i) => v - slow[i])
  const signal = ema(line, 9)
  const hist = line.map((v, i) => v - signal[i])
  return { line, signal, hist }
}

function bollinger(closes: number[], period = 20, mult = 2): {
  upper: number[]; middle: number[]; lower: number[]; bwidth: number[]
} {
  const upper: number[] = [], middle: number[] = [], lower: number[] = [], bwidth: number[] = []
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(0); middle.push(0); lower.push(0); bwidth.push(999); continue }
    const sl = closes.slice(i - period + 1, i + 1)
    const avg = sl.reduce((a, b) => a + b) / period
    const std = Math.sqrt(sl.reduce((s, v) => s + (v - avg) ** 2, 0) / period)
    const u = avg + mult * std, l = avg - mult * std
    upper.push(u); middle.push(avg); lower.push(l)
    bwidth.push(avg > 0 ? (u - l) / avg * 100 : 0)
  }
  return { upper, middle, lower, bwidth }
}

function vwap(candles: Candle[]): number[] {
  const out: number[] = []
  let cumTPV = 0, cumVol = 0
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3
    cumTPV += tp * c.volume
    cumVol += c.volume
    out.push(cumVol > 0 ? cumTPV / cumVol : tp)
  }
  return out
}

function stochRSI(closes: number[], rsiPeriod = 14, stochPeriod = 14): { k: number[]; d: number[] } {
  const r = rsi(closes, rsiPeriod)
  const k: number[] = []
  for (let i = 0; i < r.length; i++) {
    if (i < rsiPeriod + stochPeriod - 2) { k.push(50); continue }
    const sl = r.slice(i - stochPeriod + 1, i + 1)
    const mn = Math.min(...sl), mx = Math.max(...sl)
    k.push(mx === mn ? 50 : (r[i] - mn) / (mx - mn) * 100)
  }
  return { k, d: sma(k, 3) }
}

function ichimoku(candles: Candle[]): {
  tenkan: number[]; kijun: number[]; senkouA: number[]; senkouB: number[]
} {
  const hi = (cs: Candle[]) => Math.max(...cs.map(c => c.high))
  const lo = (cs: Candle[]) => Math.min(...cs.map(c => c.low))
  const tenkan = candles.map((_, i) => {
    if (i < 8) return 0
    const sl = candles.slice(i - 8, i + 1)
    return (hi(sl) + lo(sl)) / 2
  })
  const kijun = candles.map((_, i) => {
    if (i < 25) return 0
    const sl = candles.slice(i - 25, i + 1)
    return (hi(sl) + lo(sl)) / 2
  })
  const senkouA = tenkan.map((t, i) => (t + kijun[i]) / 2)
  const senkouB = candles.map((_, i) => {
    if (i < 51) return 0
    const sl = candles.slice(i - 51, i + 1)
    return (hi(sl) + lo(sl)) / 2
  })
  return { tenkan, kijun, senkouA, senkouB }
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.floor((p / 100) * sorted.length)
  return sorted[Math.min(idx, sorted.length - 1)]
}

// ── Trade Simulator ───────────────────────────────────────────

const TP_GRID  = [1.5, 2.0, 2.5, 3.0]
const TP2_GRID = [3.0, 4.0, 5.0]
const SL_GRID  = [1.0, 1.5, 2.0]
const MAX_HOLD = 48  // candles (~12h at 15m)

function simOnce(
  candles: Candle[],
  signals: boolean[],
  tp: number, tp2: number, sl: number
): { wins: number; losses: number; pnl: number; equity: number[]; trades: number } {
  let wins = 0, losses = 0, pnl = 0
  const equity: number[] = []
  let cum = 0
  for (let i = 52; i < signals.length - MAX_HOLD - 1; i++) {
    if (!signals[i]) continue
    const entry = candles[i].close
    const tpPrice  = entry * (1 + tp / 100)
    const tp2Price = entry * (1 + tp2 / 100)
    const slPrice  = entry * (1 - sl / 100)
    let result = -sl
    for (let j = i + 1; j <= i + MAX_HOLD; j++) {
      const { low, high } = candles[j]
      // SL checked first (conservative)
      if (low <= slPrice) { result = -sl; break }
      if (high >= tp2Price) { result = tp2; break }
      if (high >= tpPrice)  { result = tp;  break }
    }
    if (result > 0) wins++; else losses++
    pnl += result
    cum += result
    equity.push(cum)
  }
  return { wins, losses, pnl, equity, trades: wins + losses }
}

function maxDrawdown(equity: number[]): number {
  let peak = -Infinity, mdd = 0
  for (const v of equity) {
    if (v > peak) peak = v
    const dd = peak - v
    if (dd > mdd) mdd = dd
  }
  return mdd
}

function bestParams(candles: Candle[], signals: boolean[]): {
  winRate: number; totalPnl: number; mdd: number; trades: number; tp: number; tp2: number; sl: number
} {
  let best = { winRate: 0, totalPnl: -Infinity, mdd: 100, trades: 0, tp: 2, tp2: 4, sl: 1.5 }
  for (const tp of TP_GRID) {
    for (const tp2 of TP2_GRID) {
      if (tp2 <= tp) continue
      for (const sl of SL_GRID) {
        const { wins, losses, pnl, equity, trades } = simOnce(candles, signals, tp, tp2, sl)
        if (trades < 5) continue
        const mdd = maxDrawdown(equity)
        if (mdd > 20) continue  // reject if drawdown > 20%
        const wr = trades > 0 ? (wins / trades) * 100 : 0
        if (pnl > best.totalPnl) {
          best = { winRate: wr, totalPnl: pnl, mdd, trades, tp, tp2, sl }
        }
      }
    }
  }
  return best
}

// ── Signal Generators (one per strategy) ─────────────────────

function sigRsiMacd(candles: Candle[]): boolean[] {
  const closes = candles.map(c => c.close)
  const r = rsi(closes, 14)
  const { hist } = macd(closes)
  return candles.map((_, i) =>
    i >= 26 &&
    r[i] < 32 &&
    hist[i] > 0 &&
    hist[i - 1] <= 0
  )
}

function sigEmaCross(candles: Candle[]): boolean[] {
  const closes = candles.map(c => c.close)
  const e21 = ema(closes, 21)
  const e55 = ema(closes, 55)
  return candles.map((_, i) =>
    i >= 55 &&
    e21[i] > e55[i] &&
    e21[i - 1] <= e55[i - 1]
  )
}

function sigBollinger(candles: Candle[]): boolean[] {
  const closes = candles.map(c => c.close)
  const { upper, bwidth } = bollinger(closes, 20, 2)
  // Squeeze = bwidth below its 20th percentile
  const sqThresh = percentile(bwidth.filter(v => v < 999), 20)
  return candles.map((_, i) => {
    if (i < 21) return false
    const wasSqueezing = bwidth[i - 1] <= sqThresh
    const breakout = closes[i] > upper[i - 1]
    return wasSqueezing && breakout && closes[i] > closes[i - 1]
  })
}

function sigVwap(candles: Candle[]): boolean[] {
  const vw = vwap(candles)
  return candles.map((_, i) => {
    if (i < 2) return false
    const c = candles[i]
    const below = c.close < vw[i] * 0.9975       // 0.25% below VWAP
    const bouncing = c.close > candles[i - 1].close
    const momentum = c.close > c.open
    return below && bouncing && momentum
  })
}

function sigSupportResistance(candles: Candle[]): boolean[] {
  const LOOKBACK = 20
  const TOL = 0.004  // 0.4% tolerance
  return candles.map((_, i) => {
    if (i < LOOKBACK + 1) return false
    const window = candles.slice(i - LOOKBACK, i)
    const support = Math.min(...window.map(c => c.low))
    const c = candles[i]
    const nearSupport = Math.abs(c.low - support) / support < TOL
    return nearSupport && c.close > c.open && c.close > candles[i - 1].close
  })
}

function sigIchimoku(candles: Candle[]): boolean[] {
  const { senkouA, senkouB } = ichimoku(candles)
  return candles.map((_, i) => {
    if (i < 52) return false
    const kumoTop = Math.max(senkouA[i], senkouB[i])
    const prevKumoTop = Math.max(senkouA[i - 1], senkouB[i - 1])
    return candles[i].close > kumoTop && candles[i - 1].close <= prevKumoTop
  })
}

function sigStochRsiVol(candles: Candle[]): boolean[] {
  const closes = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)
  const { k } = stochRSI(closes, 14, 14)
  const volSMA = sma(volumes, 20)
  return candles.map((_, i) => {
    if (i < 30) return false
    const oversold = k[i] < 22
    const rising   = k[i] > k[i - 1]
    const highVol  = candles[i].volume > volSMA[i] * 1.5
    return oversold && rising && highVol
  })
}

function sigIctOrderBlock(candles: Candle[]): boolean[] {
  // Order Block: previous strong bearish bar followed by bullish FVG
  // FVG = gap between current low and 2 bars ago high
  return candles.map((_, i) => {
    if (i < 3) return false
    const prev2 = candles[i - 2]
    const prev1 = candles[i - 1]
    const curr  = candles[i]
    // Bearish order block at prev1
    const bearishOB = prev1.open > prev1.close &&
      (prev1.open - prev1.close) / prev1.open > 0.003
    // Bullish FVG: curr.low > prev2.high (gap up)
    const fvg = curr.low > prev2.high
    // Price now bullish closing above order block
    const bullishClose = curr.close > prev1.open
    return bearishOB && fvg && bullishClose
  })
}

function sigFibonacci(candles: Candle[]): boolean[] {
  const SWING = 50
  const TOL = 0.005  // 0.5% tolerance
  return candles.map((_, i) => {
    if (i < SWING + 1) return false
    const window = candles.slice(i - SWING, i)
    const swingHigh = Math.max(...window.map(c => c.high))
    const swingLow  = Math.min(...window.map(c => c.low))
    const range = swingHigh - swingLow
    if (range < swingLow * 0.02) return false  // skip tiny ranges
    const fib618 = swingHigh - range * 0.618
    const c = candles[i]
    const nearFib = Math.abs(c.close - fib618) / fib618 < TOL
    return nearFib && c.close > c.open && c.close > candles[i - 1].close
  })
}

function sigVolumeMomentum(candles: Candle[]): boolean[] {
  const volumes = candles.map(c => c.volume)
  const closes  = candles.map(c => c.close)
  const volSMA  = sma(volumes, 20)
  const highSMA = sma(candles.map(c => c.high), 20)
  return candles.map((_, i) => {
    if (i < 21) return false
    const c = candles[i]
    const volSpike   = c.volume > volSMA[i] * 2.0
    const bullishBar = c.close > c.open
    const breakout   = c.high > highSMA[i - 1]  // break above 20-bar high avg
    const momentum   = closes[i] > closes[i - 1] * 1.002
    return volSpike && bullishBar && breakout && momentum
  })
}

// ── Strategy Registry ─────────────────────────────────────────

export type StrategyDef = {
  name: string
  label: string
  signals: (candles: Candle[]) => boolean[]
}

export const STRATEGY_DEFS: StrategyDef[] = [
  { name: 'rsi_macd',            label: 'RSI + MACD',                signals: sigRsiMacd        },
  { name: 'ema_crossover',       label: 'EMA 21/55 Crossover',       signals: sigEmaCross       },
  { name: 'bollinger_squeeze',   label: 'Bollinger Band Squeeze',     signals: sigBollinger      },
  { name: 'vwap_mean_reversion', label: 'VWAP Mean Reversion',        signals: sigVwap           },
  { name: 'support_resistance',  label: 'S/R Bounce',                 signals: sigSupportResistance },
  { name: 'ichimoku',            label: 'Ichimoku Cloud',             signals: sigIchimoku       },
  { name: 'stoch_rsi_volume',    label: 'Stoch RSI + Volume',         signals: sigStochRsiVol    },
  { name: 'ict_order_block',     label: 'ICT Order Block + FVG',      signals: sigIctOrderBlock  },
  { name: 'fibonacci',           label: 'Fibonacci Retracement',      signals: sigFibonacci      },
  { name: 'volume_momentum',     label: 'Volume-Momentum Breakout',   signals: sigVolumeMomentum },
]

// ── Main Export: run all strategies on a coin's candles ───────

export function runAllStrategies(candles: Candle[]): StrategyResult[] {
  if (candles.length < 100) return []

  return STRATEGY_DEFS.map(def => {
    try {
      const signals = def.signals(candles)
      const { winRate, totalPnl, mdd, trades, tp, tp2, sl } = bestParams(candles, signals)
      return {
        name:             def.name,
        label:            def.label,
        win_rate:         winRate,
        total_pnl_pct:    totalPnl,
        max_drawdown_pct: mdd,
        total_trades:     trades,
        tp_pct:           tp,
        tp2_pct:          tp2,
        sl_pct:           sl,
      }
    } catch {
      return {
        name: def.name, label: def.label,
        win_rate: 0, total_pnl_pct: 0, max_drawdown_pct: 100,
        total_trades: 0, tp_pct: 2, tp2_pct: 4, sl_pct: 1.5,
      }
    }
  })
}

// ── Pick Best: highest PnL with MDD < 20% ─────────────────────

export function pickBest(results: StrategyResult[]): StrategyResult | null {
  const valid = results.filter(r => r.total_trades >= 5 && r.max_drawdown_pct < 20)
  if (!valid.length) return results.sort((a, b) => b.total_pnl_pct - a.total_pnl_pct)[0] ?? null
  return valid.sort((a, b) => b.total_pnl_pct - a.total_pnl_pct)[0]
}
