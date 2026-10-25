-- U33 is a read-only STAGING helper with no persisted command receipts.
-- Dropping its private function cannot delete a single calendar row.
BEGIN;
SET LOCAL lock_timeout='1500ms';
DROP FUNCTION private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,integer);
COMMIT;
