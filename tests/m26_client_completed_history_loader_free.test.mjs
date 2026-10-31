import test from 'node:test';
import assert from 'node:assert/strict';
import {createClientCompletedHistoryLoader} from '../src/m26/domain/client-completed-history-loader.js';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const row=(type='session')=>({entityType:type,entityId:'00000000-0000-4000-8000-000000000003',
  clientId:id,status:'completada',revision:1,updatedAt:'2026-10-31T02:59:00+00:00',
  body:{id:'00000000-0000-4000-8000-000000000003',clientId:id,status:'completada',blocks:[]}});
const data=(section='session')=>({schema:'iberfit.client.completed-history.page.qa.v1',
 section,snapshotAt:'2026-10-31T03:00:00+00:00',
 total:1,rows:[row(section)],hasMore:false,nextCursor:null});
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
 await assert.rejects(loader.load({owner:{},clientId:id}),/OWNER_STALE/);
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
