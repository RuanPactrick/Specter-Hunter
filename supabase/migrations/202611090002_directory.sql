create view public.lead_directory with (security_invoker = true) as
select l.*,
  case when last_site.evidence_id is null then l.website_status
       when site_evidence.id is null then 'insufficient'::public.website_status
       when site_evidence.review='conflict' then 'conflict'::public.website_status
       when l.website_status='owned' and site_evidence.review not in ('confirmed','corrected') then 'insufficient'::public.website_status
       else l.website_status end as effective_website_status,
  coalesce(a.observed,0)::int as observed,
  coalesce(a.coverage,0)::int as coverage,
  case when e.confirmed > 0 and e.open = 0 then 'suficiente'
       when e.total > 0 then 'pendente' else 'insuficiente' end as confidence,
  (e.open > 0 or l.website_status in ('insufficient','possible','conflict')) as has_pending
from public.leads l
left join lateral (
  select s.evidence_id from public.website_assessments s
  where s.organization_id=l.organization_id and s.lead_id=l.id
  order by s.created_at desc,s.id desc limit 1
) last_site on true
left join public.evidence_items site_evidence on (site_evidence.organization_id,site_evidence.lead_id,site_evidence.id)=(l.organization_id,l.id,last_site.evidence_id)
left join lateral (
  select sum(o.points) as observed, sum(case o.criterion when 'gap' then 30 when 'fit' then 25 else 15 end) as coverage
  from public.opportunity_assessments o
  join public.evidence_items i on (i.organization_id,i.lead_id,i.id)=(o.organization_id,o.lead_id,o.evidence_id)
  where o.organization_id=l.organization_id and o.lead_id=l.id and i.review in ('confirmed','corrected')
    and (i.expires_at is null or i.expires_at > now())
) a on true
cross join lateral (
  select count(*) as total, count(*) filter(where i.review in ('confirmed','corrected')) as confirmed,
  count(*) filter(where i.review in ('pending','conflict','inconclusive')) as open
  from public.evidence_items i where i.organization_id=l.organization_id and i.lead_id=l.id
  and (i.expires_at is null or i.expires_at > now())
) e;
revoke all on public.lead_directory from anon,authenticated;
grant select on public.lead_directory to authenticated;

create function public.merge_leads(p_org uuid,p_from uuid,p_into uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare locked int; source public.leads%rowtype; target public.leads%rowtype;
begin
  if not app_private.is_owner(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_from=p_into or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Revisão obrigatória' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,0));
  perform 1 from public.leads where organization_id=p_org and id in (p_from,p_into) order by id for update;
  get diagnostics locked = row_count;
  if locked<>2 then raise exception 'Leads indisponíveis' using errcode='P2003'; end if;
  select * into source from public.leads where organization_id=p_org and id=p_from;
  select * into target from public.leads where organization_id=p_org and id=p_into;
  if source.stage='blocked' or target.stage='blocked' then
    raise exception 'Revise a lista de não contato antes de mesclar' using errcode='P2001';
  end if;
  -- Keep lead IDs stable in related files and assessments. Link the duplicate to the primary instead of deleting data.
  insert into public.audit_events(organization_id,lead_id,event,detail)
    values(p_org,p_into,'lead.duplicate_linked',jsonb_build_object('related_id',p_from,'related_name',source.name,'reason',left(trim(p_reason),500))),
          (p_org,p_from,'lead.duplicate_linked',jsonb_build_object('related_id',p_into,'related_name',target.name,'reason',left(trim(p_reason),500)));
end $$;
revoke execute on function public.merge_leads(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.merge_leads(uuid,uuid,uuid,text) to authenticated;
