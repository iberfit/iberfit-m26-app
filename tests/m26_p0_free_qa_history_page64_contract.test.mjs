import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createClientCompletedHistoryPager} from '../src/m26/domain/client-completed-history-pager.js';
import {createClientCompletedHistoryLoader} from '../src/m26/domain/client-completed-history-loader.js';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const apply=source('../supabase/qa-rollouts/p0_free_qa_history_page64_v1.sql');
const undo=source('../supabase/qa-rollbacks/p0_free_qa_history_page64_v1.rollback.sql');
test('QA-only exact source/ACL with safe inverse; no customer data writes',()=>{
 for(const s of [apply,undo]){
  assert.match(s,/IS DISTINCT FROM 'QA'/u);assert.match(s,/proacl/u);
  assert.match(s,/pg_get_functiondef/u);
  assert.doesNotMatch(s,/DELETE\s+FROM|TRUNCATE|GRANT\s+|REVOKE\s+|INSERT\s+INTO|UPDATE\s+public\.|pjhmrhejsoofmouedavw/iu);
 }
 for(const h of ['ae01c1771319b99f0404612a4b84fd2a','88220acc54e26bb1ee91332d9b89a3b3','0813cbe612bf24b2f08f99bf42a96662','a254291ca0e199d176b10aefa8b2fd61','25c8ff090b162f23fd818d12e8eb9843','a71e8ccd806ae1e783799cc1a6e2efce']){
  assert.ok(apply.includes(h)); assert.ok(undo.includes(h));
 }
 assert.match(apply,/p_limit NOT BETWEEN 1 AND 64/u);
 assert.match(undo,/p_limit NOT BETWEEN 1 AND 32/u);
});
test('pager expands safely to 64 and rejects 65, preserving owner context',()=>{
 const owner={},clientId='12345678-1234-4123-8123-123456789012';
 const p=createClientCompletedHistoryPager({owner,clientId,section:'session',limit:64});
 assert.equal(p.nextRequest({requestOwner:owner}).p_limit,64);
 assert.throws(()=>p.nextRequest({requestOwner:{}}),/OWNER_STALE/u);
 assert.throws(()=>createClientCompletedHistoryPager({owner,clientId,section:'session',limit:65}),/LIMIT_INVALID/u);
});
test('two complete 129/130 item sections require 6, not 10, page calls without loss',async()=>{
 const owner={},id='12345678-1234-4123-8123-123456789012';
 const guid=i=>'12345678-1234-4123-8123-'+i.toString(16).padStart(12,'0');
 const rows=t=>Array.from({length:t==='session'?129:130},(_,i)=>({
  entityType:t,entityId:guid(i+1),clientId:id,status:'completado',revision:1,
  updatedAt:new Date(Date.UTC(2026,10,1,12,0,0)-i*1000).toISOString(),body:{id:guid(i+1),clientId:id}
 }));
 const all={session:rows('session'),session_execution:rows('session_execution')};
 let calls=0;
 const transport={clientCompletedHistoryPage:async(_token,q)=>{
  ++calls;const data=all[q.p_section];
  const start=q.p_cursor?data.findIndex(x=>x.entityId===q.p_cursor.id)+1:0;
  const page=data.slice(start,start+q.p_limit);
  const more=start+page.length<data.length;
  return {schema:'iberfit.client.completed-history.page.qa.v1',section:q.p_section,
   snapshotAt:'2026-11-01T13:00:00Z',total:data.length,fingerprint:'f'.repeat(32),
   rows:page,hasMore:more,nextCursor:more?{at:page.at(-1).updatedAt,id:page.at(-1).entityId}:null};
 }};
 const loader=createClientCompletedHistoryLoader({transport,getToken:async()=> 'synthetic',
  getOwner:()=>owner,getClientId:()=>id});
 const complete=await loader.load({owner,clientId:id,sections:['session','session_execution'],limit:64});
 assert.equal(calls,6);assert.equal(complete.session.length,129);assert.equal(complete.session_execution.length,130);
 assert.equal(new Set(complete.session_execution.map(x=>x.entityId)).size,130);
});
