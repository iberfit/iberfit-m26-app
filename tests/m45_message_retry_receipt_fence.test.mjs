import test from 'node:test';
import assert from 'node:assert/strict';
import {createMessageRetryFence} from '../src/m26/communication/message-retry-fence.js';
import {createCommunicationService} from '../src/m26/communication/service.js';

test('M45 same message after uncertain timeout reuses the exact remote operation receipt',async()=>{
  let operations=0;
  const responses=[];
  const f=createMessageRetryFence({newId:()=>`receipt-${++operations}`});
  const service=createCommunicationService({
    transport:{
      async execute(token,command){
        responses.push(command.operationId);
        if(responses.length===1)throw new Error('M26_TIMEOUT');
        if(command.operationId!==responses[0])throw new Error('duplicate-message-risk');
        return {ok:true,kind:'duplicate',operationId:command.operationId};
      },
    },
    getToken:async()=> 'jwt',
    getRole:()=> 'coach',
    getState:()=> ({available:true,identity:{id:'c'}}),
  });
  const message={type:'MESSAGE_SEND',entityId:'thread-a',payload:{threadId:'thread-a',body:'Hola'}};
  const op1=f.forSend('thread-a','Hola');
  await assert.rejects(()=>service.execute({...message,operationId:op1}),/M26_TIMEOUT/);
  const op2=f.forSend('thread-a','Hola');
  assert.equal(op2,op1);
  const second=await service.execute({...message,operationId:op2});
  assert.equal(second.ok,true);
  assert.equal(second.response.kind,'duplicate');
  assert.equal(f.acknowledged('thread-a',op2),true);
  assert.equal(f.size,0);
  assert.deepEqual(responses,['receipt-1','receipt-1']);
});

test('M45 changed text gets a distinct operation; another thread does not collide',()=>{
  let i=0;
  const f=createMessageRetryFence({newId:()=>String(++i)});
  assert.equal(f.forSend('one','primero'),'1');
  assert.equal(f.forSend('one','primero'),'1');
  assert.equal(f.forSend('two','primero'),'2');
  assert.equal(f.forSend('one','actualizado'),'3');
  assert.equal(f.acknowledged('one','1'),false);
  assert.equal(f.forSend('one','actualizado'),'3');
  assert.equal(f.acknowledged('one','3'),true);
  assert.equal(f.size,1);
  f.clear();
  assert.equal(f.size,0);
});

test('M45 retry fence validates identifiers and limits pending memory',()=>{
  let i=0;
  const f=createMessageRetryFence({newId:()=>String(++i),maxPending:2});
  assert.throws(()=>f.forSend('', 'text'),/M45_MESSAGE_RETRY_INVALID/);
  assert.throws(()=>f.forSend('thread-a','  '),/M45_MESSAGE_RETRY_INVALID/);
  f.forSend('a','one');
  f.forSend('b','two');
  f.forSend('c','three');
  assert.equal(f.size,2);
  assert.equal(f.acknowledged('a','1'),false);
  assert.equal(f.forSend('b','two'),'2');
  assert.equal(f.forSend('a','one'),'4');
  assert.equal(f.size,2);
});
