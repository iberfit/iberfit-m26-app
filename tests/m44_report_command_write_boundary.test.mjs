import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('M44 direct report writes are forbidden to browser roles after backend domain is ready',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20261015143000_m44_report_command_only_write_boundary_v1.sql',import.meta.url),'utf8');
  assert.match(sql,/M44_REPORT_WRITE_BOUNDARY_PREREQUISITES_MISSING/);
  assert.match(sql,/revoke insert, update, delete on table public\.reports from public, anon, authenticated/);
  assert.match(sql,/has_table_privilege\('authenticated','public\.reports','INSERT'\)/);
  assert.match(sql,/has_table_privilege\('authenticated','public\.reports','UPDATE'\)/);
  assert.match(sql,/has_table_privilege\('authenticated','public\.reports','DELETE'\)/);
  assert.match(sql,/has_table_privilege\('authenticated','public\.reports','SELECT'\)/);
});
