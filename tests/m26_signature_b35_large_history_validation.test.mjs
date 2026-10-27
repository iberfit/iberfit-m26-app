import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPrivilegedHistoryAssembler} from '../src/m26/domain/privileged-history-assembler.js';

const clientId='10000000-0000-4000-8000-000000000001';
const date='2026-10-27T14:00:00.000Z';
const schema='iberfit.u35.privileged-history-page.qa.v1';
const sections=['m26Entities','domainEvents','sessionExecutions'];
const core=()=>({environment:'QA',user:{role:'coach'},remoteRevisions:{},data:{
  clients:[{id:clientId}],m26Entities:[],domainEvents:[],sessionExecutions:[],
}});
const request={snapshotAt:null,cursor:null,expectedCount:null};
function page(section,records,extra={}){
  return {schema,section,snapshotAt:date,records,totalCount:records.length,
    hasMore:false,nextCursor:null,remoteRevisions:{},...extra};
}
const events=n=>Array.from({length:n},(_,i)=>({id:i+1,client_id:clientId,created_at:date}));
const assembler=()=>createPrivilegedHistoryAssembler(core(),{owner:OWNER,profile:'u38-qa-adaptive'});
const OWNER={};

test('B35 max page of 512 events is accepted unchanged, sorted and atomically published',()=>{
  const store=assembler();
  for(const section of sections){
    const rows=section==='domainEvents'?events(512):[];
    store.accept({owner:OWNER,clientId,section,request,page:page(section,rows)});
  }
  const status=store.status();
  assert.equal(status.ready,true);
  assert.equal(status.records,512);
  const result=store.finish({owner:OWNER});
  assert.equal(result.data.domainEvents.length,512);
  assert.equal(String(result.data.domainEvents[0].id),'512');
  assert.equal(String(result.data.domainEvents.at(-1).id),'1');
  assert.deepEqual(result.data.m26Entities,[]);
  assert.deepEqual(result.data.sessionExecutions,[]);
  assert.throws(()=>store.finish({owner:OWNER}),/U36_HISTORY_OWNER_STALE_OR_ALREADY_COMPLETE/);
});

test('B35 duplicate on the same 512-item page remains fail-closed',()=>{
  const store=assembler(),records=events(512);
  records[511]={...records[0]};
  assert.throws(()=>store.accept({owner:OWNER,clientId,section:'domainEvents',request,page:page('domainEvents',records)}),/U36_HISTORY_DUPLICATE_RECORD/);
  assert.equal(store.status().records,0,'no partial record publication');
});

test('B35 reversed timestamp order is rejected before a page is committed',()=>{
  const store=assembler(),records=events(2);
  records[0].created_at='2026-10-27T13:00:00.000Z';
  assert.throws(()=>store.accept({owner:OWNER,clientId,section:'domainEvents',request,page:page('domainEvents',records)}),/U36_HISTORY_PAGE_OUT_OF_ORDER/);
  assert.equal(store.status().records,0);
});

test('B35 duplicate across consecutive pages is rejected even with valid pinned snapshot',()=>{
  const store=assembler();
  const records=events(512);
  const cursor={at:date,id:'512'};
  store.accept({owner:OWNER,clientId,section:'domainEvents',request,page:page('domainEvents',records,{totalCount:513,hasMore:true,nextCursor:cursor})});
  assert.throws(()=>store.accept({
    owner:OWNER,clientId,section:'domainEvents',
    request:{snapshotAt:date,cursor,expectedCount:513},
    page:page('domainEvents',[records[0]],{totalCount:513}),
  }),/U36_HISTORY_DUPLICATE_RECORD/);
  assert.equal(store.status().ready,false);
});

test('B35 duplicate checking uses a per-page set rather than quadratic includes and retains all CAS checks',()=>{
  const s=readFileSync(new URL('../src/m26/domain/privileged-history-assembler.js',import.meta.url),'utf8');
  assert.match(s,/const pageKeys=new Set\(\)/);
  assert.match(s,/if\(seen\.has\(key\)\|\|pageKeys\.has\(key\)\)failure\('DUPLICATE_RECORD'\)/);
  assert.doesNotMatch(s,/keys\.includes\(key\)/);
  assert.match(s,/if\(timestamp>previousTimestamp\)failure\('PAGE_OUT_OF_ORDER'\)/);
  assert.match(s,/CANONICAL_REVISION_DRIFT/);
  assert.match(s,/SNAPSHOT_CHANGED/);
  assert.match(s,/CROSS_CLIENT_RECORD/);
  assert.match(s,/REQUEST_OUT_OF_ORDER/);
});
