-- ASTHEN BOT 2.10.0 — complete Supabase setup
-- Paste this entire file into Supabase > SQL Editor and run it once.
-- Safe to run again: tables and columns use IF NOT EXISTS.
-- The bot uses its Secret API Key only on the backend. Do not expose it to the browser or Discord.

begin;

create table if not exists public.asthen_bot_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint asthen_bot_state_singleton check (id = 'main')
);

alter table public.asthen_bot_state enable row level security;
revoke all on table public.asthen_bot_state from anon, authenticated;
grant all on table public.asthen_bot_state to service_role;

create table if not exists public.asthen_bot_kits (
  guild_id text not null,
  kit_id text not null,
  plugin_name text not null,
  display_name text not null,
  description text not null default '',
  price text not null default '',
  price_cents bigint null check (price_cents is null or price_cents > 0),
  plugin_for_sale boolean not null default false,
  for_sale boolean not null default false,
  image_url text not null default '',
  plugin_enabled boolean not null default true,
  store_configured boolean not null default false,
  manually_unavailable boolean not null default false,
  missing_from_plugin boolean not null default false,
  item_count integer not null default 0 check (item_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (guild_id, kit_id),
  unique (guild_id, plugin_name)
);

alter table public.asthen_bot_kits
  add column if not exists store_configured boolean not null default false,
  add column if not exists manually_unavailable boolean not null default false,
  add column if not exists missing_from_plugin boolean not null default false,
  add column if not exists price_cents bigint null,
  add column if not exists plugin_for_sale boolean not null default false,
  add column if not exists for_sale boolean not null default false;

create index if not exists asthen_bot_kits_guild_id_idx
  on public.asthen_bot_kits (guild_id);

alter table public.asthen_bot_kits enable row level security;
revoke all on table public.asthen_bot_kits from anon, authenticated;
grant all on table public.asthen_bot_kits to service_role;

commit;
