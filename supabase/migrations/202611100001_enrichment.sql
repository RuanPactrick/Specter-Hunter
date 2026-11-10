-- Leitura automática do site do lead (portada do prospeccao-kit-aluno).
-- O worker lê o domínio já informado no lead e grava evidências pendentes e contatos não confirmados.
alter table public.evidence_items drop constraint evidence_items_provider_check;
alter table public.evidence_items add constraint evidence_items_provider_check check (provider in ('manual','csv','site_reader'));

create table public.enrichment_requests (
  organization_id uuid not null,
  lead_id uuid not null,
  state text not null default 'pending' check (state in ('pending','running','done','failed')),
  attempt int not null default 0,
  error_code text,
  suggestion jsonb,
  lease_token uuid,
  lease_expires_at timestamptz,
  requested_by uuid default auth.uid() references auth.users on delete set null,
  requested_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (organization_id,lead_id),
  foreign key (organization_id,lead_id) references public.leads(organization_id,id) on delete cascade
);
create index enrichment_queue_idx on public.enrichment_requests(state,requested_at);
alter table public.enrichment_requests enable row level security;
revoke all on public.enrichment_requests from anon,authenticated;
grant select(organization_id,lead_id,state,attempt,error_code,suggestion,requested_at,finished_at) on public.enrichment_requests to authenticated;
create policy tenant_enrichment_read on public.enrichment_requests for select to authenticated using (app_private.is_member(organization_id));

create function public.request_enrichment(p_org uuid,p_leads uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare affected int;
begin
  if not app_private.is_member(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if coalesce(array_length(p_leads,1),0) > 50 then raise exception 'Até 50 leads por vez' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,23));
  if (select count(*) from public.enrichment_requests where organization_id=p_org and requested_at>=now()-interval '24 hours')>=200
    then raise exception 'Limite de leituras atingido' using errcode='P2005'; end if;
  insert into public.enrichment_requests(organization_id,lead_id)
    select l.organization_id,l.id from public.leads l
    where l.organization_id=p_org and l.id=any(p_leads) and l.domain is not null and l.stage<>'blocked'
  on conflict (organization_id,lead_id) do update set state='pending',attempt=0,error_code=null,suggestion=null,
    lease_token=null,lease_expires_at=null,requested_by=auth.uid(),requested_at=now(),finished_at=null
    where public.enrichment_requests.state in ('done','failed');
  get diagnostics affected = row_count;
  return affected;
end $$;

create function public.claim_enrichment() returns table(organization_id uuid,lead_id uuid,lease_token uuid,domain text)
language plpgsql security definer set search_path = '' as $$
begin
  update public.enrichment_requests r set state='failed',error_code='lease_exhausted',finished_at=now(),lease_token=null,lease_expires_at=null
    where r.state='running' and r.lease_expires_at<=now() and r.attempt>=3;
  return query
    with next_request as (
      select r.organization_id,r.lead_id from public.enrichment_requests r
      where (r.state='pending' or (r.state='running' and r.lease_expires_at<=now())) and r.attempt<3
      order by r.requested_at for update skip locked limit 1
    )
    update public.enrichment_requests r set state='running',attempt=r.attempt+1,lease_token=gen_random_uuid(),lease_expires_at=now()+interval '120 seconds'
    from next_request n, public.leads l
    where r.organization_id=n.organization_id and r.lead_id=n.lead_id and l.organization_id=r.organization_id and l.id=r.lead_id
    returning r.organization_id,r.lead_id,r.lease_token,l.domain;
end $$;

-- p_result: {evidence:[{kind,observed,url,excerpt}], contacts:[{kind,value,normalized}], suggestion:{...}}
create function public.finish_enrichment(p_org uuid,p_lead uuid,p_lease uuid,p_result jsonb,p_error text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare blocked boolean;
begin
  perform 1 from public.enrichment_requests where organization_id=p_org and lead_id=p_lead and state='running' and lease_token=p_lease and lease_expires_at>now() for update;
  if not found then return false; end if;
  select stage='blocked' into blocked from public.leads where organization_id=p_org and id=p_lead for update;
  if p_error is not null or blocked then
    update public.enrichment_requests set state='failed',error_code=left(coalesce(p_error,'blocked'),50),finished_at=now(),lease_token=null,lease_expires_at=null
      where organization_id=p_org and lead_id=p_lead;
    return true;
  end if;
  insert into public.evidence_items(organization_id,lead_id,kind,observed,url,provider,source_label,consulted_on,method,excerpt,export_allowed)
    select p_org,p_lead,left(e->>'kind',80),left(e->>'observed',2000),case when e->>'url' ~ '^https?://' then left(e->>'url',2048) end,
      'site_reader','Leitura automática do site',current_date,'Leitura automática do HTML público do domínio informado',left(e->>'excerpt',500),false
    from jsonb_array_elements(coalesce(p_result->'evidence','[]')) with ordinality as x(e,n)
    where n<=10 and length(trim(coalesce(e->>'kind','')))>0 and length(trim(coalesce(e->>'observed','')))>0;
  insert into public.lead_contacts(organization_id,lead_id,kind,value,normalized,source_label,consulted_on,confirmed)
    select p_org,p_lead,(c->>'kind')::public.contact_kind,left(c->>'value',2048),left(c->>'normalized',2048),'Leitura automática do site',current_date,false
    from jsonb_array_elements(coalesce(p_result->'contacts','[]')) with ordinality as x(c,n)
    where n<=20 and c->>'kind' in ('phone','whatsapp','email','instagram')
      and length(trim(coalesce(c->>'value','')))>0 and length(coalesce(c->>'normalized',''))>0
      and (c->>'kind' not in ('phone','whatsapp') or c->>'normalized' ~ '^\+[1-9][0-9]{7,14}$')
  on conflict (organization_id,lead_id,kind,normalized) do nothing;
  update public.enrichment_requests set state='done',error_code=null,suggestion=p_result->'suggestion',finished_at=now(),lease_token=null,lease_expires_at=null
    where organization_id=p_org and lead_id=p_lead;
  insert into public.audit_events(organization_id,lead_id,event,detail) values(p_org,p_lead,'lead.enriched',jsonb_build_object('source','site_reader'));
  return true;
end $$;

revoke execute on function public.request_enrichment(uuid,uuid[]) from public,anon;
grant execute on function public.request_enrichment(uuid,uuid[]) to authenticated;
revoke execute on function public.claim_enrichment(),public.finish_enrichment(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_enrichment(),public.finish_enrichment(uuid,uuid,uuid,jsonb,text) to service_role;
