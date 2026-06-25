export const COINS = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','MATICUSDT',
  'LINKUSDT','UNIUSDT','LTCUSDT','ATOMUSDT','NEARUSDT',
  'APTUSDT','ARBUSDT','OPUSDT','INJUSDT','TIAUSDT',
]

export const STRATEGIES = [
  { id: 'rsi_macd',            label: 'RSI + MACD' },
  { id: 'ema_crossover',       label: 'EMA 21/55 Crossover' },
  { id: 'bollinger_squeeze',   label: 'Bollinger Band Squeeze' },
  { id: 'vwap_mean_reversion', label: 'VWAP Mean Reversion' },
  { id: 'support_resistance',  label: 'S/R Bounce' },
  { id: 'ichimoku',            label: 'Ichimoku Cloud' },
  { id: 'stoch_rsi_volume',    label: 'Stoch RSI + Volume' },
  { id: 'ict_order_block',     label: 'ICT Order Block + FVG' },
  { id: 'fibonacci',           label: 'Fibonacci Retracement' },
  { id: 'volume_momentum',     label: 'Volume-Momentum Breakout' },
]

export const INTERVALS = [
  { value: '15m', label: '15 Minutes' },
  { value: '1h',  label: '1 Hour' },
  { value: '4h',  label: '4 Hours' },
  { value: '1d',  label: '1 Day' },
]

// Best strategy combos per coin (from Jan-Dec 2024 backtest, 1h, EMA200+Session filters)
export const COIN_BEST_SETTINGS: Record<string, {
  strategies: string[]
  confluence: number
  win_rate: number
  total_pnl: number
  trades: number
}> = {
  BTCUSDT:   { strategies: ['support_resistance','bollinger_squeeze','fibonacci'], confluence: 2, win_rate: 58.9, total_pnl: 68,    trades: 107 },
  MATICUSDT: { strategies: ['fibonacci','ema_crossover','bollinger_squeeze'],      confluence: 2, win_rate: 60.9, total_pnl: 16.5,  trades: 23  },
  LINKUSDT:  { strategies: ['ema_crossover','volume_momentum','ichimoku'],         confluence: 1, win_rate: 60.5, total_pnl: 78.5,  trades: 114 },
  OPUSDT:    { strategies: ['support_resistance','ichimoku','volume_momentum'],    confluence: 1, win_rate: 57.5, total_pnl: 62.5,  trades: 106 },
  AVAXUSDT:  { strategies: ['volume_momentum','ema_crossover','bollinger_squeeze'],confluence: 2, win_rate: 52.2, total_pnl: 120.5, trades: 245 },
  SOLUSDT:   { strategies: ['ema_crossover','bollinger_squeeze','ict_order_block'],confluence: 2, win_rate: 50.9, total_pnl: 68,    trades: 171 },
  UNIUSDT:   { strategies: ['fibonacci','ema_crossover'],                          confluence: 1, win_rate: 50.8, total_pnl: 52,    trades: 99  },
  INJUSDT:   { strategies: ['ema_crossover','support_resistance','bollinger_squeeze'],confluence:2,win_rate: 50.0, total_pnl: 6,    trades: 16  },
  ETHUSDT:   { strategies: ['bollinger_squeeze','volume_momentum','ichimoku'],     confluence: 2, win_rate: 49.8, total_pnl: 163,   trades: 498 },
  ARBUSDT:   { strategies: ['ichimoku','volume_momentum','support_resistance'],    confluence: 2, win_rate: 49.2, total_pnl: 108,   trades: 252 },
  BNBUSDT:   { strategies: ['support_resistance','volume_momentum','bollinger_squeeze'],confluence:2,win_rate:49.5,total_pnl:128.94,trades:549 },
  NEARUSDT:  { strategies: ['volume_momentum','stoch_rsi_volume','support_resistance'],confluence:2,win_rate:47.5,total_pnl:12.5, trades: 40 },
  ATOMUSDT:  { strategies: ['volume_momentum','ichimoku','ict_order_block'],       confluence: 2, win_rate: 46.5, total_pnl: 128.5, trades: 593 },
  LTCUSDT:   { strategies: ['volume_momentum','ict_order_block','bollinger_squeeze'],confluence:2,win_rate: 46.4, total_pnl: 76,   trades: 306 },
  DOGEUSDT:  { strategies: ['ict_order_block','volume_momentum','bollinger_squeeze'],confluence:2,win_rate: 46.2, total_pnl: 91,   trades: 316 },
  APTUSDT:   { strategies: ['volume_momentum','bollinger_squeeze','ichimoku'],     confluence: 2, win_rate: 44.6, total_pnl: 91,    trades: 487 },
  ADAUSDT:   { strategies: ['ema_crossover','volume_momentum','support_resistance'],confluence:2, win_rate: 48.8, total_pnl: 41,   trades: 129 },
  XRPUSDT:   { strategies: ['ema_crossover','ichimoku'],                           confluence: 1, win_rate: 47.8, total_pnl: 36.5,  trades: 178 },
  TIAUSDT:   { strategies: ['fibonacci','ema_crossover','volume_momentum'],        confluence: 2, win_rate: 46.9, total_pnl: 87,    trades: 335 },
  DOTUSDT:   { strategies: ['stoch_rsi_volume','ema_crossover'],                   confluence: 1, win_rate: 51.9, total_pnl: 177,   trades: 470 },
}

export const DEFAULT_PARAMS: Record<string, { key: string; label: string; default: number }[]> = {
  rsi_macd: [
    { key: 'rsi_period',     label: 'RSI Period',     default: 14 },
    { key: 'rsi_overbought', label: 'RSI Overbought', default: 70 },
    { key: 'rsi_oversold',   label: 'RSI Oversold',   default: 30 },
    { key: 'macd_fast',      label: 'MACD Fast EMA',  default: 12 },
    { key: 'macd_slow',      label: 'MACD Slow EMA',  default: 26 },
    { key: 'macd_signal',    label: 'Signal Line',    default: 9  },
  ],
  ema_crossover: [
    { key: 'ema_fast', label: 'Fast EMA Period', default: 21 },
    { key: 'ema_slow', label: 'Slow EMA Period', default: 55 },
  ],
  bollinger_squeeze: [
    { key: 'bb_period', label: 'BB Period', default: 20 },
    { key: 'bb_std',    label: 'Std Multiplier', default: 2 },
  ],
  vwap_mean_reversion: [
    { key: 'vwap_deviation', label: 'Deviation %', default: 0.5 },
  ],
  support_resistance: [
    { key: 'sr_tolerance', label: 'Tolerance %', default: 0.3 },
  ],
  ichimoku: [],
  stoch_rsi_volume: [
    { key: 'stoch_overbought', label: 'Overbought', default: 80 },
    { key: 'stoch_oversold',   label: 'Oversold',   default: 20 },
  ],
  ict_order_block: [],
  fibonacci: [
    { key: 'fib_tolerance', label: 'Tolerance %', default: 0.3 },
  ],
  volume_momentum: [
    { key: 'vol_spike_mult', label: 'Volume Spike Multiplier', default: 2.0 },
  ],
}
