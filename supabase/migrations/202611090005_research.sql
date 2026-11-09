create type public.research_state as enum ('pending','running','partial','completed','failed','cancelled','awaiting_configuration','limit_reached');
create table public.research_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  created_by uuid default auth.uid() references auth.users on delete set null,
  request_id uuid not null,
  city text not null check (length(trim(city)) between 1 and 100),
  region text not null check (region ~ '^[A-Z]{2}$'),
  districts text not null default '' check (length(districts)<=250),
  segment text not null check (length(trim(segment)) between 1 and 150),
  desired int not null check (desired between 1 and 60),
  max_queries int not null check (max_queries between 1 and 10),
  skip_seen boolean not null default true,
  state public.research_state not null default 'pending',
  query_count int not null default 0,
  result_count int not null default 0,
  attempt int not null default 0,
  step text not null default 'queued',
  error_code text,
  cancel_requested boolean not null default false,
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  lease_token uuid,
  page_token text,
  scan_finished boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique(organization_id,id),
  unique(organization_id,request_id)
);
create unique index research_one_active on public.research_jobs(organization_id) where state in ('pending','running');
create index research_queue_idx on public.research_jobs(state,next_attempt_at,lease_expires_at);
create table public.research_job_steps (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  job_id uuid not null,
  step text not null,
  event text not null,
  created_at timestamptz not null default now(),
  foreign key(organization_id,job_id) references public.research_jobs(organization_id,id) on delete cascade
);
create table public.research_results (
  organization_id uuid not null,
  job_id uuid not null,
  provider text not null check (provider='google_places'),
  provider_id text not null check (length(provider_id) between 1 and 256 and provider_id ~ '^[A-Za-z0-9_-]+$'),
  created_at timestamptz not null default now(),
  primary key(organization_id,job_id,provider,provider_id),
  foreign key(organization_id,job_id) references public.research_jobs(organization_id,id) on delete cascade
);
create index research_id_idx on public.research_results(organization_id,provider,provider_id);
create table public.provider_usage (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations on delete cascade,
  job_id uuid,
  provider text not null check (provider in ('google_places','brave','official_page','openai')),
  operation text not null check (operation in ('discover','details','search','inspect','assist')),
  created_at timestamptz not null default now(),
  foreign key(organization_id,job_id) references public.research_jobs(organization_id,id) on delete cascade
);
create index provider_usage_org_time on public.provider_usage(organization_id,created_at desc);
do $$
declare relation text;
begin
  foreach relation in array array['research_jobs','research_job_steps','research_results','provider_usage'] loop
    execute format('alter table public.%I enable row level security',relation);
    execute format('revoke all on public.%I from anon,authenticated',relation);
    execute format('grant select on public.%I to authenticated',relation);
    execute format('create policy tenant_research_read on public.%I for select to authenticated using (app_private.is_member(organization_id))',relation);
  end loop;
end $$;
revoke select on public.research_jobs from authenticated;
grant select(id,organization_id,city,region,districts,segment,desired,max_queries,skip_seen,state,query_count,result_count,attempt,step,error_code,cancel_requested,created_at,started_at,finished_at)
on public.research_jobs to authenticated;

create function public.enqueue_research(p_org uuid,p_request uuid,p_city text,p_region text,p_districts text,p_segment text,p_desired int,p_max_queries int,p_skip_seen boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if not app_private.is_member(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,11));
  select id into result from public.research_jobs where organization_id=p_org and request_id=p_request;
  if found then return result; end if;
  if exists(select 1 from public.research_jobs where organization_id=p_org and state in ('pending','running'))
    then raise exception 'Pesquisa ativa' using errcode='P2004'; end if;
  if (select count(*) from public.research_jobs where organization_id=p_org and created_at>=now()-interval '24 hours')>=20
    then raise exception 'Limite de pesquisas atingido' using errcode='P2005'; end if;
  insert into public.research_jobs(organization_id,request_id,city,region,districts,segment,desired,max_queries,skip_seen)
    values(p_org,p_request,trim(p_city),p_region,trim(p_districts),trim(p_segment),p_desired,p_max_queries,p_skip_seen) returning id into result;
  insert into public.research_job_steps(organization_id,job_id,step,event) values(p_org,result,'queued','queued');
  return result;
end $$;

create function public.cancel_research(p_org uuid,p_job uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare affected uuid;
begin
  if not app_private.is_member(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  update public.research_jobs set cancel_requested=true,
    state=case when state='pending' then 'cancelled'::public.research_state else state end,
    finished_at=case when state='pending' then now() else finished_at end,
    page_token=case when state='pending' then null else page_token end
    where organization_id=p_org and id=p_job and state in ('pending','running') and not cancel_requested returning id into affected;
  if affected is not null then
    insert into public.research_job_steps(organization_id,job_id,step,event) values(p_org,p_job,'cancel','requested');
  end if;
  return affected is not null;
end $$;

create function public.claim_research() returns setof public.research_jobs
language plpgsql security definer set search_path = '' as $$
begin
  update public.research_jobs set state=case when cancel_requested then 'cancelled'::public.research_state when result_count>0 then 'partial'::public.research_state else 'failed'::public.research_state end,
    error_code=case when cancel_requested then null else 'lease_exhausted' end, finished_at=now(), lease_token=null,lease_expires_at=null,page_token=null
    where state='running' and lease_expires_at<=now() and (cancel_requested or attempt>=4);
  return query
    with next_job as (
      select j.id from public.research_jobs j
      where ((j.state='pending' and j.next_attempt_at<=now()) or (j.state='running' and j.lease_expires_at<=now()))
        and not j.cancel_requested and j.attempt<4
      order by j.created_at for update skip locked limit 1
    )
    update public.research_jobs j set state='running',step='discovery',started_at=coalesce(j.started_at,now()),attempt=j.attempt+1,
      lease_token=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds'
    from next_job n where j.id=n.id returning j.*;
end $$;

create function app_private.reserve_usage(p_org uuid,p_job uuid,p_provider text,p_operation text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,17));
  if (select count(*) from public.provider_usage where organization_id=p_org and created_at>=now()-interval '24 hours')>=40
     or (p_operation<>'discover' and (select count(*) from public.provider_usage where organization_id=p_org and operation<>'discover' and created_at>=now()-interval '1 minute')>=6)
    then raise exception 'Limite de consultas atingido' using errcode='P2005'; end if;
  insert into public.provider_usage(organization_id,job_id,provider,operation) values(p_org,p_job,p_provider,p_operation);
end $$;
revoke all on function app_private.reserve_usage(uuid,uuid,text,text) from public;

create function public.reserve_research_request(p_job uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare j public.research_jobs%rowtype;
begin
  select * into j from public.research_jobs where id=p_job and state='running' and lease_token=p_lease and lease_expires_at>now() for update;
  if not found or j.cancel_requested then return false; end if;
  if j.query_count>=j.max_queries then raise exception 'Limite de consultas atingido' using errcode='P2005'; end if;
  perform app_private.reserve_usage(j.organization_id,j.id,'google_places','discover');
  update public.research_jobs set query_count=query_count+1,lease_expires_at=now()+interval '90 seconds' where id=p_job;
  insert into public.research_job_steps(organization_id,job_id,step,event) values(j.organization_id,j.id,'discovery','request_reserved');
  return true;
end $$;

create function public.store_research_page(p_job uuid,p_lease uuid,p_ids text[],p_next text)
returns table(result_count int, cancelled boolean)
language plpgsql security definer set search_path = '' as $$
declare j public.research_jobs%rowtype; total int;
begin
  select * into j from public.research_jobs where id=p_job and state='running' and lease_token=p_lease and lease_expires_at>now() for update;
  if not found then return; end if;
  if j.cancel_requested then return query select j.result_count,true; return; end if;
  insert into public.research_results(organization_id,job_id,provider,provider_id)
    select j.organization_id,j.id,'google_places',v.identifier
    from unnest(p_ids) with ordinality as v(identifier,position)
    where length(identifier) between 1 and 256 and identifier ~ '^[A-Za-z0-9_-]+$'
      and v.position=(select min(k.pos) from unnest(p_ids) with ordinality k(id,pos) where k.id=v.identifier)
      and not exists(select 1 from public.research_results r where r.organization_id=j.organization_id and r.provider='google_places'
        and r.provider_id=v.identifier and (r.job_id=j.id or j.skip_seen))
    order by v.position limit greatest(0,j.desired-j.result_count) on conflict do nothing;
  select count(*) into total from public.research_results where organization_id=j.organization_id and job_id=j.id;
  update public.research_jobs set result_count=total,page_token=left(p_next,2048),scan_finished=(p_next is null or total>=j.desired),step='deduplication',lease_expires_at=now()+interval '90 seconds' where id=p_job;
  insert into public.research_job_steps(organization_id,job_id,step,event) values(j.organization_id,j.id,'deduplication','identifiers_saved');
  return query select total,false;
end $$;

create function public.finish_research(p_job uuid,p_lease uuid,p_state public.research_state,p_error text,p_delay int default 0) returns boolean
language plpgsql security definer set search_path = '' as $$
declare j public.research_jobs%rowtype; outcome public.research_state; retry boolean;
begin
  select * into j from public.research_jobs where id=p_job and state='running' and lease_token=p_lease and lease_expires_at>now() for update;
  if not found then return false; end if;
  outcome:=case when j.cancel_requested then 'cancelled' else p_state end;
  retry:=outcome='pending' and j.attempt<4 and j.query_count<j.max_queries;
  if outcome='pending' and not retry then outcome:=case when j.result_count>0 then 'partial' else 'failed' end; end if;
  if outcome='failed' and j.result_count>0 then outcome:='partial'; end if;
  if outcome not in ('pending','partial','completed','failed','cancelled','awaiting_configuration','limit_reached') then
    raise exception 'Estado final inválido' using errcode='22023';
  end if;
  update public.research_jobs set state=outcome, step=case when retry then 'retry' else 'finished' end,
    error_code=case when outcome='cancelled' then null else left(p_error,50) end,
    next_attempt_at=case when retry then now()+make_interval(secs=>greatest(1,least(p_delay,3600))) else now() end,
    finished_at=case when retry then null else now() end,
    page_token=case when retry then page_token else null end,lease_token=null,lease_expires_at=null where id=p_job;
  insert into public.research_job_steps(organization_id,job_id,step,event) values(j.organization_id,j.id,case when retry then 'retry' else 'finished' end,outcome::text);
  return true;
end $$;

create function public.reserve_live_lookup(p_org uuid,p_provider text,p_operation text,p_ref uuid,p_place text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_member(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_provider='google_places' and p_operation='details' then
    if not exists(select 1 from public.research_results r where r.organization_id=p_org and r.job_id=p_ref and r.provider_id=p_place)
      then raise exception 'Resultado indisponível' using errcode='P2003'; end if;
  elsif (p_provider='brave' and p_operation='search') or (p_provider='official_page' and p_operation='inspect') or (p_provider='openai' and p_operation='assist') then
    if not exists(select 1 from public.leads l where l.organization_id=p_org and l.id=p_ref)
      then raise exception 'Lead indisponível' using errcode='P2003'; end if;
  else raise exception 'Consulta inválida' using errcode='22023';
  end if;
  perform app_private.reserve_usage(p_org,null,p_provider,p_operation);
end $$;
revoke execute on function public.enqueue_research(uuid,uuid,text,text,text,text,int,int,boolean),public.cancel_research(uuid,uuid),public.reserve_live_lookup(uuid,text,text,uuid,text) from public,anon;
grant execute on function public.enqueue_research(uuid,uuid,text,text,text,text,int,int,boolean),public.cancel_research(uuid,uuid),public.reserve_live_lookup(uuid,text,text,uuid,text) to authenticated;
revoke execute on function public.claim_research(),public.reserve_research_request(uuid,uuid),public.store_research_page(uuid,uuid,text[],text),public.finish_research(uuid,uuid,public.research_state,text,int) from public,anon,authenticated;
grant execute on function public.claim_research(),public.reserve_research_request(uuid,uuid),public.store_research_page(uuid,uuid,text[],text),public.finish_research(uuid,uuid,public.research_state,text,int) to service_role;
