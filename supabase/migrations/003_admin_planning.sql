-- Additive migration. No existing MedReview tables or records are changed.
begin;
create table if not exists public.mr_planning_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  kind text not null check (kind in ('event','session','task','review','material','settings')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists mr_planning_session_identity on public.mr_planning_records(owner_id,(data->>'subject'),(data->>'topic'),(data->>'studied_at')) where kind='session';
create unique index if not exists mr_planning_settings_owner on public.mr_planning_records(owner_id) where kind='settings';
create unique index if not exists mr_planning_review_series on public.mr_planning_records(owner_id,(data->>'session_id'),(data->>'interval_days')) where kind='review';
create unique index if not exists mr_planning_event_identity on public.mr_planning_records(owner_id,(data->>'title'),(data->>'event_type'),(data->>'starts_at'),(data->>'ends_at')) where kind='event';
create table if not exists public.mr_planning_operations (
  owner_id uuid not null references auth.users(id),
  key text not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(owner_id,key)
);
create table if not exists public.mr_planning_history (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id),
  record_id uuid not null references public.mr_planning_records(id),
  operation_key text not null,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
-- An immutable auth identity, not editable profile metadata or a browser role flag.
create or replace function public.mr_planning_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
 select auth.uid() = '2c337bd5-b283-4ce8-9c0a-c817e4cdd697'::uuid
$$;
alter table public.mr_planning_records enable row level security;
alter table public.mr_planning_operations enable row level security;
alter table public.mr_planning_history enable row level security;
-- All writes go through the transaction below, including the website and MCP.
revoke all on public.mr_planning_records, public.mr_planning_operations, public.mr_planning_history from anon, authenticated;
grant select on public.mr_planning_records, public.mr_planning_history to authenticated;
drop policy if exists planning_admin_read on public.mr_planning_records;
create policy planning_admin_read on public.mr_planning_records for select to authenticated using (public.mr_planning_admin() and owner_id=auth.uid());
drop policy if exists planning_history_read on public.mr_planning_history;
create policy planning_history_read on public.mr_planning_history for select to authenticated using (public.mr_planning_admin() and owner_id=auth.uid());

create or replace function public.mr_planning_validate(k text,p jsonb) returns void
language plpgsql set search_path = '' as $$
declare allowed text[]; field text; n integer; slot jsonb; a jsonb; b jsonb;
begin
 if jsonb_typeof(p) <> 'object' then raise exception 'Dados devem ser um objeto'; end if;
 allowed := case k
 when 'session' then array['subject','topic','studied_at','duration_minutes','questions','correct','activities','notes']
 when 'event' then array['title','event_type','starts_at','ends_at','attendance','subject','topic','notes']
 when 'task' then array['subject','topic','estimated_minutes','priority','deadline','scheduled_at','status','completed_at','notes']
 when 'review' then array['subject','topic','due_on','session_id','interval_days','status','completed_at','notes']
 when 'material' then array['title','system','subject','topic','url','notes']
 when 'settings' then array['review_days','availability'] else null end;
 if allowed is null then raise exception 'Tipo inválido'; end if;
 for field in select jsonb_object_keys(p) loop
  if not field=any(allowed) or p->field='null'::jsonb then raise exception 'Campo inválido ou nulo: %',field; end if;
 end loop;
 for field in select unnest(case when k in ('session','task','review') then array['subject','topic'] when k in ('event','material') then array['title'] else array[]::text[] end) loop
  if jsonb_typeof(p->field) is distinct from 'string' or length(trim(p->>field)) not between 1 and 300 then raise exception 'Campo obrigatório: %',field; end if;
 end loop;
 if octet_length(p::text)>50000 then raise exception 'Registro muito grande'; end if;
 for field in select unnest(array['subject','topic','title','system','notes','url','event_type','attendance','status','session_id']) loop
  if p ? field and (jsonb_typeof(p->field)<>'string' or length(p->>field)>5000) then raise exception 'Texto inválido: %',field; end if;
 end loop;
 for field in select unnest(array['duration_minutes','questions','correct','estimated_minutes','priority','interval_days']) loop
  if p ? field then
   if jsonb_typeof(p->field)<>'number' or (p->>field)!~'^\d+$' then raise exception 'Inteiro inválido: %',field; end if;
   n:=(p->>field)::integer;
   if n<0 or n>100000 or (field in ('duration_minutes','estimated_minutes','interval_days') and n=0) then raise exception 'Valor inválido: %',field; end if;
  end if;
 end loop;
 if p ? 'priority' and (p->>'priority')::integer not between 1 and 5 then raise exception 'Prioridade deve ser de 1 a 5'; end if;
 if p ? 'correct' and (not p ? 'questions' or (p->>'correct')::integer>(p->>'questions')::integer) then raise exception 'Acertos exigem questões e não podem excedê-las'; end if;
 for field in select unnest(array['studied_at','starts_at','ends_at','scheduled_at','completed_at']) loop
  if p ? field and ((p->>field)!~'^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' or not isfinite((p->>field)::timestamptz)) then raise exception 'Data exige horário e fuso: %',field; end if;
 end loop;
 if k='session' and not p ? 'studied_at' then raise exception 'Informe a data do estudo'; end if;
 if k='event' then
  if not p ? 'starts_at' or not p ? 'ends_at' or (p->>'ends_at')::timestamptz <= (p->>'starts_at')::timestamptz then raise exception 'Horário do evento inválido'; end if;
  if coalesce(p->>'event_type','') not in ('class','exam','tutorial','study') then raise exception 'Tipo de compromisso inválido'; end if;
 end if;
 if p ? 'attendance' and (k<>'event' or p->>'event_type' not in ('class','tutorial') or p->>'attendance' not in ('planned','attended','missed')) then raise exception 'Presença inválida'; end if;
 if p ? 'status' and p->>'status' not in ('planned','done') then raise exception 'Status inválido'; end if;
 for field in select unnest(array['due_on','deadline']) loop
  if p ? field and ((p->>field)!~'^\d{4}-\d{2}-\d{2}$' or (p->>field)::date < date '2026-10-12') then raise exception 'Pendências começam em 12/10/2026'; end if;
 end loop;
 if k='task' and not p ? 'estimated_minutes' then raise exception 'Informe a duração estimada'; end if;
 if k='task' and p ? 'scheduled_at' and ((p->>'scheduled_at')::timestamptz at time zone 'America/Cuiaba')::date<date '2026-10-12' then raise exception 'Blocos de tarefas começam em 12/10/2026; use materiais para referências antigas'; end if;
 if k='review' and (not p ? 'due_on' or not p ? 'session_id' or not p ? 'interval_days') then raise exception 'Revisão incompleta'; end if;
 if k='material' and p ? 'url' and ((p->>'url')!~'^https?://' or (p->>'url')~'^https?://[^/]*@' or length(p->>'url')>2048) then raise exception 'Link inválido'; end if;
 if p ? 'activities' then
  if jsonb_typeof(p->'activities')<>'array' or jsonb_array_length(p->'activities')>100 then raise exception 'Atividades inválidas'; end if;
  for slot in select value from jsonb_array_elements(p->'activities') loop
   if jsonb_typeof(slot)<>'string' or length(slot#>>'{}') not between 1 and 300 then raise exception 'Atividade inválida'; end if;
  end loop;
 end if;
 if k='settings' then
  if jsonb_typeof(p->'review_days') is distinct from 'array' or jsonb_typeof(p->'availability') is distinct from 'array' or jsonb_array_length(p->'review_days')>30 or jsonb_array_length(p->'availability')>50 then raise exception 'Informe intervalos e disponibilidade'; end if;
  for slot in select value from jsonb_array_elements(p->'review_days') loop
   if slot::text!~'^\d+$' or slot::text::integer not between 1 and 3650 then raise exception 'Intervalo inválido'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p->'review_days')) <> (select count(distinct value) from jsonb_array_elements(p->'review_days')) then raise exception 'Intervalos duplicados'; end if;
  for slot in select value from jsonb_array_elements(p->'availability') loop
   if exists(select 1 from jsonb_object_keys(slot) f where f not in ('weekday','start','end')) then raise exception 'Campo de disponibilidade inválido'; end if;
   if jsonb_typeof(slot)<>'object' or jsonb_typeof(slot->'weekday') is distinct from 'number' or jsonb_typeof(slot->'start') is distinct from 'string' or jsonb_typeof(slot->'end') is distinct from 'string' or coalesce(slot->>'weekday','')!~'^[0-6]$' or coalesce(slot->>'start','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(slot->>'end','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or slot->>'end'<=slot->>'start' then raise exception 'Janela de disponibilidade inválida'; end if;
  end loop;
  for a in select value from jsonb_array_elements(p->'availability') loop
   for b in select value from jsonb_array_elements(p->'availability') loop
    if a<>b and a->>'weekday'=b->>'weekday' and a->>'start'<b->>'end' and b->>'start'<a->>'end' then raise exception 'Disponibilidades sobrepostas'; end if;
   end loop;
  end loop;
  if (select count(*) from jsonb_array_elements(p->'availability'))<>(select count(distinct value) from jsonb_array_elements(p->'availability')) then raise exception 'Disponibilidade duplicada'; end if;
 end if;
end $$;
revoke all on function public.mr_planning_validate(text,jsonb) from public,anon,authenticated;

create or replace function public.mr_planning_command(command jsonb, idempotency_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); old public.mr_planning_records; rec public.mr_planning_records; previous public.mr_planning_operations;
 p jsonb; result jsonb; interval_value integer; settings jsonb; item jsonb; items jsonb:='[]'; action text:=command->>'action'; k text; target uuid; reviews jsonb:='[]'; due date; field text; allowed text[]; starts timestamptz; ends timestamptz; local_start timestamp; local_end timestamp; fits boolean; created boolean:=false;
begin
 if not public.mr_planning_admin() or uid is null then raise exception 'Acesso exclusivo do administrador' using errcode='42501'; end if;
 if idempotency_key is null or length(idempotency_key) not between 8 and 200 then raise exception 'Chave de idempotência inválida'; end if;
 if jsonb_typeof(command)<>'object' or octet_length(command::text)>500000 then raise exception 'Operação inválida'; end if;
 allowed:=case action when 'create' then array['action','kind','data','id'] when 'update' then array['action','id','expected_revision','patch','confirmed'] when 'complete' then array['action','id','expected_revision'] when 'import' then array['action','records','confirmed'] else array[]::text[] end;
 for field in select jsonb_object_keys(command) loop
  if not field=any(allowed) then raise exception 'Campo de operação inválido: %',field; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('planning:'||uid::text,0));
 perform pg_advisory_xact_lock(hashtextextended(uid::text||idempotency_key,0));
 select * into previous from public.mr_planning_operations where owner_id=uid and key=idempotency_key;
 if found then
  if previous.request<>command then raise exception 'Chave já utilizada para outros dados'; end if;
  return previous.result;
 end if;
 if action='import' then
  if command->>'confirmed' is distinct from 'true' or jsonb_typeof(command->'records') is distinct from 'array' or jsonb_array_length(command->'records')>200 then raise exception 'Prévia e confirmação da importação são obrigatórias (máximo 200)'; end if;
  for item in select value from jsonb_array_elements(command->'records') loop
   result:=public.mr_planning_command(item,idempotency_key||':'||(jsonb_array_length(items))::text);
   items:=items||jsonb_build_array(result);
  end loop;
  result:=jsonb_build_object('records',items);
 elsif action in ('create','update','complete') then
  if action='create' then
   k:=command->>'kind'; p:=command->'data';
   if k='review' then raise exception 'Revisões são geradas pelo registro de estudo'; end if;
   if k='settings' then
    select * into old from public.mr_planning_records where owner_id=uid and kind='settings' for update;
    if found then raise exception 'Use o identificador existente para corrigir as configurações'; end if;
   end if;
  else
   target:=(command->>'id')::uuid;
   select * into old from public.mr_planning_records where id=target and owner_id=uid for update;
   if not found then raise exception 'Registro não encontrado'; end if;
   if (command->>'expected_revision')::integer is distinct from old.revision then raise exception 'Registro alterado em outro dispositivo; recarregue antes de corrigir'; end if;
   k:=old.kind;
   if action='complete' then
    if k not in ('task','review') then raise exception 'Presença em aula não conclui estudo'; end if;
    p:=old.data||jsonb_build_object('status','done','completed_at',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
   else
    p:=old.data||(command->'patch');
    if jsonb_typeof(command->'patch') is distinct from 'object' then raise exception 'Correção inválida'; end if;
    if k='review' and (p->>'session_id' is distinct from old.data->>'session_id' or p->>'interval_days' is distinct from old.data->>'interval_days') then raise exception 'Vínculo e intervalo da revisão são imutáveis'; end if;
    if k='event' and (p->>'starts_at' is distinct from old.data->>'starts_at' or p->>'ends_at' is distinct from old.data->>'ends_at' or p->>'event_type' is distinct from old.data->>'event_type') and command->>'confirmed' is distinct from 'true' then raise exception 'Confirme explicitamente a mudança do cronograma'; end if;
    if k='review' and p->>'due_on' is distinct from old.data->>'due_on' and command->>'confirmed' is distinct from 'true' then raise exception 'Confirme explicitamente o reagendamento'; end if;
   end if;
  end if;
  if action='update' and k='settings' and p->'review_days' is distinct from old.data->'review_days' and command->>'confirmed' is distinct from 'true' then raise exception 'Confirme explicitamente os novos intervalos'; end if;
  if action='update' and k='session' and p->>'studied_at' is distinct from old.data->>'studied_at' and command->>'confirmed' is distinct from 'true' then raise exception 'Confirme a correção da data de estudo; as revisões existentes permanecem inalteradas'; end if;
  if action='update' and k='task' and p->>'scheduled_at' is distinct from old.data->>'scheduled_at' and command->>'confirmed' is distinct from 'true' then raise exception 'Confirme explicitamente a mudança do horário da tarefa'; end if;
  perform public.mr_planning_validate(k,p);
  for field in select unnest(array['studied_at','starts_at','ends_at','scheduled_at','completed_at']) loop
   if p ? field then p:=jsonb_set(p,array[field],to_jsonb(to_char((p->>field)::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))); end if;
  end loop;
  for field in select unnest(array['subject','topic','title']) loop
   if p ? field then p:=jsonb_set(p,array[field],to_jsonb(trim(p->>field))); end if;
  end loop;
  if k='task' and p ? 'scheduled_at' and action<>'complete' and (action='create' or p->>'scheduled_at' is distinct from old.data->>'scheduled_at') then
   starts:=(p->>'scheduled_at')::timestamptz; ends:=starts+make_interval(mins=>(p->>'estimated_minutes')::integer);
   local_start:=starts at time zone 'America/Cuiaba';local_end:=ends at time zone 'America/Cuiaba';
   select data into settings from public.mr_planning_records where owner_id=uid and kind='settings';
   select exists(select 1 from jsonb_array_elements(coalesce(settings->'availability','[]')) s where (s->>'weekday')::integer=extract(dow from local_start)::integer and local_start::date=local_end::date and local_start::time>=(s->>'start')::time and local_end::time<=(s->>'end')::time) into fits;
   if not fits then raise exception 'Horário fora da disponibilidade configurada'; end if;
   if exists(select 1 from public.mr_planning_records r where r.owner_id=uid and (old.id is null or r.id<>old.id) and ((r.kind='event' and (r.data->>'starts_at')::timestamptz<ends and (r.data->>'ends_at')::timestamptz>starts) or (r.kind='task' and r.data ? 'scheduled_at' and coalesce(r.data->>'status','planned')<>'done' and (r.data->>'scheduled_at')::timestamptz<ends and (r.data->>'scheduled_at')::timestamptz+make_interval(mins=>(r.data->>'estimated_minutes')::integer)>starts))) then raise exception 'Horário conflita com um compromisso ou tarefa'; end if;
  end if;
  if action='create' then
   insert into public.mr_planning_records(id,owner_id,kind,data) values(coalesce((command->>'id')::uuid,gen_random_uuid()),uid,k,p) on conflict do nothing returning * into rec;
   if rec.id is null then
    if k='event' then select * into rec from public.mr_planning_records where owner_id=uid and kind=k and data->>'title'=p->>'title' and data->>'event_type'=p->>'event_type' and data->>'starts_at'=p->>'starts_at' and data->>'ends_at'=p->>'ends_at'; end if;
    if k='session' then
     select * into rec from public.mr_planning_records where owner_id=uid and kind=k and data->>'subject'=p->>'subject' and data->>'topic'=p->>'topic' and data->>'studied_at'=p->>'studied_at';
     if rec.id is not null and not (rec.data @> p) then raise exception 'Sessão já existe; corrija o registro pelo identificador'; end if;
    end if;
    if rec.id is null and command ? 'id' then select * into rec from public.mr_planning_records where id=(command->>'id')::uuid and owner_id=uid and kind=k; end if;
    if rec.id is null then raise exception 'Registro duplicado'; end if;
    if (k in ('event','session') and not (rec.data @> p)) or (k not in ('event','session') and rec.data<>p) then raise exception 'Registro já existe; use o identificador para corrigir'; end if;
   else
    created:=true;
    insert into public.mr_planning_history(owner_id,record_id,operation_key,after_data) values(uid,rec.id,idempotency_key,to_jsonb(rec));
   end if;
  else
   update public.mr_planning_records set data=p, revision=revision+1, updated_at=now() where id=old.id returning * into rec;
   insert into public.mr_planning_history(owner_id,record_id,operation_key,before_data,after_data) values(uid,rec.id,idempotency_key,to_jsonb(old),to_jsonb(rec));
  end if;
  if k='session' and action='create' and created then
   select data into settings from public.mr_planning_records where owner_id=uid and kind='settings';
   -- Historical sessions stay consultable but never generate retroactive backlog.
   if (p->>'studied_at')::timestamptz at time zone 'America/Cuiaba' >= timestamp '2026-10-12' then
    for interval_value in select value::text::integer from jsonb_array_elements(coalesce(settings->'review_days','[]')) loop
     due:=((p->>'studied_at')::timestamptz at time zone 'America/Cuiaba')::date+interval_value;
     insert into public.mr_planning_records(owner_id,kind,data) values(uid,'review',jsonb_build_object('subject',p->>'subject','topic',p->>'topic','session_id',rec.id,'interval_days',interval_value,'due_on',due,'status','planned')) on conflict do nothing returning to_jsonb(mr_planning_records.*) into item;
     if item is not null then
      reviews:=reviews||jsonb_build_array(item);
      insert into public.mr_planning_history(owner_id,record_id,operation_key,after_data) values(uid,(item->>'id')::uuid,idempotency_key,item);
     end if;
    end loop;
   end if;
  end if;
  result:=jsonb_build_object('record',to_jsonb(rec),'reviews',reviews);
 else raise exception 'Operação desconhecida (exclusão não disponível)'; end if;
 insert into public.mr_planning_operations(owner_id,key,request,result) values(uid,idempotency_key,command,result);
 return result;
end $$;
revoke all on function public.mr_planning_command(jsonb,text) from public,anon;
grant execute on function public.mr_planning_command(jsonb,text) to authenticated;
revoke all on function public.mr_planning_admin() from public,anon;
grant execute on function public.mr_planning_admin() to authenticated;
commit;
