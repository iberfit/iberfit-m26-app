import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivilegedHistoryAssembler,__u36HistoryInternals} from '../src/m26/domain/privileged-history-assembler.js';

const CLIENT='10000000-0000-4000-8000-000000000001';
const AT='2026-10-21T12:00:00.000Z';
const SNAP='2026-10-21T13:00:00.000Z';
const SCHEMA='iberfit.u35.privileged-history-page.qa.v1';
const limits={m26Entities:256,domainEvents:512,sessionExecutions:64};
const uuid=(n)=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const core=()=>({
 environment:'QA',user:{id:'qa-coach',role:'coach'},
 data:{clients:[{id:CLIENT}],m26Entities:[],domainEvents:[],sessionExecutions:[],
  checkins:[{persist:'yes'}]},
 remoteRevisions:{},
});
const row=(type,n,body={})=>type==='m26Entities'
  ?{clientId:CLIENT,entityType:'session',entityId:uuid(n),revision:1,updatedAt:AT,body}
  :type==='domainEvents'
    ?{client_id:CLIENT,id:n,created_at:AT,body}
    :{client_id:CLIENT,id:uuid(n),updated_at:AT,body};
const page=(section,records,other={})=>({
 schema:SCHEMA,section,snapshotAt:SNAP,totalCount:records.length,
 hasMore:false,nextCursor:null,records,
 remoteRevisions:Object.fromEntries(records.filter(x=>x.entityType)
   .map(x=>[x.entityType+':'+x.entityId,x.revision])),...other,
});
const req={cursor:null,snapshotAt:null,expectedCount:null};
const send=(asm,owner,section,records,other)=>asm.accept({
 owner,clientId:CLIENT,section,request:req,page:page(section,records,other)
});
const assembler=(snapshot,owner={})=>createPrivilegedHistoryAssembler(snapshot,{owner,profile:'u38-qa-adaptive'});

test('U38 sections have separate maximum rows without changing baseline standard limit',()=>{
 assert.deepEqual(__u36HistoryInternals.U38_QA_PAGE_LIMITS,limits);
 for(const [section,cap] of Object.entries(limits)){
   const owner={},c=core();
   const rows=Array.from({length:cap},(_,i)=>row(section,cap-i));
   if(section==='m26Entities')for(const r of rows)c.remoteRevisions[r.entityType+':'+r.entityId]=r.revision;
   const asm=assembler(c,owner);
   assert.equal(send(asm,owner,section,rows).done,true,section);
   assert.equal(asm.status().records,cap);
   const tooMany=Array.from({length:cap+1},(_,i)=>row(section,cap+1-i));
   const o2={},bad2=assembler(core(),o2);
   assert.throws(()=>send(bad2,o2,section,tooMany),/PAGE_LIMIT_EXCEEDED/,section);
   const standard=createPrivilegedHistoryAssembler(core(),{owner:o2});
   assert.throws(()=>send(standard,o2,section,rows),/PAGE_LIMIT_EXCEEDED/,section);
 }
});
test('U38 rejects oversize bodies without accepting even one partial page',()=>{
 const owner={},c=core(),asm=assembler(c,owner);
 const oversized=row('sessionExecutions',1,{description:'x'.repeat(1_800_010)});
 assert.throws(()=>send(asm,owner,'sessionExecutions',[oversized]),/PAGE_BYTES_EXCEEDED/);
 assert.deepEqual(asm.status(),{expected:3,complete:0,records:0,ready:false});
 assert.throws(()=>asm.finish({owner}),/HISTORY_NOT_COMPLETE/);
});
test('U38 is QA-only and rejects arbitrary profiles or non-privileged identities',()=>{
 const owner={},prod=core();prod.environment='PROD';
 assert.throws(()=>assembler(prod,owner),/QA_PROFILE_OUTSIDE_QA/);
 assert.throws(()=>createPrivilegedHistoryAssembler(core(),{owner,profile:'unknown'}),
  /PROFILE_NOT_ALLOWED/);
 const client=core();client.user.role='cliente';
 assert.throws(()=>assembler(client,owner),/PRIVILEGED_ROLE_REQUIRED/);
});
test('U38 one-client three-section parity and unrelated data after complete, then seals state',()=>{
 const owner={},c=core();c.remoteRevisions['session:'+uuid(1)]=1;
 const asm=assembler(c,owner);
 for(const section of ['m26Entities','domainEvents','sessionExecutions'])
   send(asm,owner,section,[row(section,1)]);
 assert.equal(asm.status().ready,true);
 const full=asm.finish({owner});
 assert.deepEqual(Object.keys(full.data.m26Entities[0]),Object.keys(row('m26Entities',1)));
 assert.deepEqual(full.data.checkins,c.data.checkins);
 assert.deepEqual(full.remoteRevisions,c.remoteRevisions);
 assert.equal(c.data.m26Entities.length,0);
 assert.throws(()=>asm.finish({owner}),/OWNER_STALE_OR_ALREADY_COMPLETE/);
});
test('U38 rejects cross-tenant page content and wrong canonical CAS without committing',()=>{
 const owner={},c=core();c.remoteRevisions['session:'+uuid(1)]=1;
 const asm=assembler(c,owner);
 assert.throws(()=>send(asm,owner,'domainEvents',[{...row('domainEvents',1),client_id:uuid(10)}]),
  /CROSS_CLIENT_RECORD/);
 assert.throws(()=>send(asm,owner,'m26Entities',[{...row('m26Entities',1),revision:5}]),
  /CANONICAL_REVISION_DRIFT/);
 assert.equal(asm.status().records,0);
});
test('U38 SQL source contract uses hard limits, WebAuthn, read-only scope and rollback',async()=>{
 const {readFileSync}=await import('node:fs');
 const sql=readFileSync(new URL('../qa/signature-u38/adaptive-privileged-history-page.qa.sql',import.meta.url),'utf8');
 const rollback=readFileSync(new URL('../qa/signature-u38/rollback-adaptive-history.qa.sql',import.meta.url),'utf8');
 for(const piece of [
   "p_section='m26Entities' and p_limit>256",
   "p_section='domainEvents' and p_limit>512",
   "p_section='sessionExecutions' and p_limit>64",
   "octet_length(v_records::text)>1800000",
   'public.iberfit_require_privileged_assurance_v65d()',
   "v_assurance->>'iberfitAssurance' IS DISTINCT FROM 'verified'",
   'public.iberfit_can_access_client_v26(p_client_id) is not true',
   'U35_HISTORY_SNAPSHOT_CHANGED_RESTART',
   "value#>>'{}' FROM public.iberfit_system_settings",
 ])assert.ok(sql.includes(piece),piece);
 assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role;/u);
 assert.doesNotMatch(sql,/ALTER\s+ROLE|DISABLE\s+ROW\s+LEVEL|DELETE\s+FROM|TRUNCATE/iu);
 assert.match(rollback,/DROP FUNCTION IF EXISTS public\.iberfit_privileged_history_page_u38_qa/iu);
 assert.match(rollback,/DROP FUNCTION IF EXISTS private\.iberfit_history_page_internal_u38_qa/iu);
 assert.doesNotMatch(rollback,/CASCADE/iu);
});
