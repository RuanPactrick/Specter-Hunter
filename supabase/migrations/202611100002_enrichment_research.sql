-- Fase 2 da leitura automática: pesquisa na web (Brave) do site, Instagram e CNPJ que o lead não tem.
-- As buscas da leitura têm cota própria (operation 'enrich') e não consomem a cota de descoberta e consultas pontuais.
alter table public.provider_usage drop constraint provider_usage_operation_check;
alter table public.provider_usage add constraint provider_usage_operation_check check (operation in ('discover','details','search','inspect','assist','enrich'));

create or replace function app_private.reserve_usage(p_org uuid,p_job uuid,p_provider text,p_operation text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,17));
  if (select count(*) from public.provider_usage where organization_id=p_org and operation<>'enrich' and created_at>=now()-interval '24 hours')>=40
     or (p_operation<>'discover' and (select count(*) from public.provider_usage where organization_id=p_org and operation not in ('discover','enrich') and created_at>=now()-interval '1 minute')>=6)
    then raise exception 'Limite de consultas atingido' using errcode='P2005'; end if;
  insert into public.provider_usage(organization_id,job_id,provider,operation) values(p_org,p_job,p_provider,p_operation);
end $$;

-- Lead sem domínio também entra: a pesquisa procura o site dele.
create or replace function public.request_enrichment(p_org uuid,p_leads uuid[]) returns int
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
    where l.organization_id=p_org and l.id=any(p_leads) and l.stage<>'blocked'
  on conflict (organization_id,lead_id) do update set state='pending',attempt=0,error_code=null,suggestion=null,
    lease_token=null,lease_expires_at=null,requested_by=auth.uid(),requested_at=now(),finished_at=null
    where public.enrichment_requests.state in ('done','failed');
  get diagnostics affected = row_count;
  return affected;
end $$;

drop function public.claim_enrichment();
create function public.claim_enrichment() returns table(organization_id uuid,lead_id uuid,lease_token uuid,domain text,name text,city text,region text,phones text[])
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
    returning r.organization_id,r.lead_id,r.lease_token,l.domain,l.name,l.city,l.region,
      array(select c.normalized from public.lead_contacts c where c.organization_id=l.organization_id and c.lead_id=l.id and c.kind in ('phone','whatsapp'));
end $$;

create function public.reserve_enrichment_search(p_org uuid,p_lead uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.enrichment_requests where organization_id=p_org and lead_id=p_lead and state='running' and lease_token=p_lease and lease_expires_at>now();
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,17));
  if (select count(*) from public.provider_usage where organization_id=p_org and operation='enrich' and created_at>=now()-interval '24 hours')>=150
    then raise exception 'Limite de pesquisas da leitura atingido' using errcode='P2005'; end if;
  insert into public.provider_usage(organization_id,provider,operation) values(p_org,'brave','enrich');
  update public.enrichment_requests set lease_expires_at=now()+interval '120 seconds' where organization_id=p_org and lead_id=p_lead;
  return true;
end $$;

revoke execute on function public.claim_enrichment(),public.reserve_enrichment_search(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_enrichment(),public.reserve_enrichment_search(uuid,uuid,uuid) to service_role;
