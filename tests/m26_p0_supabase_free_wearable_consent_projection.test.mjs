import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync('supabase/qa-migrations/20261030211000_supabase_free_bounded_consent_bootstrap_qa.sql','utf8');
const rollback=readFileSync('supabase/qa-rollbacks/20261030211000_supabase_free_bounded_consent_bootstrap_qa.rollback.sql','utf8');
const state=readFileSync('src/m26/production-state.js','utf8');
test('QA only, invoker, original authenticated RLS gate, no destructive SQL',()=>{
 assert.match(migration,/IS DISTINCT FROM 'QA'/u);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.m26_wearable_bootstrap_v44\(\)/u);
 assert.match(migration,/LANGUAGE sql/u);
 assert.match(migration,/STABLE/u);
 assert.match(migration,/SET search_path TO ''/u);
 assert.match(migration,/where auth\.uid\(\) is not null/u);
 assert.doesNotMatch(migration,/SECURITY DEFINER|BYPASSRLS/iu);
 assert.doesNotMatch(migration,/\b(TRUNCATE|DROP|DELETE|UPDATE|INSERT)\b/iu);
});
test('return newest three records per owner and provider with original consent fields',()=>{
 assert.match(migration,/partition by client_id,provider/u);
 assert.match(migration,/order by created_at desc,id desc/u);
 assert.match(migration,/where consent_rank <= 3/u);
 for(const key of ["'id'","'clientId'","'provider'","'action'","'scopes'","'createdAt'"])assert.ok(migration.includes(key));
});
test('other wearable sections, rollback and transport remain unchanged',()=>{
 for(const v of ["'connections'","'dailySummaries'","'consents'","m26_wearable_connections_v44","m26_wearable_daily_summaries_v44","where auth.uid() is not null"]){assert.ok(migration.includes(v));assert.ok(rollback.includes(v));}
 assert.doesNotMatch(rollback,/consent_rank/u);
 assert.match(rollback,/IS DISTINCT FROM 'QA'/u);
});
test('UI state does not store or consume complete wearable consent audit history',()=>{
 const keys=state.slice(state.indexOf('M26_COLLECTION_KEYS'),state.indexOf('const FORBIDDEN_SYNTHETIC'));
 assert.ok(keys.includes("'wearableConnections'"));
 assert.ok(keys.includes("'wearableDailySummaries'"));
 assert.ok(!keys.includes("'wearableConsents'"));
});
