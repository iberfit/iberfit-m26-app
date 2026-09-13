import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ensurePrivilegedActionAssurance,
} from '../src/m26/app/application.js';

function transportFixture({
  assurance=[
    {webauthnRequired:true,iberfitAssurance:'verified',credentialEnrolled:true},
  ],
  userId='user-coach-1',
  challengeType='request',
}={}){
  const calls=[];
  let assuranceIndex=0;
  const transport={
    async authAssuranceContext(){
      calls.push('assurance');
      const value=assurance[Math.min(assuranceIndex,assurance.length-1)];
      assuranceIndex+=1;
      return value;
    },
    async authUser(){
      calls.push('user');
      return {id:userId,email:'coach@iberfit.cl'};
    },
    async enrollWebAuthn(){
      calls.push('enroll');
      return {factorId:'factor-enrolled'};
    },
    async challengeWebAuthn(_token,factorId){
      calls.push(`challenge:${factorId}`);
      return {
        type:challengeType,
        factorId,
        challengeId:'challenge-1',
        publicKey:{challenge:'synthetic'},
      };
    },
    async verifyWebAuthn(_token,payload){
      calls.push(`verify:${payload.type}`);
      return {user:{id:userId}};
    },
  };
  return {transport,calls};
}

test('Coach create assurance does not prompt again when session is already verified',async()=>{
  const {transport,calls}=transportFixture({
    assurance:[{webauthnRequired:true,iberfitAssurance:'verified',credentialEnrolled:true}],
  });
  let ceremonyCalls=0;
  const result=await ensurePrivilegedActionAssurance({
    transport,
    token:'token',
    userId:'user-coach-1',
    runCeremony:async()=>{ceremonyCalls+=1;throw new Error('must not run');},
    webAuthnAvailable:()=>true,
  });
  assert.equal(result.verified,true);
  assert.equal(result.performed,false);
  assert.deepEqual(calls,['assurance']);
  assert.equal(ceremonyCalls,0);
});

test('Coach create assurance authenticates an enrolled device and rechecks final assurance',async()=>{
  const {transport,calls}=transportFixture({
    assurance:[
      {webauthnRequired:true,iberfitAssurance:'required',credentialEnrolled:true},
      {webauthnRequired:true,iberfitAssurance:'verified',credentialEnrolled:true},
    ],
    challengeType:'request',
  });
  const ceremony=[];
  const result=await ensurePrivilegedActionAssurance({
    transport,
    token:'token',
    userId:'user-coach-1',
    runCeremony:async(challenge,options)=>{
      ceremony.push({challenge,options});
      return {type:'request',credentialResponse:{id:'credential-1'}};
    },
    webAuthnAvailable:()=>true,
  });
  assert.equal(result.verified,true);
  assert.equal(result.performed,true);
  assert.equal(result.kind,'challenge');
  assert.deepEqual(calls,[
    'assurance',
    'user',
    'challenge:65000000-0000-4000-8000-000000000002',
    'verify:request',
    'assurance',
  ]);
  assert.equal(ceremony.length,1);
  assert.match(ceremony[0].options.friendlyName,/confirmar acción segura/u);
});

test('Coach create assurance enrolls a new device before privileged client creation',async()=>{
  const {transport,calls}=transportFixture({
    assurance:[
      {webauthnRequired:true,iberfitAssurance:'required',credentialEnrolled:false},
      {webauthnRequired:true,iberfitAssurance:'verified',credentialEnrolled:true},
    ],
    challengeType:'create',
  });
  const result=await ensurePrivilegedActionAssurance({
    transport,
    token:'token',
    userId:'user-coach-1',
    runCeremony:async()=>({type:'create',credentialResponse:{id:'credential-new'}}),
    webAuthnAvailable:()=>true,
  });
  assert.equal(result.verified,true);
  assert.equal(result.performed,true);
  assert.equal(result.kind,'enroll-required');
  assert.deepEqual(calls,[
    'assurance',
    'user',
    'enroll',
    'challenge:factor-enrolled',
    'verify:create',
    'assurance',
  ]);
});

test('Coach create assurance fails closed when secure device confirmation is unavailable',async()=>{
  const {transport,calls}=transportFixture({
    assurance:[{webauthnRequired:true,iberfitAssurance:'required',credentialEnrolled:true}],
  });
  await assert.rejects(
    ensurePrivilegedActionAssurance({
      transport,
      token:'token',
      userId:'user-coach-1',
      webAuthnAvailable:()=>false,
    }),
    /M26_WEBAUTHN_UNSUPPORTED/u,
  );
  assert.deepEqual(calls,['assurance']);
});

test('Coach create assurance rejects identity drift before any privileged mutation',async()=>{
  const {transport,calls}=transportFixture({
    assurance:[{webauthnRequired:true,iberfitAssurance:'required',credentialEnrolled:true}],
    userId:'different-user',
  });
  await assert.rejects(
    ensurePrivilegedActionAssurance({
      transport,
      token:'token',
      userId:'user-coach-1',
      webAuthnAvailable:()=>true,
    }),
    /M26_PRIVILEGED_ACTION_IDENTITY_MISMATCH/u,
  );
  assert.deepEqual(calls,['assurance','user']);
});

test('Admin and Coach surfaces both retain real client-create capability',()=>{
  const routeVm=fs.readFileSync('src/m26/modules/route-view-model.js','utf8');
  const route=fs.readFileSync('src/m26/modules/route-render.js','utf8');
  const workflow=fs.readFileSync('src/m26/app/workflow-controller.js','utf8');
  const application=fs.readFileSync('src/m26/app/application.js','utf8');
  const adminService=fs.readFileSync('src/m26/admin/service.js','utf8');
  const edge=fs.readFileSync('supabase/functions/iberfit-client-onboarding-v1/index.ts','utf8');

  assert.match(routeVm,/canCreate:\s*\['admin',\s*'coach'\]\.includes\(role\)/u);
  assert.match(route,/data-workflow-form="client-onboarding"/u);
  assert.match(route,/Crear expediente y abrir diagnóstico IRI/u);
  assert.match(route,/enviará la invitación al correo cuando corresponda/u);
  assert.doesNotMatch(route,/No se envía ninguna invitación/u);
  assert.doesNotMatch(route,/El acceso permanece desactivado/u);

  assert.match(workflow,/async function createClient\(\)[\s\S]*?requireCoach\(\)/u);
  assert.match(workflow,/M26_CLIENT_CREATE_NOT_PERSISTED/u);
  assert.match(workflow,/store\.selectClient\?\.\(created\.id\)/u);
  assert.match(workflow,/store\.navigate\?\.\('iri'\)/u);
  assert.match(workflow,/M26_PRIVILEGED_ACTION_TIMEOUT/u);

  assert.match(application,/ensurePrivilegedActionAssurance\(\{transport,token,userId:session\?\.user\?\.id/u);
  assert.match(application,/await transport\.clientOnboardingPreflight\(token\)/u);
  assert.match(application,/await transport\.createClientDraft\(token,payload\)/u);
  assert.match(application,/waitForCreatedClient/u);

  assert.match(adminService,/PRIVILEGED_REAUTH_COMMANDS=new Set\(\['ADMIN_CLIENTE_CREAR'/u);
  assert.match(edge,/roles\.includes\('admin'\)[\s\S]*roles\.includes\('coach'\)/u);
});
