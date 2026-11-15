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


-- ASTHEN BOT 2.11.0 — estoque semanal de 10 unidades por kit.
-- Semana comercial: domingo 00:00 até sábado 23:59:59, horário de Brasília.
-- Execute após as migrações anteriores em projetos existentes. Pode ser executado novamente.

begin;

create table if not exists public.asthen_bot_weekly_stock (
  guild_id text not null,
  kit_id text not null,
  week_start date not null,
  reserved_count integer not null default 0,
  weekly_limit integer not null default 10 check (weekly_limit = 10),
  updated_at timestamptz not null default now(),
  primary key (guild_id, kit_id, week_start),
  check (reserved_count >= 0 and reserved_count <= weekly_limit),
  check (extract(dow from week_start) = 0)
);

create index if not exists asthen_bot_weekly_stock_guild_week_idx
  on public.asthen_bot_weekly_stock (guild_id, week_start);

create table if not exists public.asthen_bot_stock_reservations (
  guild_id text not null,
  request_id text not null,
  kit_id text not null,
  week_start date not null,
  created_at timestamptz not null default now(),
  primary key (guild_id, request_id)
);

create index if not exists asthen_bot_stock_reservations_week_idx
  on public.asthen_bot_stock_reservations (guild_id, kit_id, week_start);

alter table public.asthen_bot_weekly_stock enable row level security;
alter table public.asthen_bot_stock_reservations enable row level security;
revoke all on table public.asthen_bot_weekly_stock from anon, authenticated;
revoke all on table public.asthen_bot_stock_reservations from anon, authenticated;
grant all on table public.asthen_bot_weekly_stock to service_role;
grant all on table public.asthen_bot_stock_reservations to service_role;

create or replace function public.reserve_asthen_weekly_kit_stock(
  p_guild_id text,
  p_kit_id text,
  p_request_id text,
  p_week_start date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_existing_kit text;
  v_existing_week date;
  v_reserved_count integer;
  v_weekly_limit integer;
begin
  if coalesce(trim(p_guild_id), '') = ''
    or coalesce(trim(p_kit_id), '') = ''
    or coalesce(trim(p_request_id), '') = ''
    or length(p_request_id) > 128 then
    raise exception 'guild_id, kit_id ou request_id inválido';
  end if;

  if extract(dow from p_week_start) <> 0 then
    raise exception 'week_start precisa ser um domingo';
  end if;

  insert into public.asthen_bot_stock_reservations (guild_id, request_id, kit_id, week_start)
  values (p_guild_id, p_request_id, p_kit_id, p_week_start)
  on conflict (guild_id, request_id) do nothing;

  if not found then
    select kit_id, week_start
      into v_existing_kit, v_existing_week
      from public.asthen_bot_stock_reservations
      where guild_id = p_guild_id and request_id = p_request_id;

    if not found or v_existing_kit <> p_kit_id then
      return jsonb_build_object('ok', false, 'reason', 'request_conflict');
    end if;

    select reserved_count, weekly_limit
      into v_reserved_count, v_weekly_limit
      from public.asthen_bot_weekly_stock
      where guild_id = p_guild_id and kit_id = p_kit_id and week_start = v_existing_week;

    return jsonb_build_object(
      'ok', true,
      'already_reserved', true,
      'week_start', v_existing_week,
      'reserved_count', coalesce(v_reserved_count, 1),
      'weekly_limit', coalesce(v_weekly_limit, 10),
      'remaining', greatest(0, coalesce(v_weekly_limit, 10) - coalesce(v_reserved_count, 1))
    );
  end if;

  insert into public.asthen_bot_weekly_stock (guild_id, kit_id, week_start)
  values (p_guild_id, p_kit_id, p_week_start)
  on conflict (guild_id, kit_id, week_start) do nothing;

  update public.asthen_bot_weekly_stock
    set reserved_count = reserved_count + 1,
        updated_at = now()
    where guild_id = p_guild_id
      and kit_id = p_kit_id
      and week_start = p_week_start
      and reserved_count < weekly_limit
    returning reserved_count, weekly_limit
      into v_reserved_count, v_weekly_limit;

  if not found then
    delete from public.asthen_bot_stock_reservations
      where guild_id = p_guild_id and request_id = p_request_id;
    select reserved_count, weekly_limit
      into v_reserved_count, v_weekly_limit
      from public.asthen_bot_weekly_stock
      where guild_id = p_guild_id and kit_id = p_kit_id and week_start = p_week_start;
    return jsonb_build_object(
      'ok', false,
      'reason', 'sold_out',
      'week_start', p_week_start,
      'reserved_count', coalesce(v_reserved_count, 10),
      'weekly_limit', coalesce(v_weekly_limit, 10),
      'remaining', 0
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_reserved', false,
    'week_start', p_week_start,
    'reserved_count', v_reserved_count,
    'weekly_limit', v_weekly_limit,
    'remaining', greatest(0, v_weekly_limit - v_reserved_count)
  );
end;
$function$;

revoke all on function public.reserve_asthen_weekly_kit_stock(text, text, text, date) from public, anon, authenticated;
grant execute on function public.reserve_asthen_weekly_kit_stock(text, text, text, date) to service_role;

commit;
