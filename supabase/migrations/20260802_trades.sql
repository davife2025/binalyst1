-- supabase/migrations/20260802_trades.sql — Session 8
--
-- Creates the trades table for cross-chain, cross-market trade persistence.
-- Run this in your Supabase SQL editor or via supabase db push.
--
-- RLS policy: each user can only read/write their own trades.

create table if not exists public.trades (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,

  -- Execution context
  chain          text        not null,  -- 'goat-mainnet' | 'goat-testnet' | 'bsc-mainnet' | 'bsc-testnet'
  market_type    text        not null,  -- 'crypto' | 'forex' | 'stocks' | 'meme'
  symbol         text        not null,  -- e.g. 'BTC', 'EUR/USD', 'AAPL', 'PEPE'
  side           text        not null check (side in ('buy','sell','BUY','SELL')),

  -- Amounts
  amount_usd     numeric     not null default 0,
  pnl_usd        numeric     not null default 0,

  -- Execution
  tx_hash        text,                  -- null for dry-run / simulated / blocked
  status         text        not null default 'simulated',
                                        -- 'confirmed' | 'simulated' | 'failed' | 'blocked'
  dry_run        boolean     not null default true,

  -- Signal metadata (optional, stored for performance review)
  signal_score   integer,
  regime         text,                  -- 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'FLAT'

  -- Risk profile snapshot at time of trade
  risk_preset    text,                  -- 'conservative' | 'moderate' | 'aggressive'
  risk_drawdown  numeric,               -- maxDrawdownPct at time of trade

  -- x402 payment (if signal data was paid for)
  x402_payment_id text,

  -- Timestamps
  executed_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists trades_user_id_idx        on public.trades (user_id);
create index if not exists trades_executed_at_idx    on public.trades (user_id, executed_at desc);
create index if not exists trades_chain_idx          on public.trades (user_id, chain);
create index if not exists trades_market_type_idx    on public.trades (user_id, market_type);
create index if not exists trades_status_idx         on public.trades (user_id, status);

-- Row-level security
alter table public.trades enable row level security;

create policy "Users can view own trades"
  on public.trades for select
  using (auth.uid() = user_id);

create policy "Users can insert own trades"
  on public.trades for insert
  with check (auth.uid() = user_id);

-- Service role can insert without RLS (for server-side writes)
create policy "Service role full access"
  on public.trades for all
  using (auth.role() = 'service_role');
