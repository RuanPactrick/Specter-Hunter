-- Nova pesquisa pelo Apify (Google Maps Scraper), como no prospeccao-kit-aluno: as empresas achadas
-- entram direto na carteira pelo create_lead, com as mesmas regras de duplicação e não contato do cadastro manual.
alter table public.leads drop constraint leads_source_kind_check;
alter table public.leads add constraint leads_source_kind_check check (source_kind in ('manual','csv','maps'));
alter table public.evidence_items drop constraint evidence_items_provider_check;
alter table public.evidence_items add constraint evidence_items_provider_check check (provider in ('manual','csv','site_reader','maps'));

alter table public.research_jobs add column provider text not null default 'google_places' check (provider in ('google_places','apify'));
alter table public.research_jobs add column leads_created int not null default 0;
grant select(provider,leads_created) on public.research_jobs to authenticated;

-- p_rows: [{place_id, lead:{name,sector,city,region,district,address,domain,source_label,source_url,consulted_on,contacts}, observed}]
create function public.store_maps_leads(p_job uuid,p_lease uuid,p_rows jsonb)
returns table(result_count int, created int, cancelled boolean)
language plpgsql security definer set search_path = '' as $$
declare j public.research_jobs%rowtype; r jsonb; pid text; lead uuid; made int:=0; total int;
begin
  select * into j from public.research_jobs where id=p_job and state='running' and lease_token=p_lease and lease_expires_at>now() for update;
  if not found then return; end if;
  if j.cancel_requested then return query select j.result_count,0,true; return; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>80 then raise exception 'Lote inválido' using errcode='22023'; end if;
  -- o cadastro roda como quem pediu a pesquisa: create_lead confere a organização e grava a autoria
  perform set_config('request.jwt.claim.sub',j.created_by::text,true);
  select count(*) into total from public.research_results where organization_id=j.organization_id and job_id=j.id;
  for r in select value from jsonb_array_elements(p_rows) loop
    exit when total>=j.desired;
    pid:=r->>'place_id';
    if pid is null or length(pid) not between 1 and 256 or pid !~ '^[A-Za-z0-9_-]+$' then continue; end if;
    if exists(select 1 from public.research_results x where x.organization_id=j.organization_id and x.provider='google_places'
      and x.provider_id=pid and (x.job_id=j.id or j.skip_seen)) then continue; end if;
    insert into public.research_results(organization_id,job_id,provider,provider_id) values(j.organization_id,j.id,'google_places',pid) on conflict do nothing;
    total:=total+1;
    begin
      lead:=public.create_lead(j.organization_id,(r->'lead')||jsonb_build_object('source_kind','maps'),false);
      if length(trim(coalesce(r->>'observed','')))>0 then
        insert into public.evidence_items(organization_id,lead_id,created_by,kind,observed,url,provider,source_label,consulted_on,method,export_allowed)
          values(j.organization_id,lead,j.created_by,'Google Maps',left(r->>'observed',2000),
            case when r->'lead'->>'source_url' ~ '^https?://' then left(r->'lead'->>'source_url',2048) end,
            'maps','Google Maps via Apify',current_date,'Pesquisa automática no Google Maps',false);
      end if;
      made:=made+1;
    exception when sqlstate 'P2001' or sqlstate 'P2002' or data_exception or integrity_constraint_violation then
      null;   -- duplicada, na lista de não contato ou dado inválido: fica só o identificador
    end;
  end loop;
  update public.research_jobs set provider='apify',result_count=total,leads_created=leads_created+made,scan_finished=true,step='deduplication',
    lease_expires_at=now()+interval '90 seconds' where id=p_job;
  insert into public.research_job_steps(organization_id,job_id,step,event) values(j.organization_id,j.id,'deduplication','leads_created');
  return query select total,made,false;
end $$;
-- Uma execução do Apify passa dos 90 s do lease: o worker renova enquanto espera, para não perder o resultado já cobrado.
create function public.extend_research_lease(p_job uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.research_jobs set lease_expires_at=now()+interval '90 seconds'
    where id=p_job and state='running' and lease_token=p_lease and lease_expires_at>now();
  return found;
end $$;
revoke execute on function public.store_maps_leads(uuid,uuid,jsonb),public.extend_research_lease(uuid,uuid) from public,anon,authenticated;
grant execute on function public.store_maps_leads(uuid,uuid,jsonb),public.extend_research_lease(uuid,uuid) to service_role;
