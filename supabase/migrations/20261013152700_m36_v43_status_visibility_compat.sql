-- M36 compatibility: V43 uses a different lifecycle from canonical V26.
-- Plans: draft -> active/paused -> completed/archived.
-- Sessions: planned -> confirmed -> started -> completed/cancelled.
-- Do not accidentally hide confirmed or in-progress V43 sessions from their Client.
-- No data writes, no role changes, no new grants.
BEGIN;

ALTER POLICY m26_plans_read_v43 ON public.m26_training_plans_v43
USING (
  is_assigned_coach(client_id)
  OR (
    client_id = (SELECT public.iberfit_client_id())
    AND status IN ('active','paused','completed')
  )
);

ALTER POLICY m26_sessions_read_v43 ON public.m26_training_sessions_v43
USING (
  is_assigned_coach(client_id)
  OR (
    client_id = (SELECT public.iberfit_client_id())
    AND status IN ('confirmed','started','completed')
  )
);

COMMIT;
