import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunicationService} from '../src/m26/communication/service.js';
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
