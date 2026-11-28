-- Candidate rollback: RESTRICT prevents removal while any dependent object exists.
BEGIN;
SET LOCAL lock_timeout='3s';
DROP FUNCTION private.m26_gx_connected360_report_observations_v1(uuid,uuid,text,uuid,bigint,date,date) RESTRICT;
DROP FUNCTION private.m26_gx_connected360_report_observations_snapshot_v1(uuid,uuid,text,uuid,bigint,date,date) RESTRICT;
COMMIT;
