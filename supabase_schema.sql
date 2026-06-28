-- ============================================================
-- Run this FULL script in Supabase SQL Editor
-- Project → SQL Editor → New Query → paste → Run
-- ============================================================

-- 1. Backtest results (already exists, safe to re-run)
create table if not exists backtest_results (
  id                   uuid primary key default gen_random_uuid(),
  coin                 text not null,
  strategy             text not null,
  complete_calculation jsonb,
  signal_date_time     timestamptz,
  entry                numeric,
  tp                   numeric,
  tp2                  numeric,
  sl                   numeric,
  end_time             timestamptz,
  end_position         text,
  win_loss_rate        text,
  profit_rate          numeric,
  created_at           timestamptz default now()
);

create index if not exists idx_backtest_coin_strategy
  on backtest_results (coin, strategy, signal_date_time);


-- 2. Paper trades
create table if not exists paper_trades (
  id             uuid primary key default gen_random_uuid(),
  session_id     text not null,
  coin           text not null,
  direction      text not null,
  entry_price    numeric,
  tp             numeric,
  tp2            numeric,
  sl             numeric,
  exit_price     numeric,
  exit_reason    text,
  profit_pct     numeric,
  profit_usdt    numeric,
  ai_confidence  integer,
  ai_analysis    text,
  opened_at      timestamptz,
  closed_at      timestamptz,
  created_at     timestamptz default now()
);

create index if not exists idx_paper_trades_session
  on paper_trades (session_id, created_at desc);


-- 3. Live trades
create table if not exists live_trades (
  id              uuid primary key default gen_random_uuid(),
  session_id      text not null,
  coin            text not null,
  direction       text not null,
  entry_price     numeric,
  quantity        numeric,
  tp              numeric,
  sl              numeric,
  exit_price      numeric,
  exit_reason     text,
  profit_pct      numeric,
  profit_usdt     numeric,
  ai_confidence   integer,
  ai_analysis     text,
  entry_order_id  text,
  exit_order_id   text,
  opened_at       timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz default now()
);

create index if not exists idx_live_trades_session
  on live_trades (session_id, created_at desc);


-- 4. Enable Row Level Security (open policy for service_role key)
alter table backtest_results enable row level security;
alter table paper_trades     enable row level security;
alter table live_trades      enable row level security;

-- Allow service_role to do everything (backend uses service_role key)
do $$ begin
  if not exists (select 1 from pg_policies where tablename='backtest_results' and policyname='service_all') then
    create policy service_all on backtest_results for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='paper_trades' and policyname='service_all') then
    create policy service_all on paper_trades for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='live_trades' and policyname='service_all') then
    create policy service_all on live_trades for all using (true) with check (true);
  end if;
end $$;


-- 5. Per-coin optimization results (best strategy + optimized TP/SL per coin)
create table if not exists coin_best_strategies (
  id              uuid primary key default gen_random_uuid(),
  coin            text not null,
  strategy_id     text not null,
  strategy_label  text,
  tp_pct          numeric,
  tp2_pct         numeric,
  sl_pct          numeric,
  win_rate        numeric,
  total_pnl_pct   numeric,
  total_trades    integer,
  start_dt        text,
  end_dt          text,
  interval        text,
  all_strategies  jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create unique index if not exists idx_coin_best_strategies_coin
  on coin_best_strategies (coin);

alter table coin_best_strategies enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='coin_best_strategies' and policyname='service_all') then
    create policy service_all on coin_best_strategies for all using (true) with check (true);
  end if;
end $$;
