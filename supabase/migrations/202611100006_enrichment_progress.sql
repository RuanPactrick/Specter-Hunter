-- Leitura automática: etapa atual visível para o usuário e conclusão sobre o site quando ele responde.
alter table public.enrichment_requests add column step text check (length(step) <= 80);

-- o worker informa a etapa (e renova o lease, já que Instagram e anúncios demoram)
create function public.enrichment_step(p_org uuid,p_lead uuid,p_lease uuid,p_step text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.enrichment_requests set step=left(p_step,80),lease_expires_at=greatest(lease_expires_at,now()+interval '120 seconds')
    where organization_id=p_org and lead_id=p_lead and state='running' and lease_token=p_lease and lease_expires_at>now();
  return found;
end $$;
revoke execute on function public.enrichment_step(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.enrichment_step(uuid,uuid,uuid,text) to service_role;

-- p_result.site_status = 'owned' quando o site respondeu: a evidência "Leitura do site" (a primeira) é um fato observado,
-- entra confirmada e vira a avaliação do site. Contatos e nota continuam para revisão.
create or replace function public.finish_enrichment(p_org uuid,p_lead uuid,p_lease uuid,p_result jsonb,p_error text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare blocked boolean; site_status text:=p_result->>'site_status'; site_url text; proof uuid;
begin
  perform 1 from public.enrichment_requests where organization_id=p_org and lead_id=p_lead and state='running' and lease_token=p_lease and lease_expires_at>now() for update;
  if not found then return false; end if;
  select stage='blocked' into blocked from public.leads where organization_id=p_org and id=p_lead for update;
  if p_error is not null or blocked then
    update public.enrichment_requests set state='failed',step=null,error_code=left(coalesce(p_error,'blocked'),50),finished_at=now(),lease_token=null,lease_expires_at=null
      where organization_id=p_org and lead_id=p_lead;
    return true;
  end if;
  -- releitura: troca as evidências automáticas ainda não revisadas e sem uso, em vez de duplicar
  delete from public.evidence_items e where e.organization_id=p_org and e.lead_id=p_lead and e.provider='site_reader' and e.review='pending'
    and not exists(select 1 from public.website_assessments s where s.organization_id=p_org and s.lead_id=p_lead and s.evidence_id=e.id)
    and not exists(select 1 from public.opportunity_assessments o where o.organization_id=p_org and o.lead_id=p_lead and o.evidence_id=e.id);
  insert into public.evidence_items(organization_id,lead_id,kind,observed,url,provider,source_label,consulted_on,method,excerpt,export_allowed,review,confidence)
    select p_org,p_lead,left(e->>'kind',80),left(e->>'observed',2000),case when e->>'url' ~ '^https?://' then left(e->>'url',2048) end,
      'site_reader','Leitura automática do site',current_date,'Leitura automática do HTML público do domínio informado',left(e->>'excerpt',500),false,
      case when n=1 and site_status='owned' then 'confirmed'::public.evidence_review else 'pending'::public.evidence_review end,
      case when n=1 and site_status='owned' then 'suficiente' else 'pendente' end
    from jsonb_array_elements(coalesce(p_result->'evidence','[]')) with ordinality as x(e,n)
    where n<=10 and length(trim(coalesce(e->>'kind','')))>0 and length(trim(coalesce(e->>'observed','')))>0;
  if site_status='owned' then
    site_url:=p_result->>'site_url';
    select id into proof from public.evidence_items where organization_id=p_org and lead_id=p_lead and provider='site_reader' and review='confirmed' order by created_at desc limit 1;
    if proof is not null and site_url ~ '^https?://' then
      insert into public.website_assessments(organization_id,lead_id,status,domain,evidence_id,method,pending)
        values(p_org,p_lead,'owned',left(site_url,2048),proof,'Leitura automática: o site respondeu no domínio','');
      update public.leads set website_status='owned',domain=coalesce(domain,substring(site_url from '^https?://(?:www\.)?([^/:]+)')) where organization_id=p_org and id=p_lead;
    end if;
  end if;
  insert into public.lead_contacts(organization_id,lead_id,kind,value,normalized,source_label,consulted_on,confirmed)
    select p_org,p_lead,(c->>'kind')::public.contact_kind,left(c->>'value',2048),left(c->>'normalized',2048),'Leitura automática do site',current_date,false
    from jsonb_array_elements(coalesce(p_result->'contacts','[]')) with ordinality as x(c,n)
    where n<=20 and c->>'kind' in ('phone','whatsapp','email','instagram')
      and length(trim(coalesce(c->>'value','')))>0 and length(coalesce(c->>'normalized',''))>0
      and (c->>'kind' not in ('phone','whatsapp') or c->>'normalized' ~ '^\+[1-9][0-9]{7,14}$')
  on conflict (organization_id,lead_id,kind,normalized) do nothing;
  update public.enrichment_requests set state='done',step=null,error_code=null,suggestion=p_result->'suggestion',finished_at=now(),lease_token=null,lease_expires_at=null
    where organization_id=p_org and lead_id=p_lead;
  insert into public.audit_events(organization_id,lead_id,event,detail) values(p_org,p_lead,'lead.enriched',jsonb_build_object('source','site_reader'));
  return true;
end $$;
