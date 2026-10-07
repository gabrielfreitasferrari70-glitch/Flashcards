-- =====================================================================
-- MedReview — migração das 8 novas funcionalidades (rodar 1x no SQL Editor)
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

-- Quem é a conta mestre
create or replace function public.is_master() returns boolean
language sql stable as $$
  select auth.uid() = '2c337bd5-b283-4ce8-9c0a-c817e4cdd697'::uuid
$$;

-- ---------- Colunas extras nas cartas (grupo, referência, imagem, oclusão, etiquetas)
alter table public.mr_cards add column if not exists "group" text default '';
alter table public.mr_cards add column if not exists ref text default '';
alter table public.mr_cards add column if not exists reverse boolean default false;
alter table public.mr_cards add column if not exists choices jsonb;
alter table public.mr_cards add column if not exists image_url text;
alter table public.mr_cards add column if not exists occlusion jsonb;
alter table public.mr_cards add column if not exists tags text[] default '{}';

-- ---------- (3) Reportar erro em carta
create table if not exists public.mr_card_reports (
  id uuid default gen_random_uuid() primary key,
  card_id uuid references public.mr_cards(id) on delete cascade not null,
  user_id uuid references auth.users not null default auth.uid(),
  reason text not null,
  resolved boolean default false,
  created_at timestamptz default now()
);
alter table public.mr_card_reports enable row level security;
drop policy if exists "rep_insert" on public.mr_card_reports;
drop policy if exists "rep_select" on public.mr_card_reports;
drop policy if exists "rep_update" on public.mr_card_reports;
drop policy if exists "rep_delete" on public.mr_card_reports;
create policy "rep_insert" on public.mr_card_reports for insert with check (auth.uid() = user_id);
create policy "rep_select" on public.mr_card_reports for select using (auth.uid() = user_id or public.is_master());
create policy "rep_update" on public.mr_card_reports for update using (public.is_master());
create policy "rep_delete" on public.mr_card_reports for delete using (public.is_master());

-- Mestre pode ver nome/e-mail de quem reportou
drop policy if exists "Mestre vê perfis" on public.profiles;
create policy "Mestre vê perfis" on public.profiles for select using (public.is_master());

-- ---------- (4) Anotação pessoal em qualquer carta
create table if not exists public.mr_card_notes (
  card_id uuid references public.mr_cards(id) on delete cascade not null,
  user_id uuid references auth.users not null default auth.uid(),
  note text not null default '',
  updated_at timestamptz default now(),
  primary key (card_id, user_id)
);
alter table public.mr_card_notes enable row level security;
drop policy if exists "notes_own" on public.mr_card_notes;
create policy "notes_own" on public.mr_card_notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- (2) Modo Prova: data da prova por pasta
create table if not exists public.mr_exam_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null default auth.uid(),
  deck_id uuid references public.mr_decks(id) on delete cascade not null,
  exam_date date not null,
  created_at timestamptz default now(),
  unique (user_id, deck_id)
);
alter table public.mr_exam_plans enable row level security;
drop policy if exists "exam_own" on public.mr_exam_plans;
create policy "exam_own" on public.mr_exam_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- (6) Painel do professor: estatística ANÔNIMA das cartas do mestre
create or replace function public.master_card_stats()
returns table (card_id uuid, reviews bigint, lapses bigint, students bigint)
language sql stable security definer set search_path = public as $$
  select r.card_id,
         count(*)                                   as reviews,
         count(*) filter (where r.rating = 'again') as lapses,
         count(distinct r.user_id)                  as students
  from public.mr_reviews r
  join public.mr_cards c on c.id = r.card_id
  where public.is_master() and c.user_id = auth.uid()
  group by r.card_id
$$;
grant execute on function public.master_card_stats() to authenticated;

-- ---------- (1) Imagens das cartas (oclusão de imagem)
insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', true)
on conflict (id) do nothing;
drop policy if exists "card_images_read" on storage.objects;
drop policy if exists "card_images_insert" on storage.objects;
drop policy if exists "card_images_delete" on storage.objects;
create policy "card_images_read" on storage.objects for select
  using (bucket_id = 'card-images');
create policy "card_images_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "card_images_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);
