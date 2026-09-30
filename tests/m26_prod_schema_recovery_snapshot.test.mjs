import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  evaluateSchemaRecoverySnapshot,
  extractSchemaRecoverySnapshot,
} from '../scripts/data-safety/check_prod_schema_recovery_snapshot.mjs';

const NOW = Date.parse('2026-09-30T21:00:00.000Z');

function sampleSnapshot(capturedAt='2026-09-30T20:55:00.000Z') {
  const relations=Array.from({length:60},(_,i)=>({schema:'public',name:`t_${i}`,kind:'r',owner:'postgres',rowSecurity:true,forceRowSecurity:false,acl:[]}));
  const relationColumns=Array.from({length:120},(_,i)=>({schema:'public',relation:`t_${i%60}`,kind:'r',column:`c_${i}`,ordinal:(i%5)+1,type:'text',notNull:false,default:null,identity:'',generated:''}));
  const routines=Array.from({length:25},(_,i)=>({schema:'public',identity:`f_${i}()`,kind:'f',owner:'postgres',acl:[],definition:`CREATE OR REPLACE FUNCTION public.f_${i}() RETURNS integer LANGUAGE sql AS $$ SELECT ${i}; $$`}));
  const constraints=Array.from({length:55},(_,i)=>({schema:'public',relation:`t_${i%60}`,name:`c_${i}`,type:'c',definition:'CHECK (true)'}));
  const indexes=Array.from({length:25},(_,i)=>({schema:'public',relation:`t_${i%60}`,name:`i_${i}`,definition:`CREATE INDEX i_${i} ON public.t_${i%60} USING btree (c_0)`}));
  return {
    schema:'iberfit.prod.schema-recovery.v1',
    capturedAt,
    database:'postgres',
    serverVersionNum:'170006',
    relations,
    relationColumns,
    routines,
    triggers:[],
    policies:[],
    constraints,
    indexes,
    views:[],
    types:[],
  };
}

function apiPayload(snapshot=sampleSnapshot()) { return [{snapshot}]; }

test('accepts a fresh complete logical schema snapshot',()=>{
  const result=evaluateSchemaRecoverySnapshot(apiPayload(),{nowMs:NOW,projectRef:'prod-ref'});
  assert.equal(result.ok,true);
  assert.equal(result.mode,'LOGICAL_SCHEMA_SNAPSHOT');
  assert.equal(result.projectRef,'prod-ref');
  assert.equal(result.counts.relationColumns,120);
  assert.match(result.sha256,/^[0-9a-f]{64}$/u);
  assert.ok(result.bytes>10_000);
});

test('accepts supported Management API response wrappers and JSON snapshot strings',()=>{
  const snapshot=sampleSnapshot();
  assert.equal(extractSchemaRecoverySnapshot({result:[{snapshot}]}).schema,snapshot.schema);
  assert.equal(extractSchemaRecoverySnapshot({data:[{snapshot:JSON.stringify(snapshot)}]}).schema,snapshot.schema);
  assert.equal(extractSchemaRecoverySnapshot({snapshot}).schema,snapshot.schema);
});

test('rejects stale and implausibly future snapshots',()=>{
  assert.throws(
    ()=>evaluateSchemaRecoverySnapshot(apiPayload(sampleSnapshot('2026-09-30T20:20:00.000Z')),{nowMs:NOW}),
    /PROD_SCHEMA_SNAPSHOT_TOO_OLD/u,
  );
  assert.throws(
    ()=>evaluateSchemaRecoverySnapshot(apiPayload(sampleSnapshot('2026-09-30T21:02:00.000Z')),{nowMs:NOW}),
    /PROD_SCHEMA_SNAPSHOT_TIMESTAMP_IN_FUTURE/u,
  );
});

test('rejects truncated or malformed snapshots fail closed',()=>{
  const truncated=sampleSnapshot();
  truncated.routines=truncated.routines.slice(0,5);
  assert.throws(()=>evaluateSchemaRecoverySnapshot(apiPayload(truncated),{nowMs:NOW}),/PROD_SCHEMA_SNAPSHOT_TRUNCATED:routines/u);

  const malformed=sampleSnapshot();
  malformed.relationColumns[0].type='';
  assert.throws(()=>evaluateSchemaRecoverySnapshot(apiPayload(malformed),{nowMs:NOW}),/PROD_SCHEMA_SNAPSHOT_COLUMN_FIELD_INVALID:type/u);
});

test('snapshot SQL reads only catalogs and never application rows',()=>{
  const sql=fs.readFileSync('scripts/data-safety/prod_schema_recovery_snapshot.sql','utf8').replace(/\r\n/g,'\n');
  assert.doesNotMatch(sql,/\bfrom\s+(?:public|private)\./iu);
  assert.doesNotMatch(sql,/\bauth\.users\b/iu);
  assert.doesNotMatch(sql,/\bselect\s+\*/iu);
  assert.doesNotMatch(sql,/\b(insert|update|delete|truncate)\b/iu);
  assert.match(sql,/pg_catalog\.pg_class/u);
  assert.match(sql,/pg_catalog\.pg_proc/u);
  assert.match(sql,/pg_catalog\.pg_constraint/u);
  assert.match(sql,/iberfit\.prod\.schema-recovery\.v1/u);
});
