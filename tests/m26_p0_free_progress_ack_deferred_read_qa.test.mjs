import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCommandBus,createMemoryOperationRepository} from '../src/m26/command-bus.js';

const client='p0-qa-client',execution='p0-qa-execution';
function setup({windowMs=25,valid=true}={}){
 const owner={id:'qa-only-owner'};
 let current=owner,revision=3;
 const refreshes=[],errors=[],sent=[];
 const bus=createCommandBus({
  repository:createMemoryOperationRepository(),
  getToken:async()=> 'synthetic-test-token',
  getRole:()=> 'client',
  progressAckRefreshWindowMs:windowMs,getRefreshOwner:()=>current,
  rehydrate:async data=>{refreshes.push(data.reason);},
  onPostAckRefreshError:err=>errors.push(String(err?.message)),
  transport:{
   preflight:async()=>({kind:'ack'}),
   execute:async(_jwt,cmd)=>{
    sent.push(cmd);
    return {kind:'ack',operationId:valid?cmd.operationId:'other-operation',
     commandType:cmd.type,entityId:cmd.entityId,clientId:cmd.clientId,
     remoteRevision:++revision};
   },
  },
 });
 const command=(number)=>({
  type:'EJECUCION_GUARDAR_PROGRESO',entityType:'session_execution',
  entityId:execution,clientId:client,baseRevision:number,
  operationId:'qa-progress-'+number,payload:{progressSnapshot:{id:execution,clientId:client,
   status:'active',revision:number,results:[]}},
 });
 return {bus,owner,command,refreshes,errors,sent,setOwner:v=>{current=v;}};
}
const delay=ms=>new Promise(done=>setTimeout(done,ms));

test('QA opt-in coalesces verified progress ACK reads, but does not coalesce writes or CAS revisions',async()=>{
 const p=setup();
 const first=await p.bus.execute(p.command(3),{onAck:()=>{}});
 const second=await p.bus.execute(p.command(4),{onAck:()=>{}});
 assert.equal(first.ok,true);assert.equal(second.ok,true);
 assert.equal(first.refreshDeferred,true);
 assert.equal(second.refreshDeferred,true);
 assert.equal(first.refreshPending,true);
 assert.equal(p.sent.length,2);
 assert.equal(p.bus.confirmedExecutionRevision({id:execution,clientId:client}),5);
 assert.equal(p.refreshes.length,0);
 await delay(65);
 assert.deepEqual(p.refreshes,['ack']);
 assert.deepEqual(p.errors,[]);
 p.bus.dispose();
});
test('false or missing identity on ACK cannot defer a canonical refresh',async()=>{
 const p=setup({valid:false});
 const r=await p.bus.execute(p.command(3),{onAck:()=>{}});
 assert.equal(r.refreshDeferred,false);
 assert.equal(r.refreshOk,true);
 assert.deepEqual(p.refreshes,['ack']);
 p.bus.dispose();
});
test('production/default without opt-in keeps every ACK full read',async()=>{
 const p=setup({windowMs:0});
 const r=await p.bus.execute(p.command(3),{onAck:()=>{}});
 assert.equal(r.refreshDeferred,false);
 assert.deepEqual(p.refreshes,['ack']);
 p.bus.dispose();
});
test('progress without a trusted onAck observer never postpones revalidation',async()=>{
 const p=setup();
 const r=await p.bus.execute(p.command(3));
 assert.equal(r.refreshDeferred,false);
 assert.deepEqual(p.refreshes,['ack']);
 p.bus.dispose();
});
test('QA deferred refresh cannot cross identity switch, nor outlive controller destroy',async()=>{
 const a=setup();
 assert.equal((await a.bus.execute(a.command(3),{onAck:()=>{}})).refreshDeferred,true);
 a.setOwner({id:'different-login'});
 await delay(45);
 assert.deepEqual(a.refreshes,[]);a.bus.dispose();
 const b=setup();
 await b.bus.execute(b.command(3),{onAck:()=>{}});
 b.bus.dispose();
 await delay(45);
 assert.deepEqual(b.refreshes,[]);
});
test('QA rollout is pinned to Client A and fails closed for every PROD runtime',()=>{
 const app=readFileSync('src/m26/app/application.js','utf8');
 const builder=readFileSync('qa/rc64/build-authenticated-surface.mjs','utf8');
 const bus=readFileSync('src/m26/command-bus.js','utf8');
 assert.match(builder,/freeClientProgressAckDeferredQa: true/u);
 assert.match(app,/runtime\.qaOnly===true&&runtime\.canary===true/u);
 assert.match(app,/freeClientProgressAckDeferredQa===true/u);
 assert.match(app,/qa\.rc74\.client-a@iberfit\.cl/u);
 assert.match(app,/commandBus\?\.dispose\?\.\(\)/u);
 assert.match(bus,/String\(response\?\.operationId\|\|''\)===String\(command\?\.operationId\|\|''\)/u);
 assert.match(bus,/Number\.isSafeInteger\(revision\)&&revision>command\.baseRevision/u);
 assert.match(bus,/getRefreshOwner\(\)!==owner/u);
});

test('QA cannot coalesce different training executions even for the same client',async()=>{
 const p=setup({windowMs:25});
 const first=await p.bus.execute(p.command(3),{onAck:()=>{}});
 assert.equal(first.refreshDeferred,true);
 const second=p.command(4);
 second.entityId='p0-other-execution';
 second.payload.progressSnapshot.id='p0-other-execution';
 const ack=await p.bus.execute(second,{onAck:()=>{}});
 assert.equal(ack.refreshDeferred,false,'distinct workout must flush its own read');
 assert.deepEqual(p.refreshes,['ack']);
 await delay(50);
 assert.equal(p.refreshes.length,1,'old deferred read was superseded by full revalidation');
 assert.equal(p.sent.length,2,'both real writes retained');
 p.bus.dispose();
});
test('continuous progress cannot indefinitely postpone the QA authoritative server read',()=>{
 const code=readFileSync('src/m26/command-bus.js','utf8');
 assert.match(code,/firstScheduledAt=existing\\?\\.firstScheduledAt\\?\\?Date\\.now\\(\\)/u);
 assert.match(code,/2\\*refreshWindow-\\(Date\\.now\\(\\)-firstScheduledAt\\)/u);
 assert.match(code,/const delayMs=Math\\.min\\(refreshWindow,maxRemaining\\)/u);
 assert.match(code,/pendingProgressRefresh\\.scope===executionLineage\\(command\\)/u);
});
