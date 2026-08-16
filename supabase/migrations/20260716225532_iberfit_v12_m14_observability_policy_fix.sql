create index if not exists idx_operational_events_session_id on public.operational_events(session_id);
drop policy if exists preview_access_self_read on public.preview_access;
drop policy if exists preview_access_admin_all on public.preview_access;
create policy preview_access_select on public.preview_access for select to authenticated using (user_id = (select auth.uid()) or (select public.iberfit_role()) = 'admin'::public.iberfit_role);
create policy preview_access_insert_admin on public.preview_access for insert to authenticated with check ((select public.iberfit_role()) = 'admin'::public.iberfit_role);
create policy preview_access_update_admin on public.preview_access for update to authenticated using ((select public.iberfit_role()) = 'admin'::public.iberfit_role) with check ((select public.iberfit_role()) = 'admin'::public.iberfit_role);
create policy preview_access_delete_admin on public.preview_access for delete to authenticated using ((select public.iberfit_role()) = 'admin'::public.iberfit_role);;
