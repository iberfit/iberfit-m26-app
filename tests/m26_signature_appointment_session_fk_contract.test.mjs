import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../supabase/migrations/20261021013000_signature_appointment_session_same_client_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/rollbacks/20261021013000_signature_appointment_session_same_client_v1.rollback.sql',import.meta.url),'utf8');

test('SIGNATURE appointment ↔ session enforces same Client at the database boundary',()=>{
  assert.doesNotMatch(migration,/DO \$|RAISE EXCEPTION/u,'No anonymous SQL block can bypass deployment safety policy');
  assert.match(migration,/UNIQUE \(id, client_id\)/u);
  assert.match(migration,/FOREIGN KEY \(session_id, client_id\)\s+REFERENCES public\.sessions \(id, client_id\)/u);
  assert.match(migration,/NOT VALID\s*;[\s\S]*VALIDATE CONSTRAINT appointments_session_client_signature_v1_fkey/u);
});

test('SIGNATURE appointments may retain dates if their linked session is deleted',()=>{
  assert.match(migration,/ON DELETE SET NULL \(session_id\)/u);
  assert.match(migration,/MATCH SIMPLE/u);
  assert.doesNotMatch(migration,/ON DELETE CASCADE|ON DELETE SET NULL\s*(?:;|$)/u);
  assert.doesNotMatch(migration,/ALTER TABLE public\.appointments\s+DROP CONSTRAINT appointments_session_id_fkey/u);
});

test('SIGNATURE migration is additive; does not rewrite or erase client data',()=>{
  assert.doesNotMatch(migration,/\b(?:UPDATE\s+public\.|DELETE\s+FROM\s+public\.|TRUNCATE\s+public\.|INSERT\s+INTO\s+public\.|DROP\s+TABLE|DROP\s+COLUMN)/iu);
  assert.match(rollback,/DROP CONSTRAINT IF EXISTS appointments_session_client_signature_v1_fkey/u);
  assert.match(rollback,/DROP CONSTRAINT IF EXISTS sessions_id_client_id_signature_v1_key/u);
  assert.doesNotMatch(rollback,/\b(?:TRUNCATE|DELETE FROM|UPDATE|DROP TABLE|DROP COLUMN)\b/iu);
});
