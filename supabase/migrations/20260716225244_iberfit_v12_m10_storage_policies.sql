drop policy if exists storage_iberfit_documents_admin_all on storage.objects;
create policy storage_iberfit_documents_admin_all on storage.objects for all using (bucket_id = 'iberfit-documents-private' and public.iberfit_role() = 'admin') with check (bucket_id = 'iberfit-documents-private' and public.iberfit_role() = 'admin');
drop policy if exists storage_iberfit_documents_coach_assigned_read on storage.objects;
create policy storage_iberfit_documents_coach_assigned_read on storage.objects for select using (bucket_id = 'iberfit-documents-private' and public.iberfit_role() = 'coach' and public.is_assigned_coach((split_part(name, '/', 1))::uuid));
drop policy if exists storage_iberfit_documents_client_published_read on storage.objects;
create policy storage_iberfit_documents_client_published_read on storage.objects for select using (bucket_id = 'iberfit-documents-private' and public.iberfit_role() = 'client' and public.iberfit_client_id() = (split_part(name, '/', 1))::uuid and exists (select 1 from public.documents d where d.client_id = public.iberfit_client_id() and d.status = 'publicado' and d.audience = 'cliente' and d.storage_path = storage.objects.name));;
