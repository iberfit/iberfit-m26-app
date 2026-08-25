import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {
  CLIENT_ONBOARDING_DRAFT_SCOPE,
  CLIENT_ONBOARDING_LOCAL_ID,
  clientRecordId,
  findCreatedClientInSnapshot,
  legacyClientDraftPayload,
  onboardingRequestId,
  waitForCreatedClient,
} from '../src/m26/workflows/client-onboarding.js';
import {createM26Transport} from '../src/m26/supabase-transport.js';
import {createBrowserKeyValueStore,createWebStorageKeyValueStore} from '../src/m26/platform/key-value-store.js';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const runtime={enabled:true,canary:true,qaOnly:true,url:'https://gjztkdwfmunnzhtvxrsu.supabase.co',projectRef:'gjztkdwfmunnzhtvxrsu',publishableKey:'publishable-test',timeoutMs:1000,version:'26.0.0-canary.36'};
const valid={name:'Adriana QA',email:'adriana.qa@example.com',phone:'+56 9 1111 2222',birthDate:'1990-01-01',sexForNorms:'female',modality:'presencial',weeklyFrequency:'2',sessionDurationMinutes:'60',primaryObjective:'Mantener la salud y desarrollar fuerza.',trainingAddress:'Dirección QA'};

test('alta V12.2 usa identificador idempotente estable y conserva contrato histórico',()=>{
  const first=legacyClientDraftPayload(valid),second=legacyClientDraftPayload({...valid,name:'  Adriana QA  '});
  assert.equal(first.requestId,second.requestId);
  assert.equal(first.idempotencyKey,first.requestId);
  assert.match(first.requestId,/^onb-[0-9a-f]{8}$/);
  assert.equal(first.onboardingVersion,'m26-v12.2');
  assert.equal(first.accessEnabled,false);
});

test('verificación reconoce id y correo en formas remotas compatibles',async()=>{
  const snapshot={data:{clients:[{client_id:'CLIENT-V122',body:{profile:{email:'adriana.qa@example.com'}},name:'Adriana QA'}]}};
  const found=findCreatedClientInSnapshot(snapshot,{id:'CLIENT-V122',email:'adriana.qa@example.com'});
  assert.equal(clientRecordId(found),'CLIENT-V122');
  const verified=await waitForCreatedClient({result:{ok:true,visible:true,client_id:'CLIENT-V122'},payload:valid,delays:[0],waitFn:async()=>{},fetchSnapshot:async()=>snapshot});
  assert.equal(clientRecordId(verified.client),'CLIENT-V122');
});

test('transporte falla cerrado si backend V12 no está instalado',async()=>{
  const fetchImpl=async()=>({ok:false,status:404,headers:{get:()=> 'application/json'},json:async()=>({code:'PGRST202',message:'Could not find the function'})});
  const transport=createM26Transport(runtime,{fetchImpl});
  await assert.rejects(()=>transport.clientOnboardingPreflight('jwt-test'),/M26_CLIENT_ONBOARDING_BACKEND_REQUIRED/);
  await assert.rejects(()=>transport.createClientDraft('jwt-test',valid),/M26_CLIENT_ONBOARDING_BACKEND_REQUIRED/);
});

test('transporte solo acepta creación confirmada y visible',async()=>{
  let call=0;
  const fetchImpl=async()=>{call+=1;const body=call===1?{ok:true,ready:true}:{ok:true,visible:true,client_id:'CLIENT-V122'};return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>body};};
  const transport=createM26Transport(runtime,{fetchImpl});
  assert.equal((await transport.clientOnboardingPreflight('jwt-test')).ready,true);
  assert.equal((await transport.createClientDraft('jwt-test',valid)).client_id,'CLIENT-V122');
});

test('controlador guarda mientras se escribe, recupera y elimina el borrador del alta',()=>{
  const source=read('src/m26/app/workflow-controller.js');
  assert.equal(CLIENT_ONBOARDING_LOCAL_ID,'pending-client');
  assert.equal(CLIENT_ONBOARDING_DRAFT_SCOPE,'client-onboarding-v12');
  assert.match(source,/function queueOnboardingSave/);
  assert.match(source,/onboardingForm\)\{clearControlValidation\(event\.target\);clearStatus\(root,'client-onboarding'\);queueOnboardingSave\(onboardingForm\)/);
  assert.match(source,/syncOnboardingFormState\(onboardingForm\);queueOnboardingSave\(onboardingForm\)/);
  assert.match(source,/globalThis\.addEventListener\?\.\('pagehide',onPageHide\)/);
  assert.match(source,/initializeOnboardingForm/);
  assert.match(source,/Borrador del nuevo expediente recuperado/);
  assert.match(source,/draftRepository\?\.remove\?\.\(CLIENT_ONBOARDING_LOCAL_ID,CLIENT_ONBOARDING_DRAFT_SCOPE\)/);
});

test('sessionStorage mantiene el borrador tras recargar aunque IndexedDB no esté disponible',async()=>{
  const values=new Map();
  const storage={
    get length(){return values.size;},
    key(index){return [...values.keys()][index]??null;},
    getItem(key){return values.has(String(key))?values.get(String(key)):null;},
    setItem(key,value){values.set(String(key),String(value));},
    removeItem(key){values.delete(String(key));},
  };
  const direct=createWebStorageKeyValueStore({storage,prefix:'qa:'});
  await direct.set('draft',{name:'Adriana'});
  assert.deepEqual(await direct.get('draft'),{name:'Adriana'});
  const first=createBrowserKeyValueStore({indexedDBImpl:null,sessionStorageImpl:storage,sessionPrefix:'reload:'});
  await first.set('m26:engagement-draft:coach:pending-client:client-onboarding-v12',{value:valid});
  const afterReload=createBrowserKeyValueStore({indexedDBImpl:null,sessionStorageImpl:storage,sessionPrefix:'reload:'});
  assert.deepEqual((await afterReload.get('m26:engagement-draft:coach:pending-client:client-onboarding-v12')).value,valid);
});

test('migración backend es aditiva, autenticada, idempotente y verifica bootstrap',()=>{
  const sql=read('backend/V12_CLIENT_ONBOARDING_REPAIR.sql');
  assert.match(sql,/create or replace function public\.iberfit_client_onboarding_preflight_v12/);
  assert.match(sql,/create or replace function public\.iberfit_create_client_draft_v12\(p_payload jsonb\)/);
  assert.match(sql,/security definer/);
  assert.match(sql,/V12_COACH_ROLE_REQUIRED/);
  assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\(v_email,0\)\)/);
  assert.match(sql,/Si el contrato devolvió un id operativo/);
  assert.match(sql,/public\.client_intake_profiles/);
  assert.match(sql,/lower\(btrim\(i\.email\)\)=v_email/);
  assert.match(sql,/public\.m26_canary_clients_v26/);
  assert.match(sql,/V12_CLIENT_NOT_VISIBLE_AFTER_CANARY_ACTIVATION/);
  assert.match(sql,/V12_CLIENT_EMAIL_AMBIGUOUS/);
  assert.match(sql,/V12_CLIENT_EMAIL_ASSIGNED_OTHER_COACH/);
  assert.match(sql,/public\.iberfit_create_client_draft\(p_payload\)/);
  assert.match(sql,/client_assignments\(client_id,coach_user_id,active\)/);
  assert.match(sql,/public\.iberfit_bootstrap_v26\(\)/);
  assert.match(sql,/V12_CLIENT_CANARY_NOT_ACTIVATED/);
  assert.match(sql,/revoke all .* from anon/is);
  assert.match(sql,/grant execute .* to authenticated/is);
  assert.match(sql,/notify pgrst, 'reload schema'/);
  assert.doesNotMatch(sql,/drop\s+(?:table|function)|truncate|delete\s+from/i);
});

test('formularios críticos no quedan ocultos detrás de barras adhesivas',()=>{
  const css=read('src/m26/shell/shell.css');
  assert.match(css,/V12\.2 · Formularios críticos sin controles superpuestos/);
  assert.match(css,/\.m26-onboarding \.m26-sticky-actions,[\s\S]*\[data-workflow-form="iri"\] \.m26-wizard-actions\{position:static/);
});
