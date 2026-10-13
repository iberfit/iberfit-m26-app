-- M36: fail closed at the database boundary. A Cliente must never read
-- unpublished coaching prescriptions through direct PostgREST requests.
-- No data mutations, role elevation, or write-policy changes.
-- Existing public/Coach/Admin access and the Solo IRI path are preserved.
BEGIN;

ALTER POLICY domain_entities_v26_select ON public.domain_entities_v26
USING (
  public.iberfit_canary_enabled_v26(client_id)
  AND public.iberfit_can_access_client_v26(client_id)
  AND (
    public.iberfit_current_role_v26() <> 'cliente'
    OR (
      entity_type NOT IN ('private_note','intelligence')
      AND (
        entity_type NOT IN ('planning','session','report')
        OR (
          status IN (
            'publicado','publicada','published','disponible','en_curso',
            'activo','active','habilitado','enabled',
            'completado','completada','completed'
          )
          AND coalesce(lower(body ->> 'visibleToClient'),'true')
              NOT IN ('false','0','no')
        )
      )
    )
  )
);

-- The V43 tables are separate publicly exposed API surfaces; UI filtering
-- of their bootstrap snapshots is not an authorization boundary.
ALTER POLICY m26_plans_read_v43 ON public.m26_training_plans_v43
USING (
  is_assigned_coach(client_id)
  OR (
    client_id = (SELECT public.iberfit_client_id())
    AND status IN (
      'publicado','publicada','published','disponible','en_curso',
      'activo','active','habilitado','enabled',
      'completado','completada','completed'
    )
  )
);

ALTER POLICY m26_sessions_read_v43 ON public.m26_training_sessions_v43
USING (
  is_assigned_coach(client_id)
  OR (
    client_id = (SELECT public.iberfit_client_id())
    AND status IN (
      'publicado','publicada','published','disponible','en_curso',
      'activo','active','habilitado','enabled',
      'completado','completada','completed'
    )
  )
);

COMMIT;
