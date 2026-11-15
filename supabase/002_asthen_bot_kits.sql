-- ASTHEN BOT 2.9.0
-- Execute after 001_asthen_bot_state.sql in Supabase > SQL Editor.
-- One row per shop kit in each Discord guild. The bot keeps state.json and
-- asthen_bot_state as local/full-state backups; this table is the normalized kit catalog.

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

-- Safe upgrades for projects that created the earlier 2.7.0 table.
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
