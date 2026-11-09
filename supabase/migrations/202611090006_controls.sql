create function app_private.audit_child_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(organization_id,lead_id,created_by,event,detail)
    values(new.organization_id,new.lead_id,auth.uid(),TG_TABLE_NAME||'.'||lower(TG_OP),jsonb_build_object('record_id',new.id));
  return new;
end $$;
revoke all on function app_private.audit_child_change() from public;
create trigger audit_contact after insert or update on public.lead_contacts for each row execute function app_private.audit_child_change();
create trigger audit_evidence after insert or update on public.evidence_items for each row execute function app_private.audit_child_change();
create trigger audit_task after insert or update on public.tasks for each row execute function app_private.audit_child_change();
create trigger audit_preview after insert or update on public.previews for each row execute function app_private.audit_child_change();
create trigger audit_asset after insert or update on public.brand_assets for each row execute function app_private.audit_child_change();
create trigger audit_offer after insert on public.offers for each row execute function app_private.audit_child_change();

create function app_private.prevent_blocked_preview() returns trigger
language plpgsql security definer set search_path = '' as $$
declare stage public.lead_stage;
begin
  if new.status='sent' and new.sent_on is null then raise exception 'Informe a data do envio' using errcode='22023'; end if;
  if new.sent_on is null then return new; end if;
  if TG_OP='UPDATE' and new.sent_on is not distinct from old.sent_on then return new; end if;
  select l.stage into stage from public.leads l where l.organization_id=new.organization_id and l.id=new.lead_id for update;
  if stage='blocked' then raise exception 'Lead na lista de não contato' using errcode='P2001'; end if;
  return new;
end $$;
create trigger preview_contact_guard before insert or update on public.previews for each row execute function app_private.prevent_blocked_preview();

create function public.remove_lead(p_org uuid,p_lead uuid,p_confirm text) returns void
language plpgsql security definer set search_path = '' as $$
declare expected text;
begin
  if not app_private.is_owner(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,0));
  select name into expected from public.leads where organization_id=p_org and id=p_lead for update;
  if not found then raise exception 'Lead indisponível' using errcode='P2003'; end if;
  if expected is distinct from p_confirm then raise exception 'Confirme o nome exato do registro' using errcode='22023'; end if;
  if exists(select 1 from public.brand_assets where organization_id=p_org and lead_id=p_lead)
    then raise exception 'Materiais precisam de tratamento antes da exclusão' using errcode='P2006'; end if;
  delete from public.website_assessments where organization_id=p_org and lead_id=p_lead;
  delete from public.opportunity_assessments where organization_id=p_org and lead_id=p_lead;
  delete from public.offers where organization_id=p_org and lead_id=p_lead;
  delete from public.audit_events where organization_id=p_org and (lead_id=p_lead or detail->>'related_id'=p_lead::text);
  delete from public.leads where organization_id=p_org and id=p_lead;
  insert into public.audit_events(organization_id,event,detail) values(p_org,'lead.removed','{}');
end $$;
revoke execute on function public.remove_lead(uuid,uuid,text) from public,anon;
grant execute on function public.remove_lead(uuid,uuid,text) to authenticated;
