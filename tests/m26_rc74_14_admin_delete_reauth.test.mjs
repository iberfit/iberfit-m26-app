import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminCommandService} from '../src/m26/admin/service.js';

const FACTOR_ID='65000000-0000-4000-8000-000000000002';
const CHALLENGE_ID='11111111-1111-4111-8111-111111111111';

function adminState(){
  return {
    available:true,
    organization:{id:'org-iberfit'},
    permissions:{
      capabilities:['client.lifecycle.manage'],
      scopeType:'organization',
      organizationId:'org-iberfit',
      revision:1,
    },
  };
}

function deleteInput(){
  return {
    operationId:'delete-client-op-1',
    type:'ADMIN_CLIENTE_ELIMINAR',
    entityId:'client-fixture',
    organizationId:'org-iberfit',
    reason:'fixture administrativo de prueba',
    payload:{
      clientId:'client-fixture',
      confirmClientId:'client-fixture',
      confirmValue:'fixture@iberfit.cl',
      confirmPhrase:'ELIMINAR',
    },
  };
}

test('si backend exige WebAuthn, confirma el dispositivo y reintenta una sola vez el mismo comando',async()=>{
  const executeCalls=[];
  let assuranceCalls=0;
  let ceremonyCalls=0;
  let challengeCalls=0;
  let verifyCalls=0;
  let refreshCalls=0;
  const transport={
    privilegedWebAuthnFactorId:FACTOR_ID,
    execute:async(_token,command)=>{
      executeCalls.push(command);
      if(executeCalls.length===1)throw new Error('IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED');
      return {ok:true,kind:'ack',operationId:command.operationId};
    },
    authAssuranceContext:async()=>{
      assuranceCalls+=1;
      return assuranceCalls===1
        ?{webauthnRequired:true,credentialEnrolled:true,iberfitAssurance:'required'}
        :{webauthnRequired:true,credentialEnrolled:true,iberfitAssurance:'verified'};
    },
    authUser:async()=>({id:'admin-user-1',email:'admin@iberfit.cl'}),
    challengeWebAuthn:async(_token,factorId)=>{
      challengeCalls+=1;
      assert.equal(factorId,FACTOR_ID);
      return {type:'request',challengeId:CHALLENGE_ID,credentialOptions:{challenge:'AA'}};
    },
    verifyWebAuthn:async(_token,payload)=>{
      verifyCalls+=1;
      assert.equal(payload.factorId,FACTOR_ID);
      assert.equal(payload.challengeId,CHALLENGE_ID);
      assert.equal(payload.type,'request');
      return {user:{id:'admin-user-1',email:'admin@iberfit.cl'}};
    },
  };
  const service=createAdminCommandService({
    transport,
    getToken:async()=> 'access-token',
    getAdminState:adminState,
    refreshState:async()=>{refreshCalls+=1;},
    runPrivilegedCeremony:async(challenge)=>{
      ceremonyCalls+=1;
      assert.equal(challenge.challengeId,CHALLENGE_ID);
      return {type:'request',credentialResponse:{id:'cred',type:'public-key',response:{authenticatorData:'AA'}}};
    },
  });

  const result=await service.execute(deleteInput());
  assert.equal(result.ok,true);
  assert.equal(executeCalls.length,2);
  assert.strictEqual(executeCalls[0],executeCalls[1]);
  assert.equal(executeCalls[0].operationId,'delete-client-op-1');
  assert.equal(ceremonyCalls,1);
  assert.equal(challengeCalls,1);
  assert.equal(verifyCalls,1);
  assert.equal(assuranceCalls,2);
  assert.equal(refreshCalls,1);
});

test('errores distintos de assurance no disparan ceremonia ni segundo intento',async()=>{
  let executes=0;
  let ceremonyCalls=0;
  let refreshCalls=0;
  const transport={
    execute:async()=>{executes+=1;throw new Error('IBERFIT_ADMIN_FORBIDDEN');},
  };
  const service=createAdminCommandService({
    transport,
    getToken:async()=> 'access-token',
    getAdminState:adminState,
    refreshState:async()=>{refreshCalls+=1;},
    runPrivilegedCeremony:async()=>{ceremonyCalls+=1;},
  });
  await assert.rejects(service.execute(deleteInput()),/IBERFIT_ADMIN_FORBIDDEN/);
  assert.equal(executes,1);
  assert.equal(ceremonyCalls,0);
  assert.equal(refreshCalls,0);
});

test('sin credencial WebAuthn enrolada falla cerrado y no reintenta el borrado',async()=>{
  let executes=0;
  let ceremonyCalls=0;
  let refreshCalls=0;
  const transport={
    privilegedWebAuthnFactorId:FACTOR_ID,
    execute:async()=>{executes+=1;throw new Error('IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED');},
    authAssuranceContext:async()=>({webauthnRequired:true,credentialEnrolled:false,iberfitAssurance:'required'}),
    authUser:async()=>({id:'admin-user-1',email:'admin@iberfit.cl'}),
    challengeWebAuthn:async()=>{throw new Error('challenge should not run');},
    verifyWebAuthn:async()=>{throw new Error('verify should not run');},
  };
  const service=createAdminCommandService({
    transport,
    getToken:async()=> 'access-token',
    getAdminState:adminState,
    refreshState:async()=>{refreshCalls+=1;},
    runPrivilegedCeremony:async()=>{ceremonyCalls+=1;},
  });
  await assert.rejects(service.execute(deleteInput()),/M26_ADMIN_PRIVILEGED_DEVICE_REQUIRED/);
  assert.equal(executes,1);
  assert.equal(ceremonyCalls,0);
  assert.equal(refreshCalls,0);
});

test('el transporte ADMIN reutiliza el contrato WebAuthn canónico y el factor privilegiado exacto',async()=>{
  const source=await import('node:fs/promises').then(({readFile})=>readFile(new URL('../src/m26/admin/transport.js',import.meta.url),'utf8'));
  assert.match(source,/createM26Transport/);
  assert.match(source,/65000000-0000-4000-8000-000000000002/);
  assert.match(source,/authAssuranceContext/);
  assert.match(source,/challengeWebAuthn/);
  assert.match(source,/verifyWebAuthn/);
  assert.doesNotMatch(source,/service[_-]?role/i);
});
