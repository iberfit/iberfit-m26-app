-- M37 integrity hardening: legacy mirror holds only Client-safe fields.
-- A supervised appointment must never reveal its internal exercise prescription
-- via direct SELECT of the historical sessions table.
DO $m37_redaction$
DECLARE
  previous_sql text:=pg_get_functiondef('public.iberfit_execute_command_v26_rc29(jsonb)'::regprocedure);
  before_piece text:=$old$      v_next_body,'publicado',v_next_revision,v_now,auth.uid())$old$;
  after_piece text:=$new$      jsonb_build_object(
        'blocks',case when v_next_body->>'deliveryModality'='guiada_en_app' then v_next_body->'blocks' else '[]'::jsonb end,
        'durationMinutes',v_next_body->'durationMinutes',
        'deliveryModality',v_next_body->>'deliveryModality',
        'deliveryOwnership',v_next_body->>'deliveryOwnership',
        'clientVisibilityLevel',v_next_body->>'clientVisibilityLevel'
      ),'publicado',v_next_revision,v_now,auth.uid())$new$;
BEGIN
  IF md5(previous_sql)<>'f8bd44541c790b1c4c41676dcb111a9f'
     OR position(before_piece in previous_sql)=0 THEN
    RAISE EXCEPTION 'M37_REDACTION_SOURCE_DRIFT';
  END IF;
  EXECUTE replace(previous_sql,before_piece,after_piece);
END
$m37_redaction$;
