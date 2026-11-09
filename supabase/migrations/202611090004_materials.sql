create table public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  object_path text unique not null,
  filename text not null check (length(filename) between 1 and 180),
  mime text not null check (mime in ('image/png','image/jpeg','image/webp','video/mp4','application/pdf')),
  bytes integer not null check (bytes between 1 and 5242880),
  kind text not null check (kind in ('logo','image','video','document','screenshot')),
  origin text not null check (length(trim(origin)) between 1 and 240),
  holder text not null check (length(trim(holder)) between 1 and 180),
  permission_note text not null check (length(trim(permission_note)) between 3 and 1000),
  purpose text not null check (length(trim(purpose)) between 1 and 300),
  restrictions text not null default '',
  authorized_on date not null,
  revoked_at timestamptz,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,lead_id) references public.leads(organization_id,id) on delete cascade,
  check (object_path = organization_id::text || '/' || lead_id::text || '/' || id::text)
);
create index asset_lead_idx on public.brand_assets(organization_id,lead_id,created_at desc);
alter table public.brand_assets enable row level security;
revoke all on public.brand_assets from anon,authenticated;
grant select,insert on public.brand_assets to authenticated;
grant update(revoked_at) on public.brand_assets to authenticated;
grant delete on public.brand_assets to authenticated;
create policy asset_read on public.brand_assets for select to authenticated using (app_private.is_member(organization_id));
create policy asset_insert on public.brand_assets for insert to authenticated with check (app_private.is_member(organization_id) and created_by=(select auth.uid()) and revoked_at is null);
create policy asset_revoke on public.brand_assets for update to authenticated using (app_private.is_owner(organization_id) or (app_private.is_member(organization_id) and created_by=(select auth.uid())))
  with check (app_private.is_member(organization_id) and revoked_at is not null);
create function app_private.material_object_exists(org uuid, object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.is_member(org) and split_part(object_name,'/',1)=org::text and exists(
    select 1 from storage.objects o where o.bucket_id='specter-materials' and o.name=object_name
  );
$$;
revoke all on function app_private.material_object_exists(uuid,text) from public;
grant execute on function app_private.material_object_exists(uuid,text) to authenticated;
create policy asset_failed_cleanup on public.brand_assets for delete to authenticated using (
  app_private.is_member(organization_id) and created_by=(select auth.uid()) and not app_private.material_object_exists(organization_id,object_path)
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('specter-materials','specter-materials',false,5242880,array['image/png','image/jpeg','image/webp','video/mp4','application/pdf'])
  on conflict(id) do nothing;
create policy specter_asset_read on storage.objects for select to authenticated using (
  bucket_id='specter-materials' and exists(select 1 from public.brand_assets a where a.object_path=storage.objects.name
    and a.revoked_at is null and app_private.is_member(a.organization_id))
);
create policy specter_asset_upload on storage.objects for insert to authenticated with check (
  bucket_id='specter-materials' and exists(select 1 from public.brand_assets a where a.object_path=storage.objects.name
    and a.revoked_at is null and a.created_by=(select auth.uid()) and app_private.is_member(a.organization_id))
);
