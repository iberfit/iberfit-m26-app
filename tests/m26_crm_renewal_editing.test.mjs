import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCommercialRenewalCommand } from '../src/m26/engagement/command-builders.js';
import { engagementCapabilities, M26_ENGAGEMENT_EXTENSION_REGISTRY } from '../src/m26/engagement/activity-capabilities.js';
import { createEngagementCommandService } from '../src/m26/engagement/command-service.js';
import { M26_EXTENDED_COMMAND_REGISTRY } from '../src/m26/command-catalog.js';

const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const entityId='7d0d983e-2b32-4ef1-b51a-83313af0fb5d';
const controllerSource=readFileSync(new URL('../src/m26/engagement/engagement-controller.js',import.meta.url),'utf8');

test('renewal builder preserves idempotency identity and only explicit commercial fields',()=>{
  const command=buildCommercialRenewalCommand({clientId,entityId,baseRevision:2,operationId:'renewal-op-1',renewal:{renewalStatus:'upcoming',renewalDate:'2026-09-20',commercialPlan:'Hybrid 2x',notes:'Review continuity.',paymentStatus:'paid',debt:100,sendMessage:true}},{role:'coach'});
  assert.equal(command.type,'RENOVACION_REGISTRAR');
  assert.equal(command.entityType,'renewal');
  assert.equal(command.operationId,'renewal-op-1');
  assert.equal(command.baseRevision,2);
  assert.deepEqual(Object.keys(command.payload.patch).sort(),['commercialPlan','notes','renewalDate','renewalStatus']);
  assert.equal('paymentStatus' in command.payload.patch,false);
  assert.equal('debt' in command.payload.patch,false);
  assert.equal('sendMessage' in command.payload.patch,false);
});

test('renewal builder rejects invalid or absent explicit evidence',()=>{
  assert.throws(()=>buildCommercialRenewalCommand({clientId,entityId,renewal:{renewalStatus:'paid'}},{role:'coach'}),/M26_RENEWAL_STATUS_INVALID/);
  assert.throws(()=>buildCommercialRenewalCommand({clientId,entityId,renewal:{renewalDate:'2026-02-30'}},{role:'coach'}),/M26_RENEWAL_DATE_INVALID/);
  assert.throws(()=>buildCommercialRenewalCommand({clientId,entityId,baseRevision:-1,renewal:{renewalStatus:'current'}},{role:'coach'}),/M26_RENEWAL_REVISION_INVALID/);
  assert.throws(()=>buildCommercialRenewalCommand({clientId,entityId,renewal:{}},{role:'coach'}),/M26_RENEWAL_EVIDENCE_REQUIRED/);
});

test('commercial renewal capability is fail closed until command is installed',()=>{
  assert.equal(engagementCapabilities([]).commercialRenewals.ready,false);
  assert.deepEqual(engagementCapabilities([]).commercialRenewals.missing,['RENOVACION_REGISTRAR']);
  assert.equal(engagementCapabilities(M26_ENGAGEMENT_EXTENSION_REGISTRY.map((item)=>item.type)).commercialRenewals.ready,true);
});

test('renewal command service allows Coach/Admin and rejects Client/offline execution',async()=>{
  const executed=[];
  const bus={async execute(command){executed.push(command);return {ok:true,command};},async enqueue(){throw new Error('QUEUE_NOT_ALLOWED');}};
  const coach=createEngagementCommandService({commandBus:bus,installedRegistry:M26_EXTENDED_COMMAND_REGISTRY,getRole:()=> 'coach',isOnline:()=>true});
  const result=await coach.recordCommercialRenewal({clientId,entityId,renewal:{renewalStatus:'current',renewalDate:'2026-10-01'}});
  assert.equal(result.ok,true);assert.equal(executed[0].type,'RENOVACION_REGISTRAR');
  const admin=createEngagementCommandService({commandBus:bus,installedRegistry:M26_EXTENDED_COMMAND_REGISTRY,getRole:()=> 'admin',isOnline:()=>true});
  const adminResult=await admin.recordCommercialRenewal({clientId,entityId,renewal:{renewalStatus:'upcoming'}});
  assert.equal(adminResult.ok,true);assert.equal(executed[1].type,'RENOVACION_REGISTRAR');
  const client=createEngagementCommandService({commandBus:bus,installedRegistry:M26_EXTENDED_COMMAND_REGISTRY,getRole:()=> 'client',isOnline:()=>true});
  await assert.rejects(()=>client.recordCommercialRenewal({clientId,entityId,renewal:{renewalStatus:'current'}}),/M26_ENGAGEMENT_ROLE_FORBIDDEN/);
  const offline=createEngagementCommandService({commandBus:bus,installedRegistry:M26_EXTENDED_COMMAND_REGISTRY,getRole:()=> 'admin',isOnline:()=>false});
  await assert.rejects(()=>offline.recordCommercialRenewal({clientId,entityId,renewal:{renewalStatus:'current'}}),/M26_RENEWAL_ONLINE_REQUIRED/);
});

test('renewal controller scopes feedback per client and verifies canonical rehydration before success',()=>{
  assert.match(controllerSource,/function renewalFormForClient\(/u);
  assert.match(controllerSource,/await refreshState\(\{reason:'commercial-renewal-recorded'\}\)/u);
  assert.match(controllerSource,/M26_RENEWAL_NOT_PERSISTED/u);
  assert.match(controllerSource,/setStatus\(confirmedForm,'commercial-renewal','Renovación guardada en la fuente canónica\.'/u);
  assert.match(controllerSource,/button\?\.closest\?\.\('\[data-engagement-form="commercial-renewal"\]'\)/u);
  assert.match(controllerSource,/friendlyRenewalError/u);
  assert.match(controllerSource,/No se registró ningún cambio local\./u);
});
