import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const get=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const migration=get('../supabase/qa-migrations/20261116204059_p0_free_qa_bootstrap_workmem_4mb_v1.sql');
const rollback=get('../supabase/qa-rollbacks/p0_free_qa_bootstrap_workmem_4mb_v1.rollback.sql');

test('P0 QA bootstrap 4MB is function-local only; no global memory or billing degradation',()=>{
  assert.match(migration,/ALTER FUNCTION public\.iberfit_bootstrap_v26\(\) SET work_mem TO ''4MB''/u);
  assert.match(rollback,/ALTER FUNCTION public\.iberfit_bootstrap_v26\(\) RESET work_mem/u);
  for(const s of [migration,rollback]){
    assert.match(s,/IS DISTINCT FROM 'QA'/u);
    assert.match(s,/pg_get_functiondef\(target\)/u);
    assert.match(s,/proacl/u);
    assert.match(s,/proowner/u);
    assert.match(s,/prosecdef/u);
    assert.match(s,/provolatile/u);
    assert.match(s,/has_function_privilege\('anon',target,'EXECUTE'\)/u);
    assert.doesNotMatch(s,/\bALTER SYSTEM\b|\bALTER ROLE\b|\bALTER DATABASE\b|\bCREATE INDEX\b|\bINSERT INTO\b|\bDELETE FROM\b|\bTRUNCATE\b|\bDROP FUNCTION\b|\bGRANT\b|\bREVOKE\b|pjhmrhejsoofmouedavw/iu);
  }
  assert.match(migration,/free_client_completed_execution_details_demand_qa_v1/u);
});
test('exact source MD5 preconditions and reverse ordering remain mandatory',()=>{
  assert.match(migration,/a71e8ccd806ae1e783799cc1a6e2efce/u);
  assert.match(migration,/9c83765e0a36b0144fde2dca4a0cdcba/u);
  assert.match(rollback,/9c83765e0a36b0144fde2dca4a0cdcba/u);
  assert.match(rollback,/a71e8ccd806ae1e783799cc1a6e2efce/u);
  assert.match(migration,/search_path=""/u);
  assert.match(rollback,/work_mem=4MB/u);
  assert.match(rollback,/BEFORE rolling back P0 QA history page64/u);
});
test('existing history 64-page rollback remains available unchanged',()=>{
  const old=get('../supabase/qa-rollbacks/p0_free_qa_history_page64_v1.rollback.sql');
  assert.match(old,/a71e8ccd806ae1e783799cc1a6e2efce/u);
  assert.match(old,/a254291ca0e199d176b10aefa8b2fd61/u);
});
