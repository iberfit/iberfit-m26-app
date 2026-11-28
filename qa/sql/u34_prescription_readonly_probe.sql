-- Read-only synthetic verification of the exact U34 replacement postcondition.
-- No row in training_session_occurrences_v1 is read or written.
WITH base AS (
 SELECT '{"id":"00000000-0000-4000-8000-000000000001","client_id":"00000000-0000-4000-8000-000000000002","session_id":"00000000-0000-4000-8000-000000000003","prescription_revision":5,"prescription_snapshot":{"queue":[{"exerciseId":"squat","sets":3,"reps":8}],"blocks":[{"id":"b"}]},"duration_minutes":60}'::jsonb AS original,
 '{"id":"00000000-0000-4000-8000-000000000004","batch_operation_id":"00000000-0000-4000-8000-000000000005","batch_ordinal":1,"status":"planificada","execution_id":null,"revision":0}'::jsonb AS replacement
), cases(name,patch,expected) AS (VALUES
 ('valid','{}'::jsonb,true),
 ('jsonb_key_order','{"prescription_snapshot":{"blocks":[{"id":"b"}],"queue":[{"sets":3,"reps":8,"exerciseId":"squat"}]}}',true),
 ('reps_changed','{"prescription_snapshot":{"queue":[{"exerciseId":"squat","sets":3,"reps":9}],"blocks":[{"id":"b"}]}}',false),
 ('revision_changed','{"prescription_revision":6}',false),
 ('duration_changed','{"duration_minutes":45}',false),
 ('same_id','{"id":"00000000-0000-4000-8000-000000000001"}',false),
 ('wrong_client','{"client_id":"00000000-0000-4000-8000-000000000099"}',false),
 ('wrong_session','{"session_id":"00000000-0000-4000-8000-000000000099"}',false),
 ('wrong_batch','{"batch_operation_id":"00000000-0000-4000-8000-000000000099"}',false),
 ('wrong_ordinal','{"batch_ordinal":2}',false),
 ('wrong_status','{"status":"confirmada"}',false),
 ('execution_bound','{"execution_id":"00000000-0000-4000-8000-000000000099"}',false),
 ('occurrence_revision_changed','{"revision":1}',false),
 ('snapshot_null','{"prescription_snapshot":null}',false),
 ('missing_id','{"id":null}',false)
), checks AS (SELECT name,expected,EXISTS(SELECT 1 FROM jsonb_populate_record(null::public.training_session_occurrences_v1,original) occ, jsonb_populate_record(null::public.training_session_occurrences_v1,original||replacement||patch) r
 WHERE r.id='00000000-0000-4000-8000-000000000004'::uuid AND r.id<>occ.id
 AND r.client_id=occ.client_id AND r.session_id=occ.session_id
 AND r.batch_operation_id='00000000-0000-4000-8000-000000000005'::uuid AND r.batch_ordinal=1
 AND r.status='planificada' AND r.execution_id IS NULL AND r.revision=0
 AND r.prescription_revision=occ.prescription_revision
 AND r.prescription_snapshot=occ.prescription_snapshot
 AND r.duration_minutes=occ.duration_minutes) AS actual FROM cases CROSS JOIN base)
 SELECT count(*) AS total,count(*) FILTER(WHERE actual=expected) AS passed, array_agg(name) FILTER(WHERE actual<>expected) AS failures FROM checks;
