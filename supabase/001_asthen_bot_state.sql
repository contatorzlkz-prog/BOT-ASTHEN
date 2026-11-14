-- ASTHEN BOT 2.6.0
-- Execute uma vez no Supabase > SQL Editor.
-- O bot mantém apenas o snapshot do estado atual em uma linha.

create table if not exists public.asthen_bot_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint asthen_bot_state_singleton check (id = 'main')
);

alter table public.asthen_bot_state enable row level security;

revoke all on table public.asthen_bot_state from anon, authenticated;
grant all on table public.asthen_bot_state to service_role;
