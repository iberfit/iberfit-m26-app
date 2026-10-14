import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261014150000_m43_domain_entities_api_read_fence_v3.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/qa-rollbacks/20261014150000_m43_domain_entities_api_read_fence_v3_rollback.sql',import.meta.url),'utf8');
test('M43 canonical Data API must not expose raw private JSON to signed-in Client',()=>{
  assert.match(sql,/REVOKE SELECT ON TABLE public\.domain_entities_v26 FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql,/GRANT|DELETE FROM|DROP TABLE|TRUNCATE|ALTER TABLE/i);
  assert.match(rollback,/GRANT SELECT ON TABLE public\.domain_entities_v26 TO anon, authenticated/);
  assert.doesNotMatch(rollback,/DELETE FROM|DROP TABLE|TRUNCATE|ALTER TABLE/i);
});
test('M43 projection remains available through authenticated role-scoped bootstrap',()=>{
  const backend=readFileSync(new URL('../supabase/migrations/20261014143500_m43_publication_http_privacy_v2.sql',import.meta.url),'utf8');
  assert.match(backend,/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26\(\)/);
  assert.match(backend,/public\.iberfit_current_role_v26\(\) in \('client','cliente'\)/);
  assert.match(backend,/public\.iberfit_m43_client_safe_session_v2/);
  const transport=readFileSync(new URL('../src/m26/supabase-transport.js',import.meta.url),'utf8');
  assert.doesNotMatch(transport,/\/rest\/v1\/domain_entities_v26/);
});
