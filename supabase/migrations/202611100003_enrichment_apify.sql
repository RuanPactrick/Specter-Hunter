-- Apify (Google Search Scraper) como motor de pesquisa da leitura automática, ao lado do Brave.
-- A reserva passa a aceitar o provedor e um lote de buscas (o Apify roda várias numa execução só).
alter table public.provider_usage drop constraint provider_usage_provider_check;
alter table public.provider_usage add constraint provider_usage_provider_check check (provider in ('google_places','brave','official_page','openai','apify'));

drop function public.reserve_enrichment_search(uuid,uuid,uuid);
create function public.reserve_enrichment_search(p_org uuid,p_lead uuid,p_lease uuid,p_provider text,p_count int default 1) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_provider not in ('brave','apify') or p_count not between 1 and 4 then raise exception 'Reserva inválida' using errcode='22023'; end if;
  perform 1 from public.enrichment_requests where organization_id=p_org and lead_id=p_lead and state='running' and lease_token=p_lease and lease_expires_at>now();
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,17));
  if (select count(*) from public.provider_usage where organization_id=p_org and operation='enrich' and created_at>=now()-interval '24 hours')+p_count>150
    then raise exception 'Limite de pesquisas da leitura atingido' using errcode='P2005'; end if;
  insert into public.provider_usage(organization_id,provider,operation) select p_org,p_provider,'enrich' from generate_series(1,p_count);
  update public.enrichment_requests set lease_expires_at=now()+interval '120 seconds' where organization_id=p_org and lead_id=p_lead;
  return true;
end $$;
revoke execute on function public.reserve_enrichment_search(uuid,uuid,uuid,text,int) from public,anon,authenticated;
grant execute on function public.reserve_enrichment_search(uuid,uuid,uuid,text,int) to service_role;
