-- ============================================================
--  AlgoBot — Optimization Engine Schema
--  Run this in Supabase SQL Editor:
--  https://supabase.com/dashboard/project/llctmrzftfijdnixcffz/sql
-- ============================================================

-- Table 1: Raw 15-minute OHLCV candle data
CREATE TABLE IF NOT EXISTS historical_15m_data (
  id        bigserial PRIMARY KEY,
  coin      text        NOT NULL,
  ts        timestamptz NOT NULL,
  open      numeric     NOT NULL,
  high      numeric     NOT NULL,
  low       numeric     NOT NULL,
  close     numeric     NOT NULL,
  volume    numeric     NOT NULL,
  UNIQUE (coin, ts)
);

CREATE INDEX IF NOT EXISTS idx_hist_15m_coin_ts ON historical_15m_data (coin, ts);

-- Table 2: Best strategy result per coin
CREATE TABLE IF NOT EXISTS best_strategy_results (
  coin                    text    PRIMARY KEY,
  best_strategy_name      text    NOT NULL,
  win_rate_percentage     float   NOT NULL DEFAULT 0,
  total_pnl_percentage    float   NOT NULL DEFAULT 0,
  max_drawdown_percentage float   NOT NULL DEFAULT 0,
  total_trades            int     NOT NULL DEFAULT 0,
  tp_pct                  float,
  tp2_pct                 float,
  sl_pct                  float,
  updated_at              timestamptz DEFAULT now()
);

-- Enable Row Level Security (read-only from anon key)
ALTER TABLE historical_15m_data  ENABLE ROW LEVEL SECURITY;
ALTER TABLE best_strategy_results ENABLE ROW LEVEL SECURITY;

-- Allow anon reads
CREATE POLICY "anon_read_hist"
  ON historical_15m_data FOR SELECT
  TO anon USING (true);

CREATE POLICY "anon_read_best"
  ON best_strategy_results FOR SELECT
  TO anon USING (true);

-- Service role has full access (bypasses RLS by default)
