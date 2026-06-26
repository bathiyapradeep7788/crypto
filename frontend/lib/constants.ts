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

// Best strategy combos per coin — optimized Jan 2024–Jun 2025 backtest, 1h, EMA200+Session ON
// Updated 2025-06: strategies re-tuned for each coin to maximize 2025 live performance
export const COIN_BEST_SETTINGS: Record<string, {
  strategies: string[]
  confluence: number
  win_rate: number
  total_pnl: number
  trades: number
  pnl_2025?: number
  trades_2025?: number
}> = {
  OPUSDT:   { strategies: ['support_resistance','ichimoku','volume_momentum'],      confluence: 1, win_rate: 49.5, total_pnl: 752,   trades: 2170, pnl_2025: 387.5, trades_2025: 1116 },
  NEARUSDT: { strategies: ['volume_momentum','ichimoku','bollinger_squeeze'],       confluence: 1, win_rate: 45.2, total_pnl: 473.5, trades: 2463, pnl_2025: 405.5, trades_2025: 1325 },
  INJUSDT:  { strategies: ['volume_momentum','ichimoku','bollinger_squeeze'],       confluence: 1, win_rate: 45.3, total_pnl: 497.9, trades: 2568, pnl_2025: 134,   trades_2025: 1346 },
  TIAUSDT:  { strategies: ['volume_momentum','ichimoku','bollinger_squeeze'],       confluence: 1, win_rate: 42.0, total_pnl: 244.5, trades: 2619, pnl_2025: 258.5, trades_2025: 1217 },
  LINKUSDT: { strategies: ['ema_crossover','volume_momentum','ichimoku'],           confluence: 1, win_rate: 45.1, total_pnl: 299.8, trades: 2069, pnl_2025: 137.5, trades_2025: 1119 },
  SOLUSDT:  { strategies: ['volume_momentum','ichimoku','bollinger_squeeze'],       confluence: 1, win_rate: 42.5, total_pnl: 160,   trades: 2541, pnl_2025: 146.5, trades_2025: 1317 },
  XRPUSDT:  { strategies: ['ema_crossover','ichimoku'],                             confluence: 1, win_rate: 44.7, total_pnl: 287,   trades: 1697, pnl_2025: 128.1, trades_2025: 896  },
  MATICUSDT:{ strategies: ['volume_momentum','bollinger_squeeze','fibonacci'],      confluence: 1, win_rate: 51.4, total_pnl: 370.5, trades: 916,  pnl_2025: 0,     trades_2025: 0    },
  ETHUSDT:  { strategies: ['bollinger_squeeze','volume_momentum','ichimoku'],       confluence: 2, win_rate: 49.6, total_pnl: 160,   trades: 500,  pnl_2025: 96,    trades_2025: 268  },
  ATOMUSDT: { strategies: ['volume_momentum','ichimoku','ict_order_block'],         confluence: 2, win_rate: 46.5, total_pnl: 128.5, trades: 593,  pnl_2025: 57.6,  trades_2025: 276  },
  BNBUSDT:  { strategies: ['volume_momentum','ichimoku','bollinger_squeeze'],       confluence: 1, win_rate: 41.6, total_pnl: 15.9,  trades: 2507, pnl_2025: 80.3,  trades_2025: 1220 },
  AVAXUSDT: { strategies: ['volume_momentum','ema_crossover','bollinger_squeeze'],  confluence: 2, win_rate: 52.2, total_pnl: 120.5, trades: 245,  pnl_2025: 23,    trades_2025: 99   },
  ADAUSDT:  { strategies: ['ema_crossover','volume_momentum','support_resistance'], confluence: 1, win_rate: 46.9, total_pnl: 121.5, trades: 540,  pnl_2025: 5.5,   trades_2025: 276  },
  ARBUSDT:  { strategies: ['ichimoku','volume_momentum','support_resistance'],      confluence: 2, win_rate: 49.2, total_pnl: 108,   trades: 252,  pnl_2025: 24,    trades_2025: 142  },
  DOTUSDT:  { strategies: ['stoch_rsi_volume','ema_crossover'],                     confluence: 1, win_rate: 51.3, total_pnl: 95,    trades: 275,  pnl_2025: 15,    trades_2025: 115  },
  APTUSDT:  { strategies: ['volume_momentum','bollinger_squeeze','ichimoku'],       confluence: 2, win_rate: 44.6, total_pnl: 91,    trades: 487,  pnl_2025: 25,    trades_2025: 225  },
  DOGEUSDT: { strategies: ['ict_order_block','volume_momentum','bollinger_squeeze'],confluence: 2, win_rate: 45.9, total_pnl: 88,    trades: 318,  pnl_2025: 73.5,  trades_2025: 170  },
  LTCUSDT:  { strategies: ['volume_momentum','ict_order_block','bollinger_squeeze'],confluence: 2, win_rate: 46.3, total_pnl: 74.5,  trades: 307,  pnl_2025: 25.5,  trades_2025: 142  },
  UNIUSDT:  { strategies: ['ema_crossover','volume_momentum','support_resistance'], confluence: 1, win_rate: 42.2, total_pnl: 46,    trades: 540,  pnl_2025: 32,    trades_2025: 242  },
  BTCUSDT:  { strategies: ['support_resistance','bollinger_squeeze','fibonacci'],   confluence: 2, win_rate: 58.9, total_pnl: 68,    trades: 107,  pnl_2025: 16.8,  trades_2025: 56   },
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
