-- ASTHEN BOT 2.10.0
-- Upgrade an existing asthen_bot_kits table created by the 2.7.0 schema.
-- Safe to run more than once in Supabase > SQL Editor.

alter table public.asthen_bot_kits
  add column if not exists store_configured boolean not null default false,
  add column if not exists manually_unavailable boolean not null default false,
  add column if not exists missing_from_plugin boolean not null default false;

