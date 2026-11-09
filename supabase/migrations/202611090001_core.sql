create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (length(display_name) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  city text not null default 'São Luís',
  region text not null default 'MA' check (region ~ '^[A-Z]{2}$'),
  segments text not null default '',
  message_name text not null,
  retention_days int not null default 365 check (retention_days between 30 and 3650),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid references public.organizations on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);
create index member_user_idx on public.organization_members(user_id,organization_id);

create function app_private.is_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.organization_members m where m.organization_id = org and m.user_id = (select auth.uid()));
$$;
create function app_private.is_owner(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.organization_members m where m.organization_id = org and m.user_id = (select auth.uid()) and m.role = 'owner');
$$;
revoke all on function app_private.is_member(uuid), app_private.is_owner(uuid) from public;
grant execute on function app_private.is_member(uuid), app_private.is_owner(uuid) to authenticated;

create type public.lead_stage as enum ('discovered','review','qualified','contact','identified','permission','preview','meeting','proposal','negotiation','won','lost','blocked');
create type public.website_status as enum ('owned','third_party','social','not_found','possible','unreachable','insufficient','conflict');
create type public.evidence_review as enum ('pending','confirmed','corrected','inconclusive','conflict');
create type public.contact_kind as enum ('phone','whatsapp','email','instagram','website','maps');
create type public.preview_state as enum ('not_started','building','ready','sent','review','approved','archived');

create function app_private.name_key(input text) returns text language sql immutable strict set search_path = '' as $$
  select regexp_replace(trim(translate(lower(input),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')), '\s+', ' ', 'g');
$$;
grant execute on function app_private.name_key(text) to authenticated;

create table public.exclusions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  name_key text generated always as (app_private.name_key(name)) stored,
  created_at timestamptz not null default now(),
  unique(organization_id,name_key)
);
create table public.suppression_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  name_key text not null,
  city_key text not null,
  reason text not null,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique(organization_id,name_key,city_key)
);
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  created_by uuid default auth.uid() references auth.users on delete set null,
  assignee_id uuid,
  name text not null check (length(trim(name)) between 1 and 160),
  name_key text generated always as (app_private.name_key(name)) stored,
  sector text not null check (length(trim(sector)) between 1 and 100),
  city text not null check (length(trim(city)) between 1 and 100),
  city_key text generated always as (app_private.name_key(city)) stored,
  region text not null check (region ~ '^[A-Z]{2}$'),
  district text not null default '',
  address text not null default '',
  domain text,
  notes text not null default '',
  source_kind text not null default 'manual' check (source_kind in ('manual','csv')),
  source_label text not null check (length(trim(source_label)) between 1 and 200),
  source_url text check (source_url ~ '^https?://'),
  consulted_on date not null,
  stage public.lead_stage not null default 'discovered',
  website_status public.website_status not null default 'insufficient',
  priority text check (priority in ('alta','media','baixa')),
  next_action text not null default '',
  follow_up date,
  contract_value numeric(12,2) check (contract_value >= 0),
  loss_reason text check (loss_reason is null or length(trim(loss_reason)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  foreign key (organization_id,assignee_id) references public.organization_members(organization_id,user_id),
  check (stage <> 'lost' or loss_reason is not null)
);
create index lead_list_idx on public.leads(organization_id,updated_at desc,id);
create index lead_identity_idx on public.leads(organization_id,name_key,city_key,region);
create index lead_domain_idx on public.leads(organization_id,domain) where domain is not null;
create index lead_stage_idx on public.leads(organization_id,stage);

create table public.lead_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  kind public.contact_kind not null,
  value text not null check (length(trim(value)) between 1 and 2048),
  normalized text not null check (length(normalized) between 1 and 2048),
  source_label text not null check (length(trim(source_label)) between 1 and 200),
  consulted_on date not null,
  confirmed boolean not null default false,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,lead_id) references public.leads(organization_id,id) on delete cascade,
  unique (organization_id,lead_id,kind,normalized),
  check (kind not in ('phone','whatsapp') or normalized ~ '^\+[1-9][0-9]{7,14}$')
);
create index contact_identity_idx on public.lead_contacts(organization_id,kind,normalized);
create index contact_lead_idx on public.lead_contacts(organization_id,lead_id);

create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  kind text not null check (length(trim(kind)) between 1 and 80),
  observed text not null check (length(trim(observed)) between 1 and 2000),
  url text check (url ~ '^https?://'),
  provider text not null default 'manual' check (provider in ('manual','csv')),
  source_label text not null check (length(trim(source_label)) between 1 and 200),
  consulted_on date not null,
  method text not null check (length(trim(method)) between 1 and 180),
  excerpt text check (length(excerpt) <= 500),
  confidence text not null default 'pendente' check (confidence in ('suficiente','pendente','insuficiente')),
  review public.evidence_review not null default 'pending',
  review_note text check (length(review_note) <= 1000),
  expires_at timestamptz,
  export_allowed boolean not null default false,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique(organization_id,lead_id,id),
  foreign key (organization_id,lead_id) references public.leads(organization_id,id) on delete cascade
);
create index evidence_lead_idx on public.evidence_items(organization_id,lead_id,consulted_on desc);

create table public.website_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  status public.website_status not null,
  domain text,
  evidence_id uuid not null,
  method text not null check (length(trim(method)) between 1 and 180),
  inference text not null default '',
  pending text not null default '',
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,lead_id,evidence_id) references public.evidence_items(organization_id,lead_id,id) on delete restrict
);
create index website_lead_idx on public.website_assessments(organization_id,lead_id,created_at desc);

create table public.opportunity_assessments (
  organization_id uuid not null,
  lead_id uuid not null,
  criterion text not null check (criterion in ('gap','fit','contact','materials','investment')),
  points int not null check (points >= 0 and points <= case criterion when 'gap' then 30 when 'fit' then 25 else 15 end),
  rationale text not null check (length(trim(rationale)) between 3 and 1000),
  evidence_id uuid not null,
  created_by uuid default auth.uid() references auth.users on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id,lead_id,criterion),
  foreign key (organization_id,lead_id,evidence_id) references public.evidence_items(organization_id,lead_id,id) on delete restrict
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  assignee_id uuid,
  title text not null check (length(trim(title)) between 1 and 180),
  kind text not null check (kind in ('evidence','contact','preview','follow_up','proposal','meeting','other')),
  due date not null,
  status text not null default 'open' check (status in ('open','done')),
  note text not null default '',
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,lead_id) references public.leads(organization_id,id) on delete cascade,
  foreign key (organization_id,assignee_id) references public.organization_members(organization_id,user_id)
);
create index task_due_idx on public.tasks(organization_id,status,due);

create table public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  kind text not null check (kind in ('draft','sent','reply','call')),
  purpose text,
  channel text,
  content text not null check (length(trim(content)) between 1 and 3000),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,lead_id) references public.leads(organization_id,id) on delete cascade
);
create index outreach_lead_idx on public.outreach_events(organization_id,lead_id,created_at desc);

create table public.previews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  url text not null check (url ~ '^https?://'),
  repository text check (repository ~ '^https?://'),
  status public.preview_state not null default 'building',
  sent_on date,
  feedback text not null default '',
  note text not null default '',
  checklist text[] not null default '{}',
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id,lead_id),
  foreign key (organization_id,lead_id) references public.leads(organization_id,id) on delete cascade
);
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  evidence_id uuid not null,
  kind text not null,
  problem text not null,
  solution text not null,
  benefit text not null,
  scope text not null,
  questions text not null,
  objections text not null,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,lead_id,evidence_id) references public.evidence_items(organization_id,lead_id,id) on delete restrict
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  lead_id uuid,
  event text not null,
  detail jsonb not null default '{}',
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index audit_list_idx on public.audit_events(organization_id,lead_id,created_at desc);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.exclusions enable row level security;
alter table public.suppression_entries enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.profiles, public.organizations, public.organization_members, public.exclusions, public.suppression_entries, public.audit_events from anon,authenticated;
grant select on public.profiles, public.organizations, public.organization_members, public.suppression_entries, public.audit_events to authenticated;
grant update(name,city,region,segments,message_name,retention_days) on public.organizations to authenticated;
grant select,insert,delete on public.exclusions to authenticated;
grant insert(organization_id,event,detail) on public.audit_events to authenticated;
create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy organization_members_read on public.organizations for select to authenticated using (app_private.is_member(id));
create policy organization_owner_update on public.organizations for update to authenticated using (app_private.is_owner(id)) with check (app_private.is_owner(id));
create policy membership_read on public.organization_members for select to authenticated using (app_private.is_member(organization_id));
create policy exclusions_read on public.exclusions for select to authenticated using (app_private.is_member(organization_id));
create policy exclusions_insert on public.exclusions for insert to authenticated with check (app_private.is_owner(organization_id));
create policy exclusions_delete on public.exclusions for delete to authenticated using (app_private.is_owner(organization_id));
create policy suppression_read on public.suppression_entries for select to authenticated using (app_private.is_member(organization_id));
create policy audit_read on public.audit_events for select to authenticated using (app_private.is_member(organization_id));
create policy audit_export on public.audit_events for insert to authenticated with check (app_private.is_member(organization_id) and event = 'export.csv');

do $$
declare relation text;
begin
  foreach relation in array array['leads','lead_contacts','evidence_items','website_assessments','opportunity_assessments','tasks','outreach_events','previews','offers']
  loop
    execute format('alter table public.%I enable row level security',relation);
    execute format('revoke all on public.%I from anon,authenticated',relation);
    execute format('grant select,insert,update on public.%I to authenticated',relation);
    execute format('create policy tenant_select on public.%I for select to authenticated using (app_private.is_member(organization_id))',relation);
    execute format('create policy tenant_insert on public.%I for insert to authenticated with check (app_private.is_member(organization_id) and created_by = (select auth.uid()))',relation);
    execute format('create policy tenant_update on public.%I for update to authenticated using (app_private.is_member(organization_id)) with check (app_private.is_member(organization_id))',relation);
  end loop;
end $$;
revoke insert,update on public.leads, public.website_assessments, public.outreach_events from authenticated;
grant update(sector,district,address,notes,priority,assignee_id,next_action,follow_up,contract_value) on public.leads to authenticated;
revoke update on public.lead_contacts, public.evidence_items, public.tasks, public.previews, public.offers, public.opportunity_assessments from authenticated;
grant update(confirmed) on public.lead_contacts to authenticated;
grant update(observed,review,review_note,confidence) on public.evidence_items to authenticated;
grant update(status,title,kind,due,assignee_id,note) on public.tasks to authenticated;
grant update(url,repository,status,sent_on,feedback,note,checklist) on public.previews to authenticated;
grant update(points,rationale,evidence_id,updated_at) on public.opportunity_assessments to authenticated;
drop policy tenant_select on public.evidence_items;
create policy tenant_select on public.evidence_items for select to authenticated
using (app_private.is_member(organization_id) and (expires_at is null or expires_at > now()));

create function public.create_organization(p_name text,p_responsible text,p_city text,p_region text,p_segments text,p_message_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); org uuid;
begin
  if actor is null then raise exception 'Acesso negado' using errcode='42501'; end if;
  insert into public.profiles(id,display_name) values(actor,trim(p_responsible)) on conflict(id) do update set display_name=excluded.display_name;
  insert into public.organizations(name,city,region,segments,message_name,created_by)
    values(trim(p_name),trim(p_city),p_region,trim(p_segments),trim(p_message_name),actor) returning id into org;
  insert into public.organization_members values(org,actor,'owner',now());
  insert into public.exclusions(organization_id,name) values (org,'Mimos Pet'),(org,'Café Boutique'),(org,'Priscilla Martins Estética');
  return org;
end $$;

create function public.create_lead(p_org uuid,p_data jsonb,p_override boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result uuid; c jsonb;
  nkey text := app_private.name_key(p_data->>'name');
  ckey text := app_private.name_key(p_data->>'city');
  kind text := coalesce(p_data->>'source_kind','manual');
begin
  if not app_private.is_member(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_data->>'consulted_on' is null or jsonb_typeof(coalesce(p_data->'contacts','[]')) <> 'array'
     or jsonb_array_length(coalesce(p_data->'contacts','[]')) > 8 then raise exception 'Dados de cadastro inválidos' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,0));
  if exists(select 1 from public.exclusions e where e.organization_id=p_org and e.name_key=nkey)
     or exists(select 1 from public.suppression_entries s where s.organization_id=p_org and s.name_key=nkey and s.city_key=ckey)
     or exists(select 1 from public.leads l where l.organization_id=p_org and l.stage='blocked' and (
       (l.name_key=nkey and l.city_key=ckey and l.region=p_data->>'region') or (l.domain is not null and l.domain=p_data->>'domain')
       or exists(select 1 from public.lead_contacts c join jsonb_array_elements(coalesce(p_data->'contacts','[]')) j on c.normalized=j->>'normalized'
         and (c.kind::text=j->>'kind' or (c.kind in ('phone','whatsapp') and (j->>'kind') in ('phone','whatsapp')))
         where c.organization_id=p_org and c.lead_id=l.id and c.kind in ('phone','whatsapp','instagram'))))
     then raise exception 'Empresa na lista de exclusão ou não contato' using errcode='P2001'; end if;
  if not coalesce(p_override,false) and (
    exists(select 1 from public.leads l where l.organization_id=p_org and (
      (l.name_key=nkey and l.city_key=ckey and l.region=p_data->>'region')
      or (l.domain is not null and l.domain=p_data->>'domain')))
    or exists(select 1 from public.lead_contacts lc join jsonb_array_elements(coalesce(p_data->'contacts','[]')) j
      on lc.normalized=j->>'normalized' and (lc.kind::text=j->>'kind' or (lc.kind in ('phone','whatsapp') and (j->>'kind') in ('phone','whatsapp')))
      where lc.organization_id=p_org and lc.kind in ('phone','whatsapp','instagram'))
  ) then raise exception 'Possível duplicação: revise a carteira antes de cadastrar outra unidade' using errcode='P2002'; end if;
  insert into public.leads(organization_id,created_by,name,sector,city,region,district,address,domain,notes,source_kind,source_label,source_url,consulted_on)
  values(p_org,actor,p_data->>'name',p_data->>'sector',p_data->>'city',p_data->>'region',coalesce(p_data->>'district',''),
    coalesce(p_data->>'address',''),p_data->>'domain',coalesce(p_data->>'notes',''),kind,p_data->>'source_label',
    p_data->>'source_url',(p_data->>'consulted_on')::date) returning id into result;
  for c in select value from jsonb_array_elements(coalesce(p_data->'contacts','[]')) loop
    insert into public.lead_contacts(organization_id,lead_id,created_by,kind,value,normalized,source_label,consulted_on)
      values(p_org,result,actor,(c->>'kind')::public.contact_kind,c->>'value',c->>'normalized',p_data->>'source_label',(p_data->>'consulted_on')::date);
  end loop;
  insert into public.evidence_items(organization_id,lead_id,created_by,kind,observed,url,provider,source_label,consulted_on,method,export_allowed)
    values(p_org,result,actor,'Cadastro','Nome e localização informados no cadastro.',p_data->>'source_url',kind,p_data->>'source_label',(p_data->>'consulted_on')::date,
      case when kind='csv' then 'Importação de dados próprios' else 'Registro manual' end,false);
  insert into public.audit_events(organization_id,lead_id,created_by,event,detail)
    values(p_org,result,actor,'lead.created',jsonb_build_object('source',kind,'duplicate_review',p_override));
  return result;
end $$;

create function public.move_lead(p_org uuid,p_lead uuid,p_stage public.lead_stage,p_reason text default '',p_unblock boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare current_lead public.leads%rowtype;
begin
  if not app_private.is_member(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text,0));
  select * into current_lead from public.leads where organization_id=p_org and id=p_lead for update;
  if not found then raise exception 'Lead indisponível' using errcode='P2003'; end if;
  if current_lead.stage = p_stage then return; end if;
  if p_stage in ('blocked','lost') and length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'Informe o motivo da alteração' using errcode='22023';
  end if;
  if p_stage='blocked' then
    insert into public.suppression_entries(organization_id,name_key,city_key,reason) values(p_org,current_lead.name_key,current_lead.city_key,trim(p_reason))
    on conflict(organization_id,name_key,city_key) do update set reason=excluded.reason;
    update public.leads set stage='blocked' where organization_id=p_org and name_key=current_lead.name_key and city_key=current_lead.city_key;
  elsif current_lead.stage='blocked' then
    if not p_unblock or not app_private.is_owner(p_org) or length(trim(coalesce(p_reason,''))) < 3 then
      raise exception 'O proprietário precisa revisar o desbloqueio' using errcode='42501';
    end if;
    delete from public.suppression_entries where organization_id=p_org and name_key=current_lead.name_key and city_key=current_lead.city_key;
    update public.leads set stage=p_stage,loss_reason=case when p_stage='lost' then trim(p_reason) else null end where organization_id=p_org and id=p_lead;
  else
    update public.leads set stage=p_stage,loss_reason=case when p_stage='lost' then trim(p_reason) else null end where organization_id=p_org and id=p_lead;
  end if;
  insert into public.audit_events(organization_id,lead_id,event,detail) values
    (p_org,p_lead,'lead.stage',jsonb_build_object('from',current_lead.stage,'to',p_stage,'reason',left(coalesce(p_reason,''),500)));
end $$;

create function public.record_outreach(p_org uuid,p_lead uuid,p_kind text,p_purpose text,p_channel text,p_content text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_lead public.leads%rowtype;
begin
  if not app_private.is_member(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into current_lead from public.leads where organization_id=p_org and id=p_lead for update;
  if not found or current_lead.stage='blocked' then raise exception 'Contato indisponível para este lead' using errcode='P2001'; end if;
  if p_kind='sent' and p_channel='WhatsApp' and not exists(
    select 1 from public.lead_contacts c where c.organization_id=p_org and c.lead_id=p_lead and c.kind='whatsapp' and c.confirmed
  ) then raise exception 'Confirme um número de WhatsApp primeiro' using errcode='22023'; end if;
  insert into public.outreach_events(organization_id,lead_id,kind,purpose,channel,content) values (p_org,p_lead,p_kind,p_purpose,p_channel,p_content);
  if p_kind in ('sent','call') and current_lead.stage in ('discovered','review','qualified') then
    update public.leads set stage='contact' where organization_id=p_org and id=p_lead;
  end if;
  insert into public.audit_events(organization_id,lead_id,event,detail) values(p_org,p_lead,'outreach.'||p_kind,jsonb_build_object('channel',p_channel));
end $$;

create function public.assess_website(p_org uuid,p_lead uuid,p_status public.website_status,p_evidence uuid,p_domain text,p_method text,p_inference text,p_pending text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_member(p_org) then raise exception 'Acesso negado' using errcode='42501'; end if;
  perform 1 from public.leads where organization_id=p_org and id=p_lead for update;
  if not found then raise exception 'Lead indisponível' using errcode='P2003'; end if;
  if not exists(select 1 from public.evidence_items where organization_id=p_org and lead_id=p_lead and id=p_evidence
    and (expires_at is null or expires_at > now()) and (p_status<>'owned' or (review in ('confirmed','corrected') and p_domain is not null)))
  then raise exception 'A evidência precisa pertencer ao lead e estar disponível. Confirme a evidência e o domínio para indicar site próprio.' using errcode='22023'; end if;
  insert into public.website_assessments(organization_id,lead_id,status,domain,evidence_id,method,inference,pending)
    values(p_org,p_lead,p_status,p_domain,p_evidence,p_method,p_inference,p_pending);
  update public.leads set website_status=p_status,domain=coalesce(p_domain,domain) where organization_id=p_org and id=p_lead;
  insert into public.audit_events(organization_id,lead_id,event,detail) values(p_org,p_lead,'website.assessed',jsonb_build_object('status',p_status,'evidence_id',p_evidence));
end $$;

create function app_private.touch_lead() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at:=now(); return new; end $$;
create trigger lead_updated before update on public.leads for each row execute function app_private.touch_lead();

create function app_private.check_assessment_evidence() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.evidence_items e where e.organization_id=new.organization_id and e.lead_id=new.lead_id and e.id=new.evidence_id
    and e.review in ('confirmed','corrected') and (e.expires_at is null or e.expires_at > now())) then
    raise exception 'Selecione uma evidência confirmada do próprio lead' using errcode='22023';
  end if;
  return new;
end $$;
create trigger opportunity_evidence before insert or update on public.opportunity_assessments for each row execute function app_private.check_assessment_evidence();
create trigger offer_evidence before insert on public.offers for each row execute function app_private.check_assessment_evidence();

revoke execute on function public.create_organization(text,text,text,text,text,text),
  public.create_lead(uuid,jsonb,boolean),public.move_lead(uuid,uuid,public.lead_stage,text,boolean),
  public.record_outreach(uuid,uuid,text,text,text,text),public.assess_website(uuid,uuid,public.website_status,uuid,text,text,text,text) from public,anon;
grant execute on function public.create_organization(text,text,text,text,text,text),
  public.create_lead(uuid,jsonb,boolean),public.move_lead(uuid,uuid,public.lead_stage,text,boolean),
  public.record_outreach(uuid,uuid,text,text,text,text),public.assess_website(uuid,uuid,public.website_status,uuid,text,text,text,text) to authenticated;
