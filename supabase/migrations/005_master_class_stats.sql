-- Painel da turma: estatísticas agregadas de TODOS os alunos, visíveis só para o docente (admin).
-- mr_reviews tem RLS "só o próprio usuário", então o agregado precisa de SECURITY DEFINER.
-- As funções devolvem apenas totais por cartão (sem identificar aluno).

create or replace function public.master_card_stats()
returns table (card_id uuid, reviews bigint, lapses bigint, students bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is distinct from '2c337bd5-b283-4ce8-9c0a-c817e4cdd697'::uuid then
    raise exception 'Acesso exclusivo do docente' using errcode = '42501';
  end if;
  return query
    select r.card_id,
           count(*)::bigint,
           count(*) filter (where r.rating = 'again')::bigint,
           count(distinct r.user_id)::bigint
    from public.mr_reviews r
    where r.card_id is not null
    group by r.card_id;
end $$;

create or replace function public.master_class_overview()
returns table (students bigint, reviews bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is distinct from '2c337bd5-b283-4ce8-9c0a-c817e4cdd697'::uuid then
    raise exception 'Acesso exclusivo do docente' using errcode = '42501';
  end if;
  return query
    select count(distinct r.user_id)::bigint, count(*)::bigint from public.mr_reviews r;
end $$;

revoke all on function public.master_card_stats() from public, anon;
revoke all on function public.master_class_overview() from public, anon;
grant execute on function public.master_card_stats() to authenticated;
grant execute on function public.master_class_overview() to authenticated;
