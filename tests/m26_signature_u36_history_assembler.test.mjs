import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivilegedHistoryAssembler} from '../src/m26/domain/privileged-history-assembler.js';
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
const e1='20000000-0000-4000-8000-000000000001',e2='20000000-0000-4000-8000-000000000002';
const core=()=>({
 user:{id:'coach-1',role:'coach'},remoteRevisions:{['session:'+e1]:2,['session_execution:'+e2]:3},
 data:{clients:[{id:a},{id:b}],m26Entities:[],domainEvents:[],sessionExecutions:[],
  checkins:[{id:'keep'}],reports:[{id:'still-here'}]},
 canary:{active:true},environment:'QA',
});
const entry=(section,cid,i)=>section==='m26Entities'
 ?{clientId:cid,entityType:i===2?'session_execution':'session',entityId:i===2?e2:e1,
   revision:i===2?3:2,body:{value:i},updatedAt:'2026-10-21T12:00:00.000Z'}
 :section==='domainEvents'
 ?{client_id:cid,id:i,created_at:'2026-10-21T12:00:00.000Z'}
 :{client_id:cid,id:i===2?e2:e1,updated_at:'2026-10-21T12:00:00.000Z'};
const schema='iberfit.u35.privileged-history-page.qa.v1';
const firstRequest={cursor:null,snapshotAt:null,expectedCount:null};
function page(section,cid,records,{more=false,total=records.length,cursor=null}={}){
 const revisions={};
 if(section==='m26Entities')for(const r of records)revisions[r.entityType+':'+r.entityId]=r.revision;
 return {schema,section,snapshotAt:'2026-10-21T13:00:00.000Z',
   totalCount:total,hasMore:more,nextCursor:cursor,records,remoteRevisions:revisions};
}
function enter(asm,owner,cid,section,records){
 return asm.accept({owner,clientId:cid,section,request:firstRequest,page:page(section,cid,records)});
}
test('U36 reassembles all scoped sections, preserving unrelated data and CAS map',()=>{
 const owner={},snapshot=core(),assembler=createPrivilegedHistoryAssembler(snapshot,{owner});
 for(const clientId of [a,b])for(const section of ['m26Entities','domainEvents','sessionExecutions']){
   const records=clientId===a&&section==='m26Entities'?[entry(section,clientId,1)]:[];
   enter(assembler,owner,clientId,section,records);
 }
 assert.deepEqual(assembler.status(),{expected:6,complete:6,records:1,ready:true});
 const final=assembler.finish({owner});
 assert.equal(final.data.m26Entities.length,1);
 assert.deepEqual(final.data.checkins,snapshot.data.checkins);
 assert.deepEqual(final.data.reports,snapshot.data.reports);
 assert.deepEqual(final.remoteRevisions,snapshot.remoteRevisions);
 assert.equal(snapshot.data.m26Entities.length,0,'original core must not mutate');
 assert.throws(()=>assembler.finish({owner}),/U36_HISTORY_OWNER_STALE/);
});
test('U36 enforces owner lease, client scope, role and non-light core',()=>{
 const owner={},assembler=createPrivilegedHistoryAssembler(core(),{owner});
 assert.throws(()=>enter(assembler,{},a,'domainEvents',[]),/OWNER_STALE/);
 assert.throws(()=>enter(assembler,owner,'foreign','domainEvents',[]),/CLIENT_NOT_IN_BOOTSTRAP/);
 assert.throws(()=>createPrivilegedHistoryAssembler({...core(),user:{role:'client'}},{owner}),/PRIVILEGED_ROLE/);
 const bad=core();bad.data.domainEvents=[{id:'unexpected'}];
 assert.throws(()=>createPrivilegedHistoryAssembler(bad,{owner}),/CORE_MUST_BE_LIGHT/);
});
test('U36 rejects duplicate or cross-client rows without returning a partial snapshot',()=>{
 const owner={},assembler=createPrivilegedHistoryAssembler(core(),{owner});
 assert.throws(()=>enter(assembler,owner,a,'domainEvents',[entry('domainEvents',b,1)]),/CROSS_CLIENT_RECORD/);
 assert.throws(()=>enter(assembler,owner,a,'domainEvents',[entry('domainEvents',a,1),entry('domainEvents',a,1)]),/DUPLICATE_RECORD/);
 assert.equal(assembler.status().records,0);
 assert.throws(()=>assembler.finish({owner}),/HISTORY_NOT_COMPLETE/);
});
test('U36 allows ordered cursor pages and rejects replay/drift',()=>{
 const owner={},assembler=createPrivilegedHistoryAssembler(core(),{owner,limit:1});
 const cursor={at:'2026-10-21T12:00:00.000Z',id:'2'};
 const first=assembler.accept({owner,clientId:a,section:'domainEvents',
   request:firstRequest,page:page('domainEvents',a,[entry('domainEvents',a,2)],{more:true,total:2,cursor})});
 assert.deepEqual(first.nextRequest,{snapshotAt:'2026-10-21T13:00:00.000Z',cursor,expectedCount:2});
 assert.throws(()=>assembler.accept({owner,clientId:a,section:'domainEvents',request:firstRequest,
    page:page('domainEvents',a,[entry('domainEvents',a,1)],{total:2})}),/REQUEST_OUT_OF_ORDER/);
 assert.throws(()=>assembler.accept({owner,clientId:a,section:'domainEvents',request:first.nextRequest,
    page:page('domainEvents',a,[entry('domainEvents',a,1)],{total:3})}),/SNAPSHOT_CHANGED/);
 const second=assembler.accept({owner,clientId:a,section:'domainEvents',request:first.nextRequest,
   page:page('domainEvents',a,[entry('domainEvents',a,1)],{total:2})});
 assert.equal(second.done,true);
 assert.throws(()=>assembler.accept({owner,clientId:a,section:'domainEvents',request:first.nextRequest,
    page:page('domainEvents',a,[]) }),/SECTION_ALREADY_COMPLETE/);
});
test('U36 checks canonical entity revisions against the unchanged core CAS map',()=>{
 const owner={},assembler=createPrivilegedHistoryAssembler(core(),{owner});
 const bad=entry('m26Entities',a,1);bad.revision=9;
 assert.throws(()=>enter(assembler,owner,a,'m26Entities',[bad]),/CANONICAL_REVISION_DRIFT/);
 assert.equal(assembler.status().records,0);
});
test('U36 denies inconsistent continuation / totals and unexpected SQL shape',()=>{
 const owner={},assembler=createPrivilegedHistoryAssembler(core(),{owner});
 assert.throws(()=>assembler.accept({owner,clientId:a,section:'domainEvents',
   request:firstRequest,page:{...page('domainEvents',a,[]),schema:'bad'}}),/PAGE_INVALID/);
 assert.throws(()=>assembler.accept({owner,clientId:a,section:'domainEvents',
   request:firstRequest,page:page('domainEvents',a,[],{total:1})}),/TOTAL_UNDERRUN/);
 assert.throws(()=>assembler.accept({owner,clientId:a,section:'domainEvents',
   request:firstRequest,page:page('domainEvents',a,[],{more:true,total:1,cursor:{id:'1',at:'2026-10-21T12:00:00Z'}})}),/CURSOR_INVALID/);
 assert.equal(assembler.status().records,0);
});
test('U36 does not embed credentials or private values in errors',()=>{
 const owner={},assembler=createPrivilegedHistoryAssembler(core(),{owner});
 let error;
 try{enter(assembler,owner,'private-identifying-id','m26Entities',[]);}
 catch(e){error=e;}
 assert.equal(error?.message,'U36_HISTORY_CLIENT_NOT_IN_BOOTSTRAP');
});


test('U36 rejects bad page ordering and forged next cursor',()=>{
 const owner={},assembler=createPrivilegedHistoryAssembler(core(),{owner});
 const newer=entry('domainEvents',a,2);
 const older={...entry('domainEvents',a,1),created_at:'2026-10-21T11:00:00Z'};
 assert.throws(()=>enter(assembler,owner,a,'domainEvents',[older,newer]),/PAGE_OUT_OF_ORDER/);
 assert.equal(assembler.status().records,0);
 assert.throws(()=>assembler.accept({owner,clientId:a,section:'domainEvents',request:firstRequest,
   page:page('domainEvents',a,[newer],{
     more:true,total:2,cursor:{at:'2026-10-21T12:00:00Z',id:'1'},
   })}),/CURSOR_NOT_LAST_RECORD/);
 assert.equal(assembler.status().records,0);
});

test('U36 rejects numeric event IDs above JS safe integer precision',()=>{
 const owner={},assembler=createPrivilegedHistoryAssembler(core(),{owner});
 assert.throws(()=>enter(assembler,owner,a,'domainEvents',[
   {...entry('domainEvents',a,1),id:9_007_199_254_740_995},
 ]),/INVALID_EVENT_ID/);
});
