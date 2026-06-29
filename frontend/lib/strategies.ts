// ============================================================
//  AlgoBot — Concurrent Signal Engine (pure TypeScript, no deps)
//
//  Key design: NO position locking.
//  Every signal that fires at any timestamp is independently
//  simulated — multiple overlapping trades are captured.
//  TP vs SL order is determined by candle direction (not SL-first).
//  Timeout exits at actual close price, not a forced loss.
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

// ── Precomputed indicator cache ───────────────────────────────
// All indicators computed ONCE per coin, reused across all strategies.

type Cache = {
  closes:   number[]
  highs:    number[]
  lows:     number[]
  volumes:  number[]
  rsi14:    number[]
  macdHist: number[]
  ema21:    number[]
  ema55:    number[]
  ema8:     number[]
  bbUpper:  number[]
  bbLower:  number[]
  bbMid:    number[]
  bbWidth:  number[]
  vwapArr:  number[]
  stochK:   number[]
  ichi: {
    tenkan: number[]
    kijun:  number[]
    senkA:  number[]
    senkB:  number[]
  }
  volSma20: number[]
  highSma20: number[]
}

// ── Math helpers ──────────────────────────────────────────────

function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out = new Array(data.length).fill(0)
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

function computeRsi(closes: number[], period = 14): number[] {
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

function computeMacdHist(closes: number[]): number[] {
  const fast = ema(closes, 12)
  const slow = ema(closes, 26)
  const line = fast.map((v, i) => v - slow[i])
  const sig  = ema(line, 9)
  return line.map((v, i) => v - sig[i])
}

function computeBollinger(closes: number[], period = 20, mult = 2) {
  const upper: number[] = [], lower: number[] = [], mid: number[] = [], width: number[] = []
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(0); lower.push(0); mid.push(0); width.push(999); continue }
    const sl = closes.slice(i - period + 1, i + 1)
    const avg = sl.reduce((a, b) => a + b) / period
    const std = Math.sqrt(sl.reduce((s, v) => s + (v - avg) ** 2, 0) / period)
    upper.push(avg + mult * std)
    lower.push(avg - mult * std)
    mid.push(avg)
    width.push(avg > 0 ? (avg + mult * std - (avg - mult * std)) / avg * 100 : 0)
  }
  return { upper, lower, mid, width }
}

function computeVwap(candles: Candle[]): number[] {
  const out: number[] = []
  let cumTPV = 0, cumVol = 0
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3
    cumTPV += tp * c.volume; cumVol += c.volume
    out.push(cumVol > 0 ? cumTPV / cumVol : tp)
  }
  return out
}

function computeStochRsi(closes: number[], rsiP = 14, stochP = 14): number[] {
  const r = computeRsi(closes, rsiP)
  return r.map((v, i) => {
    if (i < rsiP + stochP - 2) return 50
    const sl = r.slice(i - stochP + 1, i + 1)
    const mn = Math.min(...sl), mx = Math.max(...sl)
    return mx === mn ? 50 : (v - mn) / (mx - mn) * 100
  })
}

function computeIchimoku(candles: Candle[]) {
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
  const senkA = tenkan.map((t, i) => (t + kijun[i]) / 2)
  const senkB = candles.map((_, i) => {
    if (i < 51) return 0
    const sl = candles.slice(i - 51, i + 1)
    return (hi(sl) + lo(sl)) / 2
  })
  return { tenkan, kijun, senkA, senkB }
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.floor((p / 100) * sorted.length)] ?? 0
}

function buildCache(candles: Candle[]): Cache {
  const closes  = candles.map(c => c.close)
  const highs   = candles.map(c => c.high)
  const lows    = candles.map(c => c.low)
  const volumes = candles.map(c => c.volume)
  const bb = computeBollinger(closes)
  return {
    closes, highs, lows, volumes,
    rsi14:    computeRsi(closes),
    macdHist: computeMacdHist(closes),
    ema21:    ema(closes, 21),
    ema55:    ema(closes, 55),
    ema8:     ema(closes, 8),
    bbUpper:  bb.upper,
    bbLower:  bb.lower,
    bbMid:    bb.mid,
    bbWidth:  bb.width,
    vwapArr:  computeVwap(candles),
    stochK:   computeStochRsi(closes),
    ichi:     computeIchimoku(candles),
    volSma20: sma(volumes, 20),
    highSma20: sma(highs, 20),
  }
}

// ── Per-candle signal conditions ──────────────────────────────
// Returns true if a BUY signal fires at index i.
// No position locking — called for EVERY candle independently.

type SigFn = (candles: Candle[], i: number, c: Cache) => boolean

function sigRsiMacd(candles: Candle[], i: number, c: Cache): boolean {
  if (i < 30) return false
  return (
    c.rsi14[i] < 35 &&
    c.rsi14[i] > c.rsi14[i - 1] &&           // RSI turning up
    c.macdHist[i] > c.macdHist[i - 1] &&     // MACD hist rising
    c.macdHist[i] < 0                         // still below zero (early entry)
  )
}

function sigEmaCross(candles: Candle[], i: number, c: Cache): boolean {
  if (i < 60) return false
  return (
    c.ema21[i - 1] <= c.ema55[i - 1] &&
    c.ema21[i]     >  c.ema55[i]          // golden cross
  )
}

function sigBollinger(candles: Candle[], i: number, c: Cache): boolean {
  if (i < 22) return false
  // Squeeze: bandwidth at 20th percentile; price breaks above lower band
  const sqThresh = percentile(c.bbWidth.slice(Math.max(0, i - 50), i).filter(v => v < 999), 20)
  const squeezed = c.bbWidth[i - 1] <= sqThresh
  const breakUp  = candles[i - 1].close <= c.bbLower[i - 1] &&
                   candles[i].close     >  c.bbLower[i]
  return squeezed && breakUp
}

function sigVwap(candles: Candle[], i: number, c: Cache): boolean {
  if (i < 5) return false
  return (
    candles[i - 1].close < c.vwapArr[i - 1] &&  // was below VWAP
    candles[i].close     > c.vwapArr[i] &&        // crossed above
    c.rsi14[i] < 55 &&                            // not overbought
    candles[i].close > candles[i].open             // bullish bar
  )
}

function sigSupportResistance(candles: Candle[], i: number, c: Cache): boolean {
  if (i < 22) return false
  const window = candles.slice(i - 20, i)
  const support = Math.min(...window.map(c => c.low))
  const tol = support * 0.004
  return (
    Math.abs(candles[i].low - support) < tol &&
    candles[i].close > candles[i].open &&
    candles[i].close > candles[i - 1].close
  )
}

function sigIchimoku(candles: Candle[], i: number, c: Cache): boolean {
  if (i < 52) return false
  const kumoTop  = Math.max(c.ichi.senkA[i],     c.ichi.senkB[i])
  const prevTop  = Math.max(c.ichi.senkA[i - 1], c.ichi.senkB[i - 1])
  return (
    candles[i - 1].close <= prevTop &&
    candles[i].close     >  kumoTop    // price breaks above cloud
  )
}

function sigStochRsiVol(candles: Candle[], i: number, c: Cache): boolean {
  if (i < 30) return false
  return (
    c.stochK[i - 1] < 20 &&
    c.stochK[i]     > 20 &&                         // stoch RSI crosses 20 upward
    candles[i].volume > c.volSma20[i] * 1.3          // above-average volume
  )
}

function sigIctOrderBlock(candles: Candle[], i: number, c: Cache): boolean {
  if (i < 4) return false
  // Find a recent bearish order block in the last 5 bars
  const slice = candles.slice(i - 4, i)
  const ob = slice.find(s => s.open > s.close && (s.open - s.close) / s.open > 0.003)
  if (!ob) return false
  // Current bar closes above the OB open (reclaiming bearish OB = bullish)
  return (
    candles[i].close > ob.open &&
    candles[i - 1].close <= ob.open
  )
}

function sigFibonacci(candles: Candle[], i: number, c: Cache): boolean {
  if (i < 55) return false
  const slice = candles.slice(i - 50, i)
  const swHigh = Math.max(...slice.map(s => s.high))
  const swLow  = Math.min(...slice.map(s => s.low))
  const range = swHigh - swLow
  if (range < swLow * 0.015) return false        // skip tiny range
  const fib618 = swHigh - range * 0.618
  return (
    Math.abs(candles[i].close - fib618) / fib618 < 0.005 &&
    c.rsi14[i] < 50 &&
    candles[i].close > candles[i].open
  )
}

function sigVolumeMomentum(candles: Candle[], i: number, c: Cache): boolean {
  if (i < 22) return false
  return (
    candles[i].volume > c.volSma20[i] * 2.0 &&
    candles[i].close  > candles[i].open &&
    candles[i].high   > c.highSma20[i - 1] &&   // breaks 20-bar high avg
    c.ema8[i] > c.ema21[i]                       // short trend above long
  )
}

// ── Strategy registry ─────────────────────────────────────────

const STRATEGIES: { name: string; label: string; fn: SigFn }[] = [
  { name: 'rsi_macd',            label: 'RSI + MACD',               fn: sigRsiMacd          },
  { name: 'ema_crossover',       label: 'EMA 21/55 Crossover',      fn: sigEmaCross         },
  { name: 'bollinger_squeeze',   label: 'Bollinger Band Squeeze',   fn: sigBollinger        },
  { name: 'vwap_mean_reversion', label: 'VWAP Mean Reversion',      fn: sigVwap             },
  { name: 'support_resistance',  label: 'S/R Bounce',               fn: sigSupportResistance},
  { name: 'ichimoku',            label: 'Ichimoku Cloud Break',     fn: sigIchimoku         },
  { name: 'stoch_rsi_volume',    label: 'Stoch RSI + Volume',       fn: sigStochRsiVol      },
  { name: 'ict_order_block',     label: 'ICT Order Block',          fn: sigIctOrderBlock    },
  { name: 'fibonacci',           label: 'Fibonacci Retracement',    fn: sigFibonacci        },
  { name: 'volume_momentum',     label: 'Volume-Momentum Breakout', fn: sigVolumeMomentum   },
]

// ── Independent signal simulation ────────────────────────────
// Each signal is simulated in isolation — no position lock.
// TP vs SL order is resolved by candle open/close direction.

const TP_GRID  = [1.5, 2.0, 2.5, 3.0]
const TP2_GRID = [3.0, 4.0, 5.0]
const SL_GRID  = [1.0, 1.5, 2.0]
const MAX_HOLD = 32   // candles (~8 h at 15m) before timeout exit

function simulateSignal(
  candles: Candle[],
  entryIdx: number,
  tp_pct: number,
  sl_pct: number,
): number {   // returns realised PnL %
  const entry = candles[entryIdx].close
  const tpPrice = entry * (1 + tp_pct / 100)
  const slPrice = entry * (1 - sl_pct / 100)

  for (let j = entryIdx + 1; j < Math.min(entryIdx + MAX_HOLD + 1, candles.length); j++) {
    const { high, low, open, close } = candles[j]
    const hitTP = high >= tpPrice
    const hitSL = low  <= slPrice

    if (hitTP && hitSL) {
      // Both in same candle: bullish candle → TP hit first; bearish → SL hit first
      return close >= open ? tp_pct : -sl_pct
    }
    if (hitTP) return tp_pct
    if (hitSL) return -sl_pct
  }

  // Timeout: exit at actual close price (not a forced loss)
  const exitIdx = Math.min(entryIdx + MAX_HOLD, candles.length - 1)
  return ((candles[exitIdx].close - entry) / entry) * 100
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

// ── Grid search over TP/SL params for one strategy ───────────
// Scans EVERY candle independently — concurrent signals captured.

function optimiseStrategy(
  candles: Candle[],
  fn: SigFn,
  cache: Cache,
): StrategyResult | null {
  let best: StrategyResult | null = null

  for (const tp of TP_GRID) {
    for (const tp2 of TP2_GRID) {
      if (tp2 <= tp) continue
      for (const sl of SL_GRID) {
        const pnls: number[] = []

        // Scan EVERY candle — no skip, no lock
        for (let i = 55; i < candles.length - MAX_HOLD - 1; i++) {
          if (fn(candles, i, cache)) {
            pnls.push(simulateSignal(candles, i, tp, sl))
          }
        }

        if (pnls.length < 3) continue   // need at least 3 independent trades

        const wins      = pnls.filter(p => p > 0).length
        const totalPnl  = pnls.reduce((a, b) => a + b, 0)
        let cumPnl = 0
        const equity = pnls.map(p => { cumPnl += p; return cumPnl })
        const mdd = maxDrawdown(equity)

        if (mdd >= 20) continue          // reject high-drawdown combos

        if (!best || totalPnl > best.total_pnl_pct) {
          best = {
            name:             '',   // filled by caller
            label:            '',
            win_rate:         (wins / pnls.length) * 100,
            total_pnl_pct:    totalPnl,
            max_drawdown_pct: mdd,
            total_trades:     pnls.length,
            tp_pct:           tp,
            tp2_pct:          tp2,
            sl_pct:           sl,
          }
        }
      }
    }
  }

  return best
}

// ── Public API ────────────────────────────────────────────────

export function runAllStrategies(candles: Candle[]): StrategyResult[] {
  if (candles.length < 100) return []

  const cache = buildCache(candles)
  const results: StrategyResult[] = []

  for (const { name, label, fn } of STRATEGIES) {
    try {
      const r = optimiseStrategy(candles, fn, cache)
      results.push(
        r
          ? { ...r, name, label }
          : { name, label, win_rate: 0, total_pnl_pct: 0, max_drawdown_pct: 100, total_trades: 0, tp_pct: 2, tp2_pct: 4, sl_pct: 1.5 }
      )
    } catch {
      results.push({ name, label, win_rate: 0, total_pnl_pct: 0, max_drawdown_pct: 100, total_trades: 0, tp_pct: 2, tp2_pct: 4, sl_pct: 1.5 })
    }
  }

  return results
}

export function pickBest(results: StrategyResult[]): StrategyResult | null {
  const valid = results.filter(r => r.total_trades >= 3 && r.max_drawdown_pct < 20)
  if (!valid.length) return results.sort((a, b) => b.total_pnl_pct - a.total_pnl_pct)[0] ?? null
  return valid.sort((a, b) => b.total_pnl_pct - a.total_pnl_pct)[0]
}
