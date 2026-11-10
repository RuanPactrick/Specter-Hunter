-- "Ler sites" em lote: só empresas que nunca foram lidas, até a quantidade pedida.
-- Reler uma empresa continua sendo pelo botão do próprio lead (request_enrichment).
create function public.request_enrichment_batch(p_org uuid,p_limit int,p_need_domain boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare affected int; room int;
begin
  if not app_private.is_member(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_limit not between 1 and 50 then raise exception 'Entre 1 e 50 empresas por vez' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,23));
  room := 200-(select count(*) from public.enrichment_requests where organization_id=p_org and requested_at>=now()-interval '24 hours');
  if room<=0 then raise exception 'Limite de leituras atingido' using errcode='P2005'; end if;
  insert into public.enrichment_requests(organization_id,lead_id)
    select l.organization_id,l.id from public.leads l
    where l.organization_id=p_org and l.stage<>'blocked' and (not p_need_domain or l.domain is not null)
      and not exists(select 1 from public.enrichment_requests r where r.organization_id=l.organization_id and r.lead_id=l.id)
    order by l.updated_at desc limit least(p_limit,room);
  get diagnostics affected = row_count;
  return affected;
end $$;
revoke execute on function public.request_enrichment_batch(uuid,int,boolean) from public,anon;
grant execute on function public.request_enrichment_batch(uuid,int,boolean) to authenticated;
