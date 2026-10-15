import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('P0: future releases retain the verified least-privilege TRUNCATE revocation',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20261015141500_m44_public_table_truncate_acl_guard.sql',import.meta.url),'utf8');
  assert.match(sql,/revoke truncate on all tables in schema public from anon, authenticated;/i);
  assert.match(sql,/alter default privileges for role postgres in schema public/i);
  assert.match(sql,/has_table_privilege\('anon',c\.oid,'TRUNCATE'\)/);
  assert.match(sql,/has_table_privilege\('authenticated',c\.oid,'TRUNCATE'\)/);
  assert.match(sql,/raise exception 'M44_PUBLIC_TRUNCATE_GRANTS_NOT_REVOKED/);
  assert.doesNotMatch(sql,/\bgrant\s+truncate\b/i);
});
