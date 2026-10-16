import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupCommunicationMessages,
  messagesForThread,
  projectCommunicationSnapshot,
} from '../src/m26/communication/state.js';

function fixture(threadCount=200,messageCount=2500){
  const threads=Array.from({length:threadCount},(_,i)=>({id:`thread-${i}`}));
  const messages=Array.from({length:messageCount},(_,i)=>({
    id:`message-${i}`,
    threadId:`thread-${i%threadCount}`,
    createdAt:new Date(Date.UTC(2026,9,15,11,0,(messageCount-i)%60)).toISOString(),
    body:`Mensaje ${i}`,
  }));
  return {communication:{threads,messages}};
}

test('M45 index preserves exact message history order without cross-thread messages',()=>{
  const state=fixture();
  const ids=state.communication.threads.map((t)=>t.id);
  const index=groupCommunicationMessages(state,ids);
  assert.equal(index.size,ids.length);
  let count=0;
  for(const id of ids){
    const actual=index.get(id);
    assert.ok(Object.isFrozen(actual));
    assert.deepEqual(actual,messagesForThread(state,id));
    assert.ok(actual.every((message)=>message.threadId===id));
    count+=actual.length;
  }
  assert.equal(count,state.communication.messages.length);
});

test('M45 projection never creates a thread or exposes orphan messages',()=>{
  const raw={
    ok:true,
    threads:[{id:'my-thread',clientId:'client-1'}],
    messages:[
      {id:'message-visible',threadId:'my-thread',body:'Autorizado',createdAt:'2026-10-15T10:00:00Z'},
      {id:'message-orphan',threadId:'unrelated-thread',body:'No autorizado',createdAt:'2026-10-15T10:00:00Z'},
    ],
    notifications:[],
  };
  const state=projectCommunicationSnapshot(raw,{role:'client'});
  const index=groupCommunicationMessages({communication:state},state.threads.map((t)=>t.id));
  assert.deepEqual([...index.keys()],['my-thread']);
  assert.deepEqual(index.get('my-thread').map((m)=>m.id),['message-visible']);
  assert.equal(JSON.stringify(state).includes('No autorizado'),false);
});

test('M45 index keeps identical timestamps in arrival order and excludes unknown roles',()=>{
  const state={communication:{
    messages:[
      {id:'first',threadId:'x',createdAt:'2026-10-15T10:00:00Z'},
      {id:'second',threadId:'x',createdAt:'2026-10-15T10:00:00Z'},
    ],
  }};
  const index=groupCommunicationMessages(state,['x','empty']);
  assert.deepEqual(index.get('x').map((m)=>m.id),['first','second']);
  assert.deepEqual(index.get('empty'),[]);
  assert.equal(groupCommunicationMessages(state,[]).size,0);
});
