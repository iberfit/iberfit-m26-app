import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  createDatedOccurrenceQaUi,qaDatedCalendarRange,formatDatedElapsed,
} from '../src/m26/workflows/occurrence-qa-ui.js';
import {M26_ACTION_REGISTRY} from '../src/m26/ui/interactive-audit.js';

const OWNER='10000000-0000-4000-8000-000000000001';
const CLIENT='20000000-0000-4000-8000-000000000001';
const SESSION='30000000-0000-4000-8000-000000000001';
const OCC='40000000-0000-4000-8000-000000000001';
const projectRef='gjztkdwfmunnzhtvxrsu';

test('UNIVERSAL U60 QA-only gate never mounts or queries in PROD',()=>{
  const disabled=createDatedOccurrenceQaUi();
  assert.equal(disabled.enabled,false);
  assert.equal(disabled.renderPanel(),'');
  assert.equal(disabled.hasBlockingWorkout(),false);
  disabled.mount();disabled.destroy();
  const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  assert.match(app,/runtime\.qaOnly===true&&runtime\.canary===true/u);
  assert.match(app,/runtime\.projectRef==='gjztkdwfmunnzhtvxrsu'/u);
  assert.match(app,/createDatedOccurrenceQaUi/u);
  assert.match(app,/datedUi\.renderPanel\(\)/u);
});

test('UNIVERSAL U60 Santiago calendar spans at most 92 days without locale time drift',()=>{
  const range=qaDatedCalendarRange(new Date('2026-11-06T12:00:00.000Z'));
  assert.equal(range.startDate,'2026-10-23');
  assert.equal(range.endDate,'2027-01-22');
  const delta=(Date.parse(range.endDate)-Date.parse(range.startDate))/86400000;
  assert.equal(delta,91);
  assert.equal(formatDatedElapsed(0),'00:00');
  assert.equal(formatDatedElapsed(61_000),'01:01');
  assert.equal(formatDatedElapsed(3601_000),'01:00:01');
  assert.equal(formatDatedElapsed(NaN),'00:00');
});

test('UNIVERSAL U60 separate action registry audits every date interaction with exact roles',()=>{
  const script=readFileSync(new URL('../scripts/audit/action_registry_audit.mjs',import.meta.url),'utf8');
  const html=readFileSync(new URL('../src/m26/workflows/occurrence-qa-ui.js',import.meta.url),'utf8');
  assert.match(script,/iberdates-action/u);
  const names=new Set([...html.matchAll(/data-iberdates-action="(u60-[a-z-]+)"/gu)]
    .map(match=>match[1]));
  assert.ok(names.size>=16);
  for(const name of names){
    const policy=M26_ACTION_REGISTRY[name];
    assert.ok(policy,'unregistered action '+name);
    assert.ok(policy.roles.every(role=>['coach','client'].includes(role)),name);
    assert.equal(policy.domain,'training360');
  }
  assert.deepEqual(M26_ACTION_REGISTRY['u60-preview'].roles,['coach']);
  assert.deepEqual(M26_ACTION_REGISTRY['u60-confirm'].roles,['coach']);
  assert.deepEqual(M26_ACTION_REGISTRY['u60-start'].roles,['coach','client']);
  assert.doesNotMatch(html,/localStorage|sessionStorage|SESION_INICIAR\(/u);
  assert.match(html,/runtime\.workout\.reconcile\(\)/u);
  assert.match(html,/runtime\.retryDates/u);
  assert.match(html,/runtime\.recovery\.retryUncertain/u);
});

function createHarness(role='coach'){
  const state={identity:{role,clientId:CLIENT},selectedClientId:CLIENT,
    collections:{clients:[{id:CLIENT}],sessions:[],appointments:[]}};
  const listeners=new Map(),calls=[];
  const root={
    addEventListener(event,handler){listeners.set(event,handler);},
    removeEventListener(event){listeners.delete(event);},
    contains:()=>true,querySelector:()=>null,
  };
  const transport={
    async occurrenceCalendar(token,query){
      calls.push({token,query});
      return {kind:'calendar',clientId:CLIENT,count:1,hasMore:false,
        occurrences:[{id:OCC,clientId:CLIENT,sessionId:SESSION,
          localDate:query.startDate,timeZone:'America/Santiago',
          status:'planificada',revision:0,title:'Sesión verificable'}]};
    },
    occurrenceCommand:async()=>{throw Error('UNEXPECTED_WRITE');},
    occurrencePrivateRead:async()=>{throw Error('UNEXPECTED_PRIVATE_READ');},
  };
  let ui;
  const originalIndexedDb=globalThis.indexedDB;
  globalThis.indexedDB={open(){throw Error('UNEXPECTED_IDB_ACCESS');}};
  try{
    ui=createDatedOccurrenceQaUi({enabled:true,root,ownerId:OWNER,projectRef,
      transport,getAuthContext:async()=>({
        userId:OWNER,role,clientId:CLIENT,accessToken:'synthetic-token',
      }),getState:()=>state,onRender:()=>{},cryptoImpl:webcrypto});
    ui.mount();
  }catch(error){globalThis.indexedDB=originalIndexedDb;throw error;}
  const close=()=>{ui.destroy();globalThis.indexedDB=originalIndexedDb;};
  return {ui,root,state,calls,listeners,close};
}

test('UNIVERSAL Coach calendar is fetched ONLY after an explicit action; no private read or write',async()=>{
  const h=createHarness();
  try{
    assert.equal(h.calls.length,0,'initial mount must not call the network');
    assert.match(h.ui.renderPanel(),/Training360/u);
    assert.match(h.ui.renderPanel(),/u60-calendar/u);
    const button={disabled:false,dataset:{},getAttribute:()=> 'u60-calendar',
      closest:()=>null};
    await h.listeners.get('click')({
      target:{closest:()=>button},preventDefault:()=>{},stopPropagation:()=>{},
    });
    assert.equal(h.calls.length,1);
    assert.equal(h.calls[0].token,'synthetic-token');
    assert.equal(h.calls[0].query.clientId,CLIENT);
    assert.match(h.ui.renderPanel(),/Sesión verificable/u);
    assert.match(h.ui.renderPanel(),/u60-confirm/u);
  }finally{h.close();}
});

test('UNIVERSAL role isolation: Client sees no Coach scheduling and Admin sees no date workspace',()=>{
  const client=createHarness('client');
  try{
    assert.match(client.ui.renderPanel(),/u60-calendar/u);
    assert.doesNotMatch(client.ui.renderPanel(),/u60-preview/u);
  }finally{client.close();}
  const admin=createHarness('admin');
  try{assert.equal(admin.ui.renderPanel(),'');}
  finally{admin.close();}
});

test('UNIVERSAL U60 live player does not accidentally re-enable legacy dated start',()=>{
  const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const legacy=app.slice(app.indexOf('async function onStartSession(event)'),
    app.indexOf('function surfaceRoleSwitchError(',app.indexOf('async function onStartSession(event)')));
  assert.match(legacy,/M26_OCCURRENCE_EXECUTOR_REQUIRED/u);
  assert.match(legacy,/datedUi\?\.hasBlockingWorkout\(\)/u);
  const controller=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  assert.match(controller,/M26_OCCURRENCE_EXECUTOR_REQUIRED/u);
  const service=readFileSync(new URL('../src/m26/workflows/occurrence-workout-service.js',import.meta.url),'utf8');
  assert.match(service,/executionStatus:current\?\.execution\?\.status/u);
  assert.match(service,/startedAt:current\?\.execution\?\.startedAt/u);
});
