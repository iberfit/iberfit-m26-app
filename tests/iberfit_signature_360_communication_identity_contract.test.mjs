import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCommunicationService} from '../src/m26/communication/service.js';

function buildService({identity=()=>({id:'member-a',role:'client'}),token=async()=> 'qa-token',onUpsert=async()=>({ok:true})}={}){
  const calls=[];
  const state=Object.freeze({available:true,threads:[],messages:[],notifications:[],revision:1});
  const service=createCommunicationService({
    transport:{
      async notificationPreferencesUpsert(bearer,preferences){
        calls.push({kind:'preferences',bearer,preferences});
        return onUpsert();
      },
      async notificationPreferencesStatus(){calls.push({kind:'status'});return {ok:true,preferences:{}};},
      async execute(bearer,command){calls.push({kind:'execute',bearer,command});return {ok:true,kind:'ack'};},
    },
    getToken:token,
    getState:()=>state,
    getIdentity:identity,
    getRole:()=>identity()?.role||'',
    isOnline:()=>true,
    refreshState:async()=>{},
  });
  return {service,calls,state};
}

test('Signature360: a split communication slice still uses the canonical authenticated identity',async()=>{
  const {service,calls,state}=buildService();
  assert.equal(state.identity,undefined,'communication slice does not own authentication');
  await service.notificationPreferences.update({sessionReminders:true});
  assert.deepEqual(calls,[{kind:'preferences',bearer:'qa-token',preferences:{sessionReminders:true}}]);
});

test('Signature360: session switches fence in-flight preference writes before transport',async()=>{
  let identity={id:'member-a',role:'client'};
  let issueToken;
  const {service,calls}=buildService({
    identity:()=>identity,
    token:()=>new Promise(resolve=>{issueToken=resolve;}),
  });
  const pending=service.notificationPreferences.update({sessionReminders:true});
  identity={id:'member-b',role:'client'};
  issueToken('qa-token');
  await assert.rejects(pending,/M45_COMMUNICATION_ACTOR_CHANGED/);
  assert.equal(calls.length,0,'never send a previous account choice using a newly resolved token');
});

test('Signature360: absent authenticated identity is denied before a remote operation',async()=>{
  const {service,calls}=buildService({identity:()=>null});
  await assert.rejects(service.notificationPreferences.update({sessionReminders:true}),/M45_COMMUNICATION_ACTOR_REQUIRED/);
  assert.equal(calls.length,0);
});

test('Signature360: communication command keeps slice and account ownership separate',async()=>{
  const {service,calls}=buildService();
  await service.execute({type:'MESSAGE_MARK_READ',entityId:'thread-qa-1',operationId:'op-member-a-1'});
  assert.equal(calls.length,1);
  assert.equal(calls[0].command.type,'MESSAGE_MARK_READ');
  assert.equal(calls[0].bearer,'qa-token');
});

test('Signature360: application wiring does not substitute the communication slice for login identity',()=>{
  const source=fs.readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  assert.match(source,/getState:\(\)=>store\.getState\(\)\.communication,getIdentity:\(\)=>store\.getState\(\)\.identity,getRole:/);
  const service=fs.readFileSync(new URL('../src/m26/communication/service.js',import.meta.url),'utf8');
  assert.doesNotMatch(service,/getState\(\)\?\.identity\?\.id/);
  assert.doesNotMatch(service,/const identityScope=String\(state\?\.identity\?\.id/);
});
