export const COINS = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'ADAUSDT','TRXUSDT','LINKUSDT','DOGEUSDT','XLMUSDT',
]

export const COIN_LABELS: Record<string, string> = {
  BTCUSDT:  'BTC',
  ETHUSDT:  'ETH',
  BNBUSDT:  'BNB',
  SOLUSDT:  'SOL',
  XRPUSDT:  'XRP',
  ADAUSDT:  'ADA',
  TRXUSDT:  'TRX',
  LINKUSDT: 'LINK',
  DOGEUSDT: 'DOGE',
  XLMUSDT:  'XLM',
}

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

export const STRATEGY_LABELS: Record<string, string> = {
  rsi_macd:            'RSI + MACD',
  ema_crossover:       'EMA 21/55 Crossover',
  bollinger_squeeze:   'Bollinger Band Squeeze',
  vwap_mean_reversion: 'VWAP Mean Reversion',
  support_resistance:  'S/R Bounce',
  ichimoku:            'Ichimoku Cloud',
  stoch_rsi_volume:    'Stoch RSI + Volume',
  ict_order_block:     'ICT Order Block + FVG',
  fibonacci:           'Fibonacci Retracement',
  volume_momentum:     'Volume-Momentum Breakout',
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
