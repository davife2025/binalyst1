-- supabase/migrations/20260803_strategies.sql — Session 12
--
-- Persists user strategies to Supabase so they survive browser refresh.
-- Run in Supabase SQL Editor or via supabase db push.

create table if not exists public.strategies (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  name         text        not null default 'My Strategy',
  text         text        not null default '',
  rules        jsonb       not null default '[]',
  market_type  text        not null default 'crypto',
  is_active    boolean     not null default false,
  backtest_result jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists strategies_user_id_idx on public.strategies (user_id);
create index if not exists strategies_active_idx  on public.strategies (user_id, is_active);

alter table public.strategies enable row level security;

create policy "Users can manage own strategies"
  on public.strategies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Service role full access"
  on public.strategies for all
  using (auth.role() = 'service_role');

-- Auto-update updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger strategies_touch_updated_at
  before update on public.strategies
  for each row execute function public.touch_updated_at();
