-- IBERFIT AUDIT 360
-- Performance-only hardening: cache auth.uid() once per statement through an initplan.
-- Access semantics are intentionally unchanged.

alter policy m26_audit_read_v43 on public.m26_audit_events_v43
using (actor_user_id = (select auth.uid()) or (client_id is not null and (client_id = public.iberfit_client_id() or public.is_assigned_coach(client_id))));

alter policy m26_measurements_write_v43 on public.m26_client_measurements_v43
with check (((client_id = public.iberfit_client_id()) or public.is_assigned_coach(client_id)) and created_by = (select auth.uid()));

alter policy m26_messages_insert_v43 on public.m26_messages_v43
with check (((client_id = public.iberfit_client_id()) or public.is_assigned_coach(client_id)) and sender_user_id = (select auth.uid()));

alter policy m26_session_drafts_read_v431 on public.m26_session_drafts_v431
using (owner_user_id = (select auth.uid()) and ((client_id = public.iberfit_client_id()) or public.is_assigned_coach(client_id)));

alter policy m26_session_drafts_insert_v431 on public.m26_session_drafts_v431
with check (owner_user_id = (select auth.uid()) and ((client_id = public.iberfit_client_id()) or public.is_assigned_coach(client_id)));

alter policy m26_session_drafts_update_v431 on public.m26_session_drafts_v431
using (owner_user_id = (select auth.uid()) and ((client_id = public.iberfit_client_id()) or public.is_assigned_coach(client_id)))
with check (owner_user_id = (select auth.uid()) and ((client_id = public.iberfit_client_id()) or public.is_assigned_coach(client_id)));

alter policy m26_session_drafts_delete_v431 on public.m26_session_drafts_v431
using (owner_user_id = (select auth.uid()) and ((client_id = public.iberfit_client_id()) or public.is_assigned_coach(client_id)));

alter policy m26_telemetry_events_insert_v59 on public.m26_telemetry_events_v59
with check (imported_by = (select auth.uid()) and ((client_id = public.iberfit_client_id()) or public.m26_telemetry_can_access_client_v59(client_id)));

alter policy m26_plans_write_v43 on public.m26_training_plans_v43
with check (public.is_assigned_coach(client_id) and created_by = (select auth.uid()));

alter policy m26_sessions_write_v43 on public.m26_training_sessions_v43
with check (((client_id = public.iberfit_client_id()) or public.is_assigned_coach(client_id)) and created_by = (select auth.uid()));

alter policy m26_wearable_connections_delete_v44 on public.m26_wearable_connections_v44
using (owner_user_id = (select auth.uid()) and client_id = public.iberfit_client_id());

alter policy m26_wearable_connections_insert_v44 on public.m26_wearable_connections_v44
with check (owner_user_id = (select auth.uid()) and client_id = public.iberfit_client_id());

alter policy m26_wearable_connections_update_v44 on public.m26_wearable_connections_v44
using (owner_user_id = (select auth.uid()) and client_id = public.iberfit_client_id())
with check (owner_user_id = (select auth.uid()) and client_id = public.iberfit_client_id());

alter policy m26_wearable_consents_insert_v44 on public.m26_wearable_consents_v44
with check (actor_user_id = (select auth.uid()) and client_id = public.iberfit_client_id());

alter policy m26_wearable_summaries_insert_v44 on public.m26_wearable_daily_summaries_v44
with check (client_id = public.iberfit_client_id() and imported_by = (select auth.uid()));

alter policy m26_wearable_summaries_update_v44 on public.m26_wearable_daily_summaries_v44
using (client_id = public.iberfit_client_id() and imported_by = (select auth.uid()))
with check (client_id = public.iberfit_client_id() and imported_by = (select auth.uid()));
