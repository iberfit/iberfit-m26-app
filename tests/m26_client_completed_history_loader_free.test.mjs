import test from 'node:test';
import assert from 'node:assert/strict';
import {createClientCompletedHistoryLoader} from '../src/m26/domain/client-completed-history-loader.js';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const row=(type='session')=>({entityType:type,entityId:'00000000-0000-4000-8000-000000000003',
  clientId:id,status:'completada',revision:1,updatedAt:'2026-10-31T02:59:00+00:00',
  body:{id:'00000000-0000-4000-8000-000000000003',clientId:id,status:'completada',blocks:[]}});
const data=(section='session')=>({schema:'iberfit.client.completed-history.page.qa.v1',
 section,snapshotAt:'2026-10-31T03:00:00+00:00',
 total:1,fingerprint:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',rows:[row(section)],hasMore:false,nextCursor:null});
test('one owner, two sections: complete independent snapshots atomically',async()=>{
 const owner={},calls=[];
 const loader=createClientCompletedHistoryLoader({transport:{clientCompletedHistoryPage:async(t,p)=>{
  calls.push(p.p_section);return data(p.p_section);
 }},getToken:async()=> 'token',getOwner:()=>owner,getClientId:()=>id});
 const result=await loader.load({owner,clientId:id,sections:['session','session_execution']});
 assert.equal(result.session.length,1);assert.equal(result.session_execution.length,1);
 assert.deepEqual(calls,['session','session_execution']);
});
test('different owner cannot load or consume an old account',async()=>{
 const owner={};let current=owner,cid=id;
 const loader=createClientCompletedHistoryLoader({transport:{clientCompletedHistoryPage:async()=>data()},
  getToken:async()=> 'token',getOwner:()=>current,getClientId:()=>cid});
 assert.throws(()=>loader.load({owner:{},clientId:id}),/OWNER_STALE/);
 current=owner;cid=other;
 assert.throws(()=>loader.load({owner,clientId:id}),/OWNER_STALE/);
});
test('no phantom success after a failed authenticated RPC',async()=>{
 const owner={},loader=createClientCompletedHistoryLoader({
  transport:{clientCompletedHistoryPage:async()=>{throw Object.assign(new Error('401'),{status:401});}},
  getToken:async()=> 'token',getOwner:()=>owner,getClientId:()=>id});
 await assert.rejects(loader.load({owner,clientId:id}),/401/);
});
test('offline must not send a request or claim an empty complete history',()=>{
 const owner={},loader=createClientCompletedHistoryLoader({
  transport:{clientCompletedHistoryPage:async()=>{throw Error('SHOULD_NOT_FETCH');}},
  getToken:async()=> 'token',getOwner:()=>owner,getClientId:()=>id,isOnline:()=>false});
 assert.throws(()=>loader.load({owner,clientId:id}),/OFFLINE/);
});
test('reject duplicate sections and unbounded pages before networking',()=>{
 const owner={},loader=createClientCompletedHistoryLoader({
  transport:{clientCompletedHistoryPage:async()=>data()},getToken:async()=> 'token',
  getOwner:()=>owner,getClientId:()=>id});
 assert.throws(()=>loader.load({owner,clientId:id,sections:['session','session']}),/ARGUMENTS_INVALID/);
 assert.throws(()=>loader.load({owner,clientId:id,limit:33}),/ARGUMENTS_INVALID/);
});

test('same-owner concurrent requests share one live RPC without parallel Egress',async()=>{
 const owner={};let requests=0,release;
 const gate=new Promise(res=>release=res);
 const loader=createClientCompletedHistoryLoader({transport:{clientCompletedHistoryPage:async()=>{
  requests++;await gate;return data();
 }},getToken:async()=> 'token',getOwner:()=>owner,getClientId:()=>id});
 const a=loader.load({owner,clientId:id});
 const b=loader.load({owner,clientId:id});
 assert.equal(a,b);
 release();
 const out=await Promise.all([a,b]);
 assert.equal(requests,1);assert.equal(out[0].session.length,1);
});
test('logout cancels in-flight request and rejects even a late success',async()=>{
 const owner={},ac=new AbortController();let release;
 const gate=new Promise(res=>release=res);
 const loader=createClientCompletedHistoryLoader({transport:{clientCompletedHistoryPage:async()=>{await gate;return data();}},
 getToken:async()=> 'token',getOwner:()=>owner,getClientId:()=>id});
 const task=loader.load({owner,clientId:id,signal:ac.signal});
 ac.abort();release();
 await assert.rejects(task,/CANCELLED/);
});

test('second history section failure does not publish a partial session or conceal missing results',async()=>{
 const owner={},calls=[];let permitExecution=false;
 const loader=createClientCompletedHistoryLoader({
  transport:{clientCompletedHistoryPage:async(_token,params)=>{
   calls.push(params.p_section);
   if(params.p_section==='session_execution'&&!permitExecution)throw Error('TRANSIENT_401');
   return data(params.p_section);
  }},
  getToken:async()=> 'token',getOwner:()=>owner,getClientId:()=>id,
 });
 await assert.rejects(loader.load({owner,clientId:id,sections:['session','session_execution']}),/TRANSIENT_401/);
 assert.deepEqual(calls,['session','session_execution']);
 permitExecution=true;
 const complete=await loader.load({owner,clientId:id,sections:['session','session_execution']});
 assert.equal(complete.session.length,1);
 assert.equal(complete.session_execution.length,1);
 assert.deepEqual(calls,['session','session_execution','session','session_execution'],
  'retry must rebuild both complete sections rather than accept stale partial pages');
});
test('QA Client must demand both history sections, and navigation alone never downloads either',async()=>{
 const {readFileSync}=await import('node:fs');
 const code=readFileSync('src/m26/app/client-history-demand-controller.js','utf8');
 assert.match(code,/loader\.load\(\{owner,clientId,sections:\['session','session_execution'\],limit:32\}\)/u);
 assert.match(code,/if\(explicit!==true\)\{/u);
 assert.match(code,/maybeLoad\(activeArea\); \/\/ No RPC on navigation/u);
 assert.match(code,/if\(!current\(\)\)return;\s*store\.incorporateClientCompletedHistory/u);
});


test('32-record pages complete both 416-record QA sections in 26 reads without losing one item',async()=>{
 const owner={};
 const sectionData=(section)=>Array.from({length:416},(_,i)=>{
  const index=i+1;
  const uid='00000000-0000-4000-8000-'+(section==='session'?'1':'2')+index.toString(16).padStart(11,'0');
  const updatedAt=new Date(Date.parse('2026-11-01T12:00:00Z')-(i+1)*1000).toISOString();
  return {entityType:section,entityId:uid,clientId:id,status:'completada',revision:1,
   updatedAt,body:{id:uid,clientId:id,status:'completada',results:[],blocks:[]}};
 });
 const sections={session:sectionData('session'),session_execution:sectionData('session_execution')};
 const calls=[];
 const transport={clientCompletedHistoryPage:async(_token,req)=>{
  assert.equal(req.p_limit,32);
  const items=sections[req.p_section],cursor=req.p_cursor;
  const start=cursor?items.findIndex(item=>item.entityId===cursor.id)+1:0;
  assert.ok(start>=0);
  if(start)assert.equal(cursor.at,items[start-1].updatedAt);
  const rows=items.slice(start,start+req.p_limit);
  const hasMore=start+rows.length<items.length;
  calls.push({section:req.p_section,limit:req.p_limit,first:start,rows:rows.length});
  return {schema:'iberfit.client.completed-history.page.qa.v1',section:req.p_section,
   snapshotAt:'2026-11-01T12:00:00Z',total:items.length,
   fingerprint:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',rows,hasMore,
   nextCursor:hasMore?{at:rows.at(-1).updatedAt,id:rows.at(-1).entityId}:null};
 }};
 const loader=createClientCompletedHistoryLoader({transport,getToken:async()=> 'token',getOwner:()=>owner,getClientId:()=>id});
 const result=await loader.load({owner,clientId:id,sections:['session','session_execution'],limit:32});
 assert.equal(result.session.length,416);
 assert.equal(result.session_execution.length,416);
 assert.equal(new Set(result.session.map(x=>x.entityId)).size,416);
 assert.equal(new Set(result.session_execution.map(x=>x.entityId)).size,416);
 assert.equal(calls.length,26);
 for(const section of ['session','session_execution']){
  const matching=calls.filter(x=>x.section===section);
  assert.equal(matching.length,13);
  assert.deepEqual(matching.map(x=>x.rows),Array(13).fill(32));
  assert.deepEqual(matching.map(x=>x.first),Array.from({length:13},(_,i)=>i*32));
 }
});
