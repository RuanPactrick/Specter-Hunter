alter table public.provider_usage drop constraint provider_usage_provider_check;
alter table public.provider_usage add constraint provider_usage_provider_check
  check (provider in ('google_places','brave','official_page','openai','apify','gemini'));

create or replace function public.reserve_live_lookup(p_org uuid,p_provider text,p_operation text,p_ref uuid,p_place text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_member(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_provider='google_places' and p_operation='details' then
    if not exists(select 1 from public.research_results r where r.organization_id=p_org and r.job_id=p_ref and r.provider_id=p_place)
      then raise exception 'Resultado indisponível' using errcode='P2003'; end if;
  elsif (p_provider='brave' and p_operation='search') or (p_provider='official_page' and p_operation='inspect') or (p_provider in ('openai','gemini') and p_operation='assist') then
    if not exists(select 1 from public.leads l where l.organization_id=p_org and l.id=p_ref)
      then raise exception 'Lead indisponível' using errcode='P2003'; end if;
  else raise exception 'Consulta inválida' using errcode='22023';
  end if;
  perform app_private.reserve_usage(p_org,null,p_provider,p_operation);
end $$;
