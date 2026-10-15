import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunicationService} from '../src/m26/communication/service.js';
import {createCommunicationController} from '../src/m26/communication/controller.js';
import {buildNotificationCenter} from '../src/m26/communication/notification-center.js';
import {renderCommunicationRoute} from '../src/m26/communication/route-render.js';

const ids=[
  '95ae4c9e-66d6-4e09-81f6-8515f7990001',
  '95ae4c9e-66d6-4e09-81f6-8515f7990002',
  '95ae4c9e-66d6-4e09-81f6-8515f7990003',
];
function harness({role='coach',unavailable=[],refreshError=false,online=true}={}){
  const sends=[],hydrations=[];
  const service=createCommunicationService({
    transport:{
      async execute(token,command,{application}){
        sends.push({token,command,application});
        if(unavailable.includes(command.entityId))throw Error('network-failed');
        return {ok:true,kind:'ack',operationId:command.operationId};
      },
    },
    getToken:async()=> 'jwt-test',
    getRole:()=>role,
    getState:()=>({available:true,identity:{id:'member'}}),
    isOnline:()=>online,
    refreshState:async(input)=>{hydrations.push(input);if(refreshError)throw Error('stale-client-view');},
  });
  return {service,sends,hydrations};
}

test('M45 grouped UI counts actual unread records, not only group cards',()=>{
  const notifications=ids.map((id)=>({
    id,createdAt:'2026-10-15T17:30:00.000Z',actionArea:'agenda',status:'pending',
    title:'private-not-shown',body:'private detail not shown',
  }));
  const center=buildNotificationCenter({role:'coach',notifications});
  assert.equal(center.items.length,1);
  assert.equal(center.counts.unread,3);
  assert.equal(center.items[0].sourceIds.length,3);
  const html=renderCommunicationRoute({
    communication:true,kind:'communication',role:'coach',
    threads:[],clients:[],canOpenThread:false,coachCockpit:{items:[]},notifications,
  });
  assert.match(html,/3 sin leer/);
  assert.match(html,/Marcar 3 como leídas/);
  assert.equal((html.match(/name="notificationId"/g)||[]).length,3);
  assert.doesNotMatch(html,/private-not-shown|private detail not shown/);
});

test('M45 single group has a single-record action, no hidden bulk mutation',()=>{
  const html=renderCommunicationRoute({
    communication:true,kind:'communication',role:'client',
    threads:[],clients:[],canOpenThread:false,notifications:[
      {id:ids[0],actionArea:'mensajes',status:'pending'},
    ],
  });
  assert.match(html,/Marcar leída/);
  assert.equal((html.match(/name="notificationId"/g)||[]).length,1);
});

test('M45 grouped read authorizes each recipient-scoped command and refreshes only once',async()=>{
  const h=harness();
  const result=await h.service.markNotificationsRead(ids);
  assert.equal(result.ok,true);
  assert.equal(result.markedCount,3);
  assert.equal(result.syncPending,false);
  assert.equal(h.sends.length,3);
  assert.equal(h.hydrations.length,1);
  assert.deepEqual(h.hydrations[0].markedIds,ids);
  assert.ok(h.sends.every(({token,command,application})=>
    token==='jwt-test'&&application==='coach'&&
    command.type==='NOTIFICATION_MARK_READ'&&
    command.payload.notificationId===command.entityId
  ));
  assert.equal(new Set(h.sends.map(x=>x.command.operationId)).size,3);
});

test('M45 partial ACK remains partial and retains exact confirmed IDs',async()=>{
  const h=harness({unavailable:[ids[1]]});
  const result=await h.service.markNotificationsRead(ids);
  assert.equal(result.ok,false);
  assert.equal(result.markedCount,2);
  assert.deepEqual(result.markedIds,[ids[0],ids[2]]);
  assert.equal(h.hydrations.length,1);
});

test('M45 known ACK does not become false failure when hydration fails',async()=>{
  const h=harness({refreshError:true});
  const result=await h.service.markNotificationsRead(ids.slice(0,2));
  assert.equal(result.ok,true);
  assert.equal(result.syncPending,true);
  assert.equal(result.markedCount,2);
  assert.equal(h.hydrations.length,1);
});

test('M45 all failed reads reject, no speculative success nor refresh',async()=>{
  const h=harness({unavailable:ids});
  await assert.rejects(()=>h.service.markNotificationsRead(ids),/network-failed/);
  assert.equal(h.hydrations.length,0);
});

test('M45 invalid input fails closed before any transport call',async()=>{
  for(const input of [
    [],[ids[0],ids[0]],['<script>'],Array(21).fill('95ae4c9e-66d6-4e09-81f6-8515f7990001'),
  ]){
    const h=harness();
    await assert.rejects(()=>h.service.markNotificationsRead(input),/M45_NOTIFICATION_BATCH_INVALID/);
    assert.equal(h.sends.length,0);
  }
  const wrongRole=harness({role:'admin'});
  await assert.rejects(()=>wrongRole.service.markNotificationsRead([ids[0]]),/M26_COMMUNICATION_ROLE_FORBIDDEN/);
  assert.equal(wrongRole.sends.length,0);
  const offline=harness({online:false});
  await assert.rejects(()=>offline.service.markNotificationsRead([ids[0]]),/ONLINE_REQUIRED/);
  assert.equal(offline.sends.length,0);
});

test('M45 grouped form is capped to twenty independent read ids',()=>{
  const notifications=Array.from({length:25},(_,i)=>({
    id:`95ae4c9e-66d6-4e09-81f6-${String(8515_7990_0001+i).padStart(12,'0')}`,
    actionArea:'mensajes',status:'pending',
  }));
  const html=renderCommunicationRoute({
    communication:true,kind:'communication',role:'client',threads:[],clients:[],
    canOpenThread:false,notifications,
  });
  assert.match(html,/25 sin leer/);
  assert.match(html,/Marcar 20 de 25 como leídas/);
  assert.equal((html.match(/name="notificationId"/g)||[]).length,20);
});


test('M45 group-read form dispatches precisely the grouped IDs and redraws once after ACK',async()=>{
  const oldFormData=globalThis.FormData;
  const handlers=new Map(),calls=[];
  const idsForForm=ids.slice(0,2);
  const form={dataset:{communicationForm:'notification-read'},ids:idsForForm};
  globalThis.FormData=class{constructor(target){this.target=target;}getAll(key){return key==='notificationId'?this.target.ids:[];}};
  let redraws=0;
  const root={
    ownerDocument:{defaultView:null},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    addEventListener(key,handler){handlers.set(key,handler);},
    removeEventListener(key){handlers.delete(key);},
  };
  const controller=createCommunicationController({
    root,render(){redraws+=1;},
    service:{
      async markNotificationsRead(payload){
        calls.push([...payload]);
        return {ok:true,markedCount:payload.length,requestedCount:payload.length,syncPending:false};
      },
      webPush:{async status(){return {};}},
    },
  });
  try{
    controller.mount();
    handlers.get('submit')({target:{closest(selector){return selector==='[data-communication-form]'?form:null;}},preventDefault(){}});
    await new Promise((resolve)=>setImmediate(resolve));
    assert.deepEqual(calls,[idsForForm]);
    assert.equal(redraws,1);
  }finally{
    controller.destroy();
    globalThis.FormData=oldFormData;
  }
});


test('M45 read status without timestamp is not reported as unread',()=>{
  const center=buildNotificationCenter({role:'coach',notifications:[
    {id:ids[0],status:'read',actionArea:'agenda',readAt:null},
    {id:ids[1],status:'pending',actionArea:'agenda',readAt:null},
  ]});
  assert.equal(center.items.length,1);
  assert.equal(center.counts.unread,1);
  assert.deepEqual(center.items[0].unreadSourceIds,[ids[1]]);
});


test('M45 grouped notifications limit concurrent backend requests while preserving all acknowledgements',async()=>{
  let active=0,peak=0,remoteCalls=0,hydrations=0;
  const commands=Array.from({length:20},(_,i)=>
    `95ae4c9e-66d6-4e09-81f6-${String(851579900001+i).padStart(12,'0')}`
  );
  const service=createCommunicationService({
    transport:{
      async execute(){
        active+=1;remoteCalls+=1;
        peak=Math.max(peak,active);
        await new Promise((resolve)=>setImmediate(resolve));
        active-=1;
        return {ok:true,kind:'ack'};
      },
    },
    getToken:async()=> 'jwt-test',
    getRole:()=> 'coach',
    getState:()=>({available:true,identity:{id:'member'}}),
    isOnline:()=>true,
    refreshState:async()=>{hydrations++;},
  });
  const result=await service.markNotificationsRead(commands);
  assert.equal(result.ok,true);
  assert.equal(result.markedCount,20);
  assert.equal(remoteCalls,20);
  assert.equal(peak,4,'never overwhelm backend with twenty concurrent mutations');
  assert.equal(hydrations,1,'a single confirmed batch requires only one readback');
  assert.deepEqual(result.markedIds,commands);
});


test('M45 old-account grouped notification receipts skip global hydration for new user',async()=>{
  let user='coach-account-A';
  let release;
  const pending=new Promise((resolve)=>{release=resolve;});
  let refreshes=0;
  const service=createCommunicationService({
    transport:{execute:()=>pending},
    getToken:async()=> 'jwt-account-A',
    getRole:()=> 'coach',
    getState:()=>({available:true,identity:{id:user}}),
    isOnline:()=>true,
    refreshState:async()=>{refreshes++;},
  });
  const resultPromise=service.markNotificationsRead([ids[0]]);
  await Promise.resolve();
  user='coach-account-B';
  release({ok:true,kind:'ack'});
  const result=await resultPromise;
  assert.equal(result.ok,true);
  assert.equal(result.markedCount,1);
  assert.equal(result.syncPending,true);
  assert.equal(refreshes,0,'no stale notification snapshot may hydrate another account');
});


test('M45 actor changed before JWT retrieval aborts batch with no recipient writes',async()=>{
  let identity='coach-A',releaseToken;
  const tokenWait=new Promise((resolve)=>{releaseToken=resolve;});
  let calls=0;
  const service=createCommunicationService({
    transport:{async execute(){calls++;return {ok:true,kind:'ack'};}},
    getToken:()=>tokenWait,
    getRole:()=> 'coach',
    getState:()=>({available:true,identity:{id:identity}}),
    isOnline:()=>true,
  });
  const promise=service.markNotificationsRead(ids);
  identity='coach-B';
  releaseToken('jwt-B');
  await assert.rejects(()=>promise,/M45_COMMUNICATION_ACTOR_CHANGED/);
  assert.equal(calls,0);
});

test('M45 long notification batch stops dispatching when account changes during early RPCs',async()=>{
  let identity='coach-A',finishFirst;
  const early=new Promise((resolve)=>{finishFirst=resolve;});
  let calls=0,refreshes=0;
  const batch=Array.from({length:9},(_,i)=>
    `95ae4c9e-66d6-4e09-81f6-${String(851579900001+i).padStart(12,'0')}`
  );
  const service=createCommunicationService({
    transport:{
      async execute(){
        calls++;
        await early;
        return {ok:true,kind:'ack'};
      },
    },
    getToken:async()=> 'jwt-A',
    getRole:()=> 'coach',
    getState:()=>({available:true,identity:{id:identity}}),
    isOnline:()=>true,
    refreshState:async()=>{refreshes++;},
  });
  const pending=service.markNotificationsRead(batch);
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(calls,4,'bound parallel group writes at four');
  identity='coach-B';
  finishFirst();
  const result=await pending;
  assert.equal(calls,4,'remaining five writes must be discarded after identity switch');
  assert.equal(result.ok,false);
  assert.equal(result.markedCount,4);
  assert.equal(result.syncPending,true);
  assert.equal(refreshes,0,'no result from account A should hydrate account B');
});
