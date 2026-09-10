-- Historical/governance records must survive client deletion while their optional client link is removed.
-- Align the FK semantics with the nullable client_id model so database behavior is safe independently of the RPC.

alter table public.beta_incidents_v16
  drop constraint beta_incidents_v16_client_id_fkey,
  add constraint beta_incidents_v16_client_id_fkey foreign key (client_id) references public.clients(id) on delete set null;

alter table public.beta_participants_v16
  drop constraint beta_participants_v16_client_id_fkey,
  add constraint beta_participants_v16_client_id_fkey foreign key (client_id) references public.clients(id) on delete set null;

alter table public.consent_acceptances_v17
  drop constraint consent_acceptances_v17_client_id_fkey,
  add constraint consent_acceptances_v17_client_id_fkey foreign key (client_id) references public.clients(id) on delete set null;

alter table public.data_subject_requests_v17
  drop constraint data_subject_requests_v17_client_id_fkey,
  add constraint data_subject_requests_v17_client_id_fkey foreign key (client_id) references public.clients(id) on delete set null;

alter table public.device_conflict_trials
  drop constraint device_conflict_trials_client_id_fkey,
  add constraint device_conflict_trials_client_id_fkey foreign key (client_id) references public.clients(id) on delete set null;

alter table public.incident_register_v17
  drop constraint incident_register_v17_client_id_fkey,
  add constraint incident_register_v17_client_id_fkey foreign key (client_id) references public.clients(id) on delete set null;
