-- ASTHEN BOT 2.10.0
-- Execute em projetos que já possuem public.asthen_bot_kits.
-- Preço oficial em centavos e status de venda sincronizado do Plugin-ASTHEN 1.2.0.
-- Registros antigos começam indisponíveis até a próxima sincronização do plugin.

begin;

alter table public.asthen_bot_kits
  add column if not exists price_cents bigint null,
  add column if not exists plugin_for_sale boolean not null default false,
  add column if not exists for_sale boolean not null default false;

do $asthen$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'asthen_bot_kits_price_cents_positive'
      and conrelid = 'public.asthen_bot_kits'::regclass
  ) then
    alter table public.asthen_bot_kits
      add constraint asthen_bot_kits_price_cents_positive
      check (price_cents is null or price_cents > 0);
  end if;
end
$asthen$;

commit;
