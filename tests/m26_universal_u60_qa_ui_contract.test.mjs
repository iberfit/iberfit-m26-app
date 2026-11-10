import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  createDatedOccurrenceQaUi,qaDatedCalendarRange,formatDatedElapsed,
  plannedDatedSetDraft,applyPlannedDatedSetDraft,
  suggestedConfirmedDatedAppointments,datedCoachPreviewMatchesForm,
} from '../src/m26/workflows/occurrence-qa-ui.js';
import {M26_ACTION_REGISTRY} from '../src/m26/ui/interactive-audit.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

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
  return {ui,root,state,calls,listeners,close,transport};
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

test('U60 Coach calendar is invalidated when switching to Client on the same UUID',async()=>{
  const h=createHarness('coach');
  try{
    const button={disabled:false,dataset:{},getAttribute:()=> 'u60-calendar',
      closest:()=>null};
    await h.listeners.get('click')({
      target:{closest:()=>button},preventDefault:()=>{},stopPropagation:()=>{},
    });
    assert.match(h.ui.renderPanel(),/Sesión verificable/u);
    assert.match(h.ui.renderPanel(),/u60-confirm/u);
    h.state.identity.role='client';
    const clientMarkup=h.ui.renderPanel();
    assert.doesNotMatch(clientMarkup,/Sesión verificable/u);
    assert.doesNotMatch(clientMarkup,/u60-confirm/u);
    assert.match(clientMarkup,/Consulta el calendario autorizado/u);
    h.state.identity.role='coach';
    const returnedMarkup=h.ui.renderPanel();
    assert.doesNotMatch(returnedMarkup,/Sesión verificable/u,
      're-entering Coach must request a fresh authorized calendar');
  }finally{h.close();}
});

test('U60 changing selected Coach client clears stale prior-client calendar',async()=>{
  const h=createHarness('coach');
  const second='20000000-0000-4000-8000-000000000002';
  try{
    const button={disabled:false,dataset:{},getAttribute:()=> 'u60-calendar',
      closest:()=>null};
    await h.listeners.get('click')({
      target:{closest:()=>button},preventDefault:()=>{},stopPropagation:()=>{},
    });
    assert.match(h.ui.renderPanel(),/Sesión verificable/u);
    h.state.collections.clients.push({id:second});
    h.state.selectedClientId=second;
    assert.doesNotMatch(h.ui.renderPanel(),/Sesión verificable/u);
    assert.doesNotMatch(h.ui.renderPanel(),/u60-confirm/u);
    h.state.selectedClientId=CLIENT;
    assert.doesNotMatch(h.ui.renderPanel(),/Sesión verificable/u,
      'returning to a client cannot reuse stale owner-scoped rows');
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

test('UNIVERSAL U60 dates, secure recovery and calendar copy are localized in EN FR PT',()=>{
  for(const label of [
    'Entrenamiento por fechas independientes',
    'Consultar fechas confirmadas',
    'Desbloquear recuperación cifrada',
    'Series registradas. Añade el feedback antes de finalizar.',
    'Esta operación no está autorizada para tu cuenta, cliente o modalidad.',
    'Inicio confirmado por el servidor.',
  ]){
    for(const language of ['en','fr','pt']){
      const translation=iberfitSurfaceTranslate(label,{language});
      assert.notEqual(translation,label,language+': '+label);
      assert.ok(translation.length>=3);
    }
  }
});

test('UNIVERSAL Coach can cancel only a scheduled U60 date, with U34 CAS and no delete',()=>{
  const ui=readFileSync(new URL('../src/m26/workflows/occurrence-qa-ui.js',import.meta.url),'utf8');
  const sql=readFileSync(new URL('../supabase/migrations/20261025231500_signature_u34_coach_atomic_cancel_reschedule_v1.sql',import.meta.url),'utf8');
  assert.match(ui,/data-iberdates-action="u60-cancel"/u);
  assert.match(ui,/type:'OCURRENCIA_CANCELAR'/u);
  assert.match(ui,/baseRevision:row\.revision/u);
  assert.deepEqual(M26_ACTION_REGISTRY['u60-cancel'].roles,['coach']);
  assert.match(sql,/occ\.status NOT IN \('planificada','confirmada'\)/u);
  assert.match(sql,/occ\.execution_id IS NOT NULL/u);
  assert.match(sql,/status='cancelada'/u);
  assert.doesNotMatch(ui,/\.delete\(|DELETE FROM/u);
});
test('UNIVERSAL U60 locally completed encrypted feedback can retry server ACK without repeating finish',()=>{
  const ui=readFileSync(new URL('../src/m26/workflows/occurrence-qa-ui.js',import.meta.url),'utf8');
  assert.match(ui,/data-iberdates-action="u60-retry-complete"/u);
  assert.match(ui,/executionStatus!=='completed'/u);
  assert.match(ui,/runtime\.workout\.complete\(\)/u);
  assert.deepEqual(M26_ACTION_REGISTRY['u60-retry-complete'].roles,['coach','client']);
  for(const label of ['Cancelar esta fecha','Confirmar cancelación','Confirmar finalización pendiente en servidor'])
    for(const lang of ['en','fr','pt'])
      assert.notEqual(iberfitSurfaceTranslate(label,{language:lang}),label);
});

test('UNIVERSAL U60 Client dates remain inside their independently scrollable route above the mobile dock',()=>{
  const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const route=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const visual=readFileSync(new URL('../qa/rc64/authenticated-visual-evidence.spec.mjs',import.meta.url),'utf8');
  assert.match(app,/role==='client'&&datedPanel\s*\?\{\.\.\.routeVm,qaDatedPanel:datedPanel\}/u,
    'Client U60 calendar is rendered by the route composer, not a post-dock sibling');
  assert.match(app,/return role==='client'\?markup:markup\+datedPanel;/u);
  assert.match(route,/const qaDatedPanel=isClient&&typeof vm\.qaDatedPanel==='string'\?vm\.qaDatedPanel:'';/u);
  assert.match(route,/\$\{workflowStatus\('session'\)\}\$\{qaDatedPanel\}<\/div>/u,
    'U60 Client calendar is a descendant of the existing route viewport');
  assert.match(visual,/datedPanelInScroller/u,'Mobile QA must check U60 is within the route scrollport');
});

test('U60 Coach RPE shortcut changes only the active input and never sends a write',async()=>{
  const h=createHarness('coach');
  try{
    const input={value:''},choices=[];
    const panel={
      querySelector:selector=>selector==='[name="u60Rpe"]'?input:null,
      querySelectorAll:selector=>selector==='[data-u60-quick-rpe]'?choices:[],
    };
    const choice=(value)=>{
      const pressed={value:'false'};
      const button={
        disabled:false,pressed,
        getAttribute:key=>key==='data-u60-quick-rpe'?String(value):null,
        setAttribute:(key,val)=>{if(key==='aria-pressed')pressed.value=val;},
        closest:selector=>selector==='[data-u60-panel]'?panel:null,
      };
      choices.push(button);return button;
    };
    const seven=choice(7),nine=choice(9);
    const click=async(button)=>h.listeners.get('click')({
      target:{closest:selector=>selector==='[data-u60-quick-rpe]'?button:null},
      preventDefault(){},stopPropagation(){},
    });
    await click(seven);
    assert.equal(input.value,'7');
    assert.equal(seven.pressed.value,'true');
    assert.equal(nine.pressed.value,'false');
    await click(nine);
    assert.equal(input.value,'9');
    assert.equal(seven.pressed.value,'false');
    assert.equal(nine.pressed.value,'true');
    assert.equal(h.calls.length,0,'a manual RPE selection cannot call U60 transport');
  }finally{h.close();}
});

test('U60 invalid observed RPE is rejected before any write or encryption action',async()=>{
  const h=createHarness('coach');
  try{
    const panel={querySelector:selector=>selector==='[name="u60Rpe"]'
      ?{value:'12'}:null};
    const button={disabled:false,dataset:{},
      getAttribute:selector=>selector==='data-iberdates-action'?'u60-record':null,
      closest:selector=>selector==='[data-u60-panel]'?panel:null,
    };
    await h.listeners.get('click')({target:{closest:selector=>
      selector==='[data-iberdates-action]'?button:null},
      preventDefault(){},stopPropagation(){}});
    assert.equal(h.calls.length,0);
    assert.match(h.ui.renderPanel(),/RPE real de esta serie/u);
  }finally{h.close();}
});

test('U60 rejects an in-flight Coach calendar after Coach → Client → Coach even with the same UUID',async()=>{
  const h=createHarness('coach');
  try{
    let enterRemote,releaseRemote;
    const entered=new Promise(resolve=>{enterRemote=resolve;});
    const remote=new Promise(resolve=>{releaseRemote=resolve;});
    h.transport.occurrenceCalendar=async(_token,query)=>{
      enterRemote();
      return remote;
    };
    const button={disabled:false,dataset:{},getAttribute:()=> 'u60-calendar',
      closest:()=>null};
    const reading=h.listeners.get('click')({
      target:{closest:()=>button},preventDefault(){},stopPropagation(){},
    });
    await entered;
    h.state.identity.role='client';
    const client=h.ui.renderPanel();
    assert.doesNotMatch(client,/Sesión verificable/u);
    h.state.identity.role='coach';
    h.ui.renderPanel();
    releaseRemote({kind:'calendar',clientId:CLIENT,count:1,hasMore:false,
      occurrences:[{id:OCC,clientId:CLIENT,sessionId:SESSION,
        localDate:queryDate(),timeZone:'America/Santiago',
        status:'planificada',revision:0,title:'Sesión verificable'}]});
    await reading;
    const after=h.ui.renderPanel();
    assert.doesNotMatch(after,/Sesión verificable/u,
      'an old response must not repopulate a cache after an ABA role change');
    assert.match(after,/No se pudo confirmar el cambio/u);
  }finally{h.close();}
});

function queryDate(){
  return qaDatedCalendarRange(new Date()).startDate;
}

test('Coach RPE shortcuts and all form recovery errors are localized EN/FR/PT',()=>{
  for(const text of [
    'Registra el RPE real de esta serie, entre 1 y 10, en pasos de 0,5. Puedes seleccionarlo o escribirlo.',
    'Revisa las repeticiones, el tiempo, la distancia o el RIR. Deben ser cantidades válidas y dentro de sus límites.',
    'Para omitir una serie debes registrar un motivo de al menos tres caracteres.',
    'Seleccionar RPE real de la serie',
    'RPE real',
  ])for(const language of ['en','fr','pt']){
    const translated=iberfitSurfaceTranslate(text,{language});
    assert.notEqual(translated,text,language+' '+text);
  }
});

test('U60 time-late calendar reads are rejected after role change, including Coach to Client to Coach',()=>{
  const source=readFileSync(new URL('../src/m26/workflows/occurrence-qa-ui.js',import.meta.url),'utf8');
  assert.match(source,/generation\+\+; \/\/ invalidate any calendar/u);
  assert.match(source,/generation!==requestedGeneration/u);
  assert.match(source,/generation!==startedAtGeneration/u);
  assert.match(source,/focus\.role!==scope\.role/u);
  assert.match(source,/if\(!focus\)return;/u);
});

test('U60 copy-plan assistant only accepts unambiguous reps and kg, never invents effort',()=>{
  assert.deepEqual(plannedDatedSetDraft({prescription:{reps:'8',plannedLoad:'52,5 kg',targetRpe:7,targetRir:3}}),
    {reps:'8',load:'52.5'});
  for(const reps of ['8-12','4 x 8','99999','-1','NaN']){
    const values=plannedDatedSetDraft({prescription:{reps,plannedLoad:'50kg'}});
    assert.equal(values.reps,undefined,reps);
    assert.equal(values.load,'50');
    assert.equal(values.rpe,undefined);
  }
  assert.deepEqual(plannedDatedSetDraft({prescription:{reps:'8',plannedLoad:'según indicación'}}),
    {reps:'8'});
  assert.deepEqual(plannedDatedSetDraft(null),{});
  assert.equal(Object.isFrozen(plannedDatedSetDraft({prescription:{reps:'9'}})),true);
});

test('U60 plan-copy interaction is Coach-only, does not overwrite edits, never sends a workout write',async()=>{
  const h=createHarness('coach');
  const fields={
    u60Reps:{value:''},u60Load:{value:'60'},u60Rpe:{value:''},
  };
  const panel={querySelector:selector=>{
    const match=selector.match(/^\[name="([^"]+)"\]$/u);
    return fields[match?.[1]]||null;
  }};
  const button={
    disabled:false,
    hasAttribute:key=>key==='data-u60-copy-plan',
    closest:key=>key==='[data-u60-panel]'?panel:null,
  };
  const originalState=h.state;
  try{
    // No active occurrence: a shortcut cannot inject data into another form.
    await h.listeners.get('click')({target:{closest:key=>
      key==='[data-u60-copy-plan]'?button:null},preventDefault(){},stopPropagation(){}});
    assert.equal(fields.u60Reps.value,'');
    assert.equal(fields.u60Load.value,'60');
    assert.equal(fields.u60Rpe.value,'');
    assert.equal(h.calls.length,0);
    assert.equal(h.state,originalState);
  }finally{h.close();}
});

test('U60 plan editing control is not an action-registry command and requires an actual user click',()=>{
  const ui=readFileSync(new URL('../src/m26/workflows/occurrence-qa-ui.js',import.meta.url),'utf8');
  assert.match(ui,/data-u60-copy-plan/u);
  assert.ok(ui.includes("scope?.role!=='coach'"));
  assert.ok(ui.includes('applyPlannedDatedSetDraft(view.currentStep,panel)'));
  assert.ok(ui.includes('// no automatic save, sync, RPE or DOM rebuild'));
  assert.doesNotMatch(ui,/data-iberdates-action="u60-copy-plan"/u);
});

test('U60 plan copy applies only user-selected safe targets to empty fields and leaves observed RPE untouched',()=>{
  const values={
    u60Reps:{value:''},
    u60Load:{value:'62.5'},
    u60Rpe:{value:''},
    u60Rir:{value:''},
  };
  const panel={querySelector:selector=>{
    const match=selector.match(/^\[name="([^"]+)"\]$/u);
    return values[match?.[1]]||null;
  }};
  const step={prescription:{reps:'8',plannedLoad:'60 kg',targetRpe:9,targetRir:1}};
  assert.equal(applyPlannedDatedSetDraft(step,panel),1);
  assert.equal(values.u60Reps.value,'8');
  assert.equal(values.u60Load.value,'62.5','never overwrite observed load');
  assert.equal(values.u60Rpe.value,'','target RPE is not an observation');
  assert.equal(values.u60Rir.value,'','target RIR is not an observation');
  assert.equal(applyPlannedDatedSetDraft(step,panel),0,'second click is idempotent');
  assert.equal(applyPlannedDatedSetDraft({prescription:{reps:'8-12'}},panel),0);
  assert.equal(applyPlannedDatedSetDraft(step,null),0);
});

test('U60 Coach prescription draft copy has complete EN/FR/PT translations',()=>{
  for(const source of [
    'Copiar objetivo prescrito a los campos vacíos',
    'Usar objetivo como borrador',
    'No es un resultado real. Revisa cada valor, registra el esfuerzo observado y confirma la serie.',
  ]){
    for(const language of ['en','fr','pt']){
      const output=iberfitSurfaceTranslate(source,{language});
      assert.notEqual(output,source,language+': '+source);
      assert.ok(output.length>12);
    }
  }
});

test('U60 appointment suggestion uses only future confirmed same-owner dates and exact duration in Santiago',()=>{
  const one={id:'appt-1',clientId:CLIENT,sessionId:SESSION,status:'confirmada',
    startAt:'2026-11-12T11:00:00.000Z',endAt:'2026-11-12T12:00:00.000Z'};
  const two={...one,id:'appt-2',startAt:'2026-11-15T11:00:00.000Z',
    endAt:'2026-11-15T12:00:00.000Z'};
  const foreign={...one,id:'foreign',clientId:'20000000-0000-4000-8000-000000000002',
    startAt:'2026-11-16T11:00:00.000Z',endAt:'2026-11-16T12:00:00.000Z'};
  const wrongSession={...one,id:'other-session',sessionId:'30000000-0000-4000-8000-000000000002',
    startAt:'2026-11-17T11:00:00.000Z',endAt:'2026-11-17T12:00:00.000Z'};
  const canceled={...one,id:'cancel',status:'cancelada',
    startAt:'2026-11-18T11:00:00.000Z',endAt:'2026-11-18T12:00:00.000Z'};
  const wrongDuration={...one,id:'short',startAt:'2026-11-19T11:00:00.000Z',
    endAt:'2026-11-19T11:30:00.000Z'};
  const old={...one,id:'old',startAt:'2026-11-08T11:00:00.000Z',
    endAt:'2026-11-08T12:00:00.000Z'};
  const unzoned={...one,id:'ambiguous-time',startAt:'2026-11-20T08:00:00',
    endAt:'2026-11-20T09:00:00'};
  const params={clientId:CLIENT,sessionId:SESSION,durationMinutes:60,
    range:{startDate:'2026-11-10',endDate:'2026-11-30'},
    now:new Date('2026-11-10T12:00:00Z')};
  const rows=[wrongSession,old,canceled,foreign,two,one,wrongDuration,unzoned];
  assert.deepEqual(suggestedConfirmedDatedAppointments(rows,params),
    ['2026-11-12 08:00','2026-11-15 08:00']);
  assert.equal(Object.isFrozen(suggestedConfirmedDatedAppointments(rows,params)),true);
  assert.deepEqual(rows.at(-3),one,'suggestions must not mutate the original appointments');
  const conflict={...one,id:'appt-conflict',
    startAt:'2026-11-12T13:00:00.000Z',endAt:'2026-11-12T14:00:00.000Z'};
  assert.deepEqual(suggestedConfirmedDatedAppointments([...rows,conflict],params),
    ['2026-11-15 08:00'],'ambiguous same-day bookings need manual review');
  assert.deepEqual(suggestedConfirmedDatedAppointments(rows,{...params,durationMinutes:0}),[]);
});

test('U60 load suffix parsing and date ordering avoid Sonar reliability pitfalls',()=>{
  assert.deepEqual(plannedDatedSetDraft({prescription:{reps:'7',plannedLoad:'  62,5 KG  '}}),
    {reps:'7',load:'62.5'});
  assert.deepEqual(plannedDatedSetDraft({prescription:{plannedLoad:'0,25kg'}}),
    {load:'0.25'});
  const whitespace=' '.repeat(25000);
  assert.equal(plannedDatedSetDraft({prescription:{plannedLoad:whitespace+'kg'}}).load,
    undefined,'an empty numeric prefix is not a measured load');
  assert.equal(plannedDatedSetDraft({prescription:{plannedLoad:whitespace+'kX'}}).load,
    undefined,'a long invalid suffix cannot become a load');
  const at=date=>({
    id:'appointment-'+date,clientId:CLIENT,sessionId:SESSION,status:'confirmada',
    startAt:date+'T12:00:00.000Z',endAt:date+'T13:00:00.000Z',
  });
  const result=suggestedConfirmedDatedAppointments([
    at('2027-01-02'),at('2026-12-31'),at('2026-12-29'),
  ],{clientId:CLIENT,sessionId:SESSION,durationMinutes:60,
    range:{startDate:'2026-12-28',endDate:'2027-01-05'},
    now:new Date('2026-12-25T00:00:00.000Z')});
  assert.deepEqual(result,['2026-12-29 09:00','2026-12-31 09:00','2027-01-02 09:00'],
    'ASCII ISO timestamps retain exact chronological ordering across years');
});

test('U60 Coach publication must match the immutable reviewed role/session/date text',()=>{
  const first='2026-11-12 08:00\n2026-11-15 08:00';
  const preview={clientId:CLIENT,roleScope:'coach|'+CLIENT,
    sessionId:SESSION,datesInput:first};
  const input={role:'coach',clientId:CLIENT,sessionId:SESSION,datesInput:first};
  assert.equal(datedCoachPreviewMatchesForm(preview,input),true);
  assert.equal(datedCoachPreviewMatchesForm(preview,{...input,datesInput:first+'\n2026-11-18 08:00'}),false);
  assert.equal(datedCoachPreviewMatchesForm(preview,{...input,sessionId:'30000000-0000-4000-8000-000000000002'}),false);
  assert.equal(datedCoachPreviewMatchesForm(preview,{...input,role:'client'}),false);
  assert.equal(datedCoachPreviewMatchesForm(preview,{...input,clientId:'20000000-0000-4000-8000-000000000002'}),false);
  assert.equal(datedCoachPreviewMatchesForm(null,input),false);
  const code=readFileSync(new URL('../src/m26/workflows/occurrence-qa-ui.js',import.meta.url),'utf8');
  assert.ok(code.includes("if(!datedCoachPreviewMatchesForm(pending,{"));
  assert.ok(code.includes("fail('PREVIEW_FORM_CHANGED')"));
  assert.ok(code.includes("plannedDates:planning?formValue(button,'u60Dates')"));
  assert.ok(code.includes("escape(activePreview?.datesInput||'')"));
  assert.ok(code.includes('data-u60-use-appointments'));
  assert.doesNotMatch(code,/data-iberdates-action="u60-use-appointments"/u);
});

test('U60 appointment assistant messages are translated in all supported locales',()=>{
  for(const source of [
    'Usar citas confirmadas',
    'Solo prepara las fechas a partir de citas existentes; no crea citas ni publica entrenamientos.',
    'Ya hay fechas escritas. Revísalas antes de reemplazarlas.',
    'No hay citas confirmadas compatibles para esta sesión.',
    'Se han incorporado citas confirmadas. Revisa las fechas y verifica antes de publicar.',
    'Has cambiado la sesión o las fechas después de verificarlas. Repite la verificación antes de confirmar.',
  ]){
    for(const language of ['en','fr','pt'])
      assert.notEqual(iberfitSurfaceTranslate(source,{language}),source);
  }
});
