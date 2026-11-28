# Connected360 V48 — contrato de historial y acceso profesional
**BORRADOR TÉCNICO NO EJECUTABLE COMO MIGRACIÓN.** No se ha aplicado DDL en QA ni PROD. Requiere generación por CLI, revisión, pruebas de autorización, presupuesto M43, restauración M44 y certificación antes de promocionar. Mantener PR #1477 en draft.

## Estado contrastado
- PROD: tabla existente m26_wearable_exercise_evidence_v46 con RLS, sin SELECT autenticado; únicamente provider health_connect y deportes running, interval_running, hiit, cycling, walking, strength, other.
- Identidad opaca única por propietario/cliente/proveedor/source_record_key; índice cliente/fecha, PK UUID. Sin tiempo activo ni potencia/cadencia en la tabla. No presentar elapsed como active.
- Authorization status V2 valida grant y cursor de revocación. V46/V47 no autorizan compartir con Coach. client_assignments es la relación UUID usada por la autorización canónica v26; iberfit_coach_client_assignments usa client_id textual y no puede intercambiarse sin reconciliar identidad.
- consent_acceptances_v17 permite INSERT del propio usuario y UPDATE administrativo; no basta como consentimiento revocable específico por profesional sin comprobar titularidad, destinatario, versión, revocación y semántica de última decisión. No confiar en evidence arbitraria para autorización.
- private: USAGE authenticated sí, anon no; la RPC actual de resumen permite EXECUTE authenticated, no anon. Confirmar private no expuesto en Data API de ambos entornos antes de aplicar.

## Lectura Cliente: SQL de referencia para validar en entorno restaurado
No crear tablas adicionales. No exponer source_record_key ni IDs de cuenta. Separar resumen de siete días (Hoy/Evolución) de páginas solicitadas por el usuario. V48 inicial solo Health Connect. Revalidar alcance por grant/cursor en cada página, no confiar en el cursor del navegador como autorización.

```sql
-- DRAFT: no ejecutar sin protocolo de migración y certificación.
CREATE OR REPLACE FUNCTION private.m26_wearable_v48_activity_page_internal(
  p_before_started_at timestamptz, p_before_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_client uuid := public.iberfit_client_id();
  v_auth jsonb;
  v_grant uuid;
  v_rev bigint;
  v_hr boolean;
  v_result jsonb;
BEGIN
  IF v_owner IS NULL OR v_client IS NULL
     OR public.iberfit_current_role_v26() IS DISTINCT FROM 'cliente'
     OR ((p_before_started_at IS NULL) <> (p_before_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='M26_V48_ACTIVITY_FORBIDDEN';
  END IF;
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  IF NOT EXISTS (SELECT 1 FROM public.m26_wearable_v46_release_control_prod
    WHERE id=true AND enabled=true) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='M26_V48_ACTIVITY_DISABLED';
  END IF;
  -- Serialize with the existing wearable revocation fence.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint));
  v_auth:=public.m26_wearable_authorization_status_v2('health_connect');
  IF (v_auth->>'authorized') IS DISTINCT FROM 'true'
     OR NOT coalesce((v_auth->'scopes') ? 'exerciseSessions',false) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='M26_V48_ACTIVITY_CONSENT_REQUIRED';
  END IF;
  v_grant:=(v_auth->>'grantId')::uuid;
  v_rev:=(v_auth->>'revocationCursor')::bigint;
  v_hr:=coalesce((v_auth->'scopes') ? 'generalHeartRate',false);
  IF v_grant IS NULL OR v_rev IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='M26_V48_ACTIVITY_CONSENT_REQUIRED';
  END IF;
  WITH candidates AS (
    SELECT w.id,w.sport,w.observed_started_at,w.observed_ended_at,w.distance_meters,
      w.heart_rate_samples,w.heart_rate_avg
    FROM public.m26_wearable_exercise_evidence_v46 w
    WHERE w.owner_user_id=v_owner AND w.client_id=v_client
      AND w.provider='health_connect' AND w.grant_id=v_grant
      AND w.revocation_cursor=v_rev AND w.link_status='unlinked'
      AND (p_before_started_at IS NULL OR
        (w.observed_started_at,w.id)<(p_before_started_at,p_before_id))
    ORDER BY w.observed_started_at DESC,w.id DESC
    LIMIT 21
  ), page AS (
    SELECT * FROM candidates ORDER BY observed_started_at DESC,id DESC LIMIT 20
  ), last_row AS (
    SELECT * FROM page ORDER BY observed_started_at ASC,id ASC LIMIT 1
  )
  SELECT pg_catalog.jsonb_build_object(
    'ok',true,'schema','iberfit.connected360.activity-page.v1','provider','health_connect',
    'exerciseEvidence',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',id,'sport',sport,
        'startedAt',pg_catalog.to_char(observed_started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'endedAt',pg_catalog.to_char(observed_ended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'distanceMeters',distance_meters,
        'heartRateSamples',CASE WHEN v_hr THEN heart_rate_samples END,
        'avgBpm',CASE WHEN v_hr AND heart_rate_samples>0 THEN heart_rate_avg END,
        'linkedToTraining',false
      ) ORDER BY observed_started_at DESC,id DESC) FROM page
    ),'[]'::jsonb),
    'nextCursor',CASE WHEN (SELECT count(*) FROM candidates)>20 THEN (
      SELECT pg_catalog.jsonb_build_object('id',id,'startedAt',
        pg_catalog.to_char(observed_started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
      FROM last_row
    ) ELSE NULL END
  ) INTO v_result;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION private.m26_wearable_v48_activity_page_internal(timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.m26_wearable_v48_activity_page_internal(timestamptz,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.m26_wearable_v48_my_activity_page_prod_v1(
  p_before_started_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $function$
  SELECT private.m26_wearable_v48_activity_page_internal(p_before_started_at,p_before_id)
$function$;
REVOKE ALL ON FUNCTION public.m26_wearable_v48_my_activity_page_prod_v1(timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v48_my_activity_page_prod_v1(timestamptz,uuid) TO authenticated;
```

The draft deliberately limits history to the currently authorized grant and revocation generation. It does not delete prior observations; any requirement to re-share older generations needs explicit policy and acceptance. The SQL is not yet syntax- or execution-certified. Confirm same fence used by revoke/delete. Measure index plan at representative scale before adding another index; do not add a speculative index.

## Coordinated release contract
1. Add optional activityHistoryAvailable boolean to existing owner V46 summary only when the new RPC is installed, enabled and current grant has exerciseSessions. No additional request for Hoy. Add avgBpm only from rows matching current grant/cursor with current generalHeartRate and positive samples. Preserve existing V46/V47 response and limits. Do not deploy flag before the RPC is certified. Frontend currently stays hidden absent explicit true.
2. Client requests 20 rows via RPC with before timestamp/UUID; stable ordering, 21st row only for has-more; no count(*) of full table, no polling. Client validates exact cursor and renders safe text; page-by-page navigation, clears on owner/visibility/network/consent events; no durable health cache.
3. Coach: design separate explicit per-recipient (and category) grant, tied to owner/client/coach/assignment identity and consent version; canonical UUID assignment and professional role + WebAuthn assurance, enforce both assignment and consent on every page and on revocation. Reuse existing consent infrastructure only after hardening server-owned write/withdraw semantics; otherwise minimal dedicated consent relation justified, never duplicate activities. No Admin bypass. Server-minimized DTO; no raw source/device identifiers. History UI only in assigned client file. Do not allow generic admin/client-access helpers to authorize health disclosure.
4. Apple: current table restricts provider and native V46/V47 contracts Android. Expand provider constraint, ingest allowlist, grant/revoke/delete semantics and HealthKit anchored query/ACK atomically after source-specific acceptance. Active workout duration requires separately validated field (0 < active <= elapsed); swim sport needs explicit mapping in native, contracts, DB and UI. No conversion of elapsed pace into active pace; swim pace min/100m only with supported distance and valid duration. Preserve source provenance. No implicit OAuth integration.
5. Dedup cross-source: keep canonical source identity and revisions; same-source idempotency; only link cross-source when reliable shared identifier or explicit user confirmation. No deleting by near time/distance heuristic. Cursor advancement only after durable ACK; correction/deletion reconciliation and native restart need persistent scoped state. Do not mix evidence with confirmed prescriptions or IRI.
6. Potencia/cadencia optional only from measured permitted source, explicit units and discipline; no defaults or invented values. No raw GPS or continuous polling. Budget Free.

## Required acceptance matrix before enabling
- Owner A vs B; Coach assigned/unassigned/reassigned, consent withdrawn/absent, wrong recipient, expired session, Admin and anon denied; direct REST grants unchanged.
- 0/1/20/21/41 rows, equal timestamp with UUID tie-breaker, submillisecond precision, malformed and replayed cursor, simultaneous import/revoke/delete, offline/relogin, navigation and refresh races. Test no data from other account or old grant; no raw keys in DTO.
- Android and iOS physical watch import, native permissions partial/withdrawn, same activity via two sources, update/delete, duplicate and concurrent import, active/elapsed labels, no effect on plan adherence or IRI.
- QA authenticated read/write with synthetic approved fixtures; restore rehearsal, M43 and M44, advisors, SQL migration lint, CI, E2E devices, production smoke and rollback. No schema/production changes yet.
