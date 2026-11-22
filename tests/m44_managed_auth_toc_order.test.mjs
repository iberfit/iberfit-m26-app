import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orderM44ManagedDataRestore} from '../scripts/ops/m44_managed_auth_toc_order.mjs';

const hdr=Array.from({length:45},(_,i)=>'; Header '+i);
const record=(n,schema,table)=>n+'; 0 0 TABLE DATA '+schema+' '+table+' postgres';

test('Managed nondeferrable Auth FK data order is users before identities and MFA',()=>{
 const source=[...hdr,record(10,'auth','identities'),record(11,'public','clients'),
  record(12,'auth','mfa_factors'),record(13,'private','m26_iri_drafts_v1'),record(14,'auth','users'),
  '15; 0 0 CONSTRAINT public clients clients_auth_id_fkey postgres'];
 const r=orderM44ManagedDataRestore(source);
 assert.equal(r.lines.length,source.length);
 assert.equal(r.authTableCount,3);
 assert.equal(r.authUsersBeforeDependencies,true);
 const selected=r.lines.filter(x=>x.includes('TABLE DATA '));
 assert.deepEqual(selected.map(x=>x.split('TABLE DATA ')[1].split(' postgres')[0]),[
  'auth users','auth identities','auth mfa_factors','public clients','private m26_iri_drafts_v1'
 ]);
 assert.equal(r.lines[r.lines.length-1],source[source.length-1]);
});
test('M44 restore changes ONLY ordering, not archive selection, predata or postdata',()=>{
 const source=[...hdr,'3; 0 0 TABLE public clients postgres','4; 0 0 TABLE private drafts postgres',
  record(20,'public','clients'),';21; 0 0 TABLE DATA auth sessions postgres',
  record(22,'auth','identities'),record(23,'auth','users'),record(24,'public','appointments'),
  '25; 0 0 FK CONSTRAINT public clients clients_auth_id_fkey postgres'];
 const r=orderM44ManagedDataRestore(source);
 assert.deepEqual([...r.lines].sort(),[...source].sort());
 assert.deepEqual(r.lines.slice(0,47),source.slice(0,47));
 assert.equal(r.lines.at(-1),source.at(-1));
 assert.ok(r.lines.indexOf(record(23,'auth','users'))<r.lines.indexOf(record(22,'auth','identities')));
 assert.ok(r.lines.indexOf(record(22,'auth','identities'))<r.lines.indexOf(record(20,'public','clients')));
 assert.ok(r.lines.includes(';21; 0 0 TABLE DATA auth sessions postgres'));
});
test('M44 rejects unknown or duplicate auth.users and absent app data',()=>{
 const invalid=[
  [...hdr,record(11,'public','clients'),record(12,'auth','identities')],
  [...hdr,record(11,'public','clients'),record(12,'auth','users'),record(13,'auth','users')],
  [...hdr,record(12,'auth','users'),record(13,'auth','identities')],
  [...hdr,record(11,'public','clients'),record(12,'auth','users'),record(13,'auth','identities'),record(14,'auth','identities')],
 ];
 for(const toc of invalid)assert.throws(()=>orderM44ManagedDataRestore(toc),/M44_/);
});
test('One-table authenticated empty identity set still reorders auth.users ahead of application data',()=>{
 const source=[...hdr,record(2,'public','workouts'),record(3,'auth','users')];
 const result=orderM44ManagedDataRestore(source);
 assert.deepEqual(result.lines.slice(-2),[record(3,'auth','users'),record(2,'public','workouts')]);
});
test('Real recovery uses ordered TOC with an atomic pg_restore and never disables foreign keys',()=>{
 const code=readFileSync('scripts/ops/m44_managed_real_recovery.mjs','utf8');
 assert.match(code,/orderM44ManagedDataRestore\(out\)/);
 assert.match(code,/ordered\.lines\.join\('\\n'\)/);
 assert.match(code,/--single-transaction/);
 assert.match(code,/--exit-on-error/);
 assert.doesNotMatch(code,/--disable-triggers/);
 assert.doesNotMatch(code,/SET\s+session_replication_role\s*=\s*replica/i);
 assert.doesNotMatch(code,/ALTER\s+TABLE\s+.*DISABLE\s+TRIGGER/i);
});
