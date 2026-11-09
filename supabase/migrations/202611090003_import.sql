create function public.import_leads(p_org uuid,p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item jsonb; reports jsonb:='[]'; n int:=1; outcome text; inserted uuid;
begin
  if not app_private.is_member(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 then
    raise exception 'Importação inválida' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    begin
      inserted:=public.create_lead(p_org,item||jsonb_build_object('source_kind','csv'),false);
      reports:=reports||jsonb_build_array(jsonb_build_object('position',n,'status','created','id',inserted));
    exception when sqlstate 'P2001' or sqlstate 'P2002' or data_exception or integrity_constraint_violation then
      get stacked diagnostics outcome=returned_sqlstate;
      reports:=reports||jsonb_build_array(jsonb_build_object('position',n,'status',
        case outcome when 'P2001' then 'suppressed' when 'P2002' then 'duplicate' else 'invalid' end));
    end;
    n:=n+1;
  end loop;
  insert into public.audit_events(organization_id,event,detail) values(p_org,'import.csv',jsonb_build_object('lines',n-1));
  return reports;
end $$;
revoke execute on function public.import_leads(uuid,jsonb) from public,anon;
grant execute on function public.import_leads(uuid,jsonb) to authenticated;
