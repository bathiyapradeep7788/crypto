-- Monitor positions table (one open position per coin per mode max)
CREATE TABLE IF NOT EXISTS monitor_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL,
  coin TEXT NOT NULL,
  strategy TEXT NOT NULL,
  direction TEXT NOT NULL,
  entry_price NUMERIC NOT NULL,
  tp NUMERIC NOT NULL,
  tp2 NUMERIC NOT NULL,
  sl NUMERIC NOT NULL,
  trade_usdt NUMERIC DEFAULT 100,
  status TEXT DEFAULT 'open',
  ai_confidence NUMERIC,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monitor closed/think trade history
CREATE TABLE IF NOT EXISTS monitor_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL,
  coin TEXT NOT NULL,
  strategy TEXT NOT NULL,
  direction TEXT NOT NULL,
  entry_price NUMERIC,
  tp NUMERIC,
  tp2 NUMERIC,
  sl NUMERIC,
  exit_price NUMERIC,
  exit_reason TEXT,
  trade_usdt NUMERIC DEFAULT 100,
  profit_pct NUMERIC,
  profit_usdt NUMERIC,
  win BOOLEAN,
  status TEXT DEFAULT 'closed',
  ai_confidence NUMERIC,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
