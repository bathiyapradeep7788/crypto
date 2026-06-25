export interface StrategyParam {
  key: string
  value: number
}

export interface BacktestConfig {
  coins: string[]
  start_dt: string
  end_dt: string
  strategies: string[]
  params: StrategyParam[]
  tp_pct: number
  tp2_pct: number
  sl_pct: number
  interval: string
  // Smart Filters
  use_trend_filter?: boolean
  trend_ema_period?: number
  use_session_filter?: boolean
  use_atr_tp_sl?: boolean
  atr_tp_mult?: number
  atr_sl_mult?: number
  min_confluence?: number
}

export interface CombinedStrategy {
  id: string
  name: string
  members: string[]
  strategy_a: string
  strategy_b: string
  logic: string
  params: Record<string, number>
  created_at: string
}

export interface TradeResult {
  coin: string
  strategy: string
  complete_calculation: Record<string, number | boolean>
  signal_date_time: string
  entry: number
  tp: number
  tp2: number
  sl: number
  end_time: string
  end_position: 'Hit TP1' | 'Hit TP2' | 'Hit SL' | 'Expired'
  win_loss_rate: 'Win' | 'Loss'
  profit_rate: number
}

export interface LogEntry {
  id?: number
  ts: string
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
}

export interface JobStatus {
  status: 'running' | 'done' | 'error' | 'not_found'
  processed: number
  total: number
  results?: TradeResult[]
}

export interface TradeSessionConfig {
  coin: string
  strategy_primary: string
  strategy_secondary?: string
  interval: string
  tp_pct: number
  tp2_pct: number
  sl_pct: number
  trade_usdt: number
  virtual_balance?: number
  ai_min_confidence: number
}

export interface OpenPosition {
  symbol: string
  direction: 'long' | 'short'
  entry: number
  tp: number
  tp2: number
  sl: number
  trade_usdt: number
  quantity?: number
  ai_confidence?: number
  ai_analysis?: string
  opened_at: string
}

export interface ClosedTrade extends OpenPosition {
  exit_price: number
  exit_reason: string
  profit_pct: number
  profit_usdt: number
  win: boolean
  closed_at: string
}

export interface TradingSession {
  session_id: string
  mode: 'paper' | 'live'
  status: 'running' | 'stopped'
  coin: string
  strategy: string
  interval: string
  balance?: number
  initial_balance?: number
  trade_usdt: number
  open_position: OpenPosition | null
  closed_trades: ClosedTrade[]
  total_pnl_pct: number
  wins: number
  losses: number
  started_at: string
  last_check: string | null
  current_price: number | null
  ai_min_confidence: number
}
