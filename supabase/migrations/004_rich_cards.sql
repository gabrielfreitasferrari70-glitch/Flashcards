-- =====================================================================
-- MedReview — cartões "ricos" v2 (verso em camadas)
-- Aditiva e idempotente: só cria uma coluna nova e anulável.
-- Nenhum cartão existente é alterado; sem `rich`, o cartão aparece como sempre.
-- Rodar 1x no SQL Editor ANTES de publicar a versão do app que lê `rich`.
-- =====================================================================

alter table public.mr_cards add column if not exists rich jsonb;

-- Garante que, quando preenchida, a coluna seja um objeto JSON (e não texto solto)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mr_cards_rich_is_object'
  ) then
    alter table public.mr_cards
      add constraint mr_cards_rich_is_object
      check (rich is null or jsonb_typeof(rich) = 'object');
  end if;
end $$;

comment on column public.mr_cards.rich is
  'Verso estruturado v2: {v:2, answer, why, bullets, pearls, compare, mnemonic, related, source, highYield, review}. NULL = cartão clássico (q/a).';
