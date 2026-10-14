-- M42 · Optional personal avatars. Separate from initial IRI clinical/postural media.
-- PRIVATE authenticated Storage only; no table-level/public URL leaks.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('iberfit-profile-avatars','iberfit-profile-avatars',false,524288,array['image/webp']::text[])
on conflict (id) do nothing;

do $ib$
begin
  if not exists (
    select 1 from storage.buckets
    where id='iberfit-profile-avatars' and public=false
      and file_size_limit is not distinct from 524288
      and allowed_mime_types @> array['image/webp']::text[]
  ) then
    raise exception 'M42_AVATAR_BUCKET_CONTRACT_MISMATCH';
  end if;
end
$ib$;

create or replace function public.iberfit_avatar_client_id_v1(p_name text)
returns uuid language sql immutable strict security invoker set search_path=''
as $fn$
  select case when p_name ~
   '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar[.]webp$'
   then split_part(p_name,'/',1)::uuid else null::uuid end
$fn$;
revoke all on function public.iberfit_avatar_client_id_v1(text) from public,anon;
grant execute on function public.iberfit_avatar_client_id_v1(text) to authenticated;

-- No anonymous access. Coach only sees explicitly assigned clients; Admin scope
-- is governed by server-side iberfit_role(), never a frontend role argument.
create policy iberfit_m42_avatar_read on storage.objects for select to authenticated
using (
  bucket_id='iberfit-profile-avatars' and auth.uid() is not null
  and public.iberfit_avatar_client_id_v1(name) is not null
  and (
    (public.iberfit_role()::text='client'
      and public.iberfit_client_id()=public.iberfit_avatar_client_id_v1(name))
    or (public.iberfit_role()::text='coach'
      and public.is_assigned_coach(public.iberfit_avatar_client_id_v1(name)))
    or public.iberfit_role()::text='admin'
  )
);
create policy iberfit_m42_avatar_insert on storage.objects for insert to authenticated
with check (
  bucket_id='iberfit-profile-avatars' and auth.uid() is not null
  and public.iberfit_role()::text='client'
  and public.iberfit_client_id()=public.iberfit_avatar_client_id_v1(name)
);
create policy iberfit_m42_avatar_update on storage.objects for update to authenticated
using (
  bucket_id='iberfit-profile-avatars' and auth.uid() is not null
  and public.iberfit_role()::text='client'
  and public.iberfit_client_id()=public.iberfit_avatar_client_id_v1(name)
)
with check (
  bucket_id='iberfit-profile-avatars' and auth.uid() is not null
  and public.iberfit_role()::text='client'
  and public.iberfit_client_id()=public.iberfit_avatar_client_id_v1(name)
);
create policy iberfit_m42_avatar_delete on storage.objects for delete to authenticated
using (
  bucket_id='iberfit-profile-avatars' and auth.uid() is not null
  and public.iberfit_role()::text='client'
  and public.iberfit_client_id()=public.iberfit_avatar_client_id_v1(name)
);
