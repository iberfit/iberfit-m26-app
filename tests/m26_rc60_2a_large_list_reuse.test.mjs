import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditInteractiveMarkup,M26_ACTION_REGISTRY} from '../src/m26/ui/interactive-audit.js';

import {
  createReusableSessionDraft,
  createSessionTemplateRepository,
  createDraftFromSessionTemplate,
  sessionTemplateSnapshot,
} from '../src/m26/productivity/session-reuse.js';
import {
  COACH_LARGE_LIST_MIN_ITEMS,
  COACH_LARGE_LIST_FRAME_BUDGET_MS,
  classifyCoachListMeasurement,
} from '../src/m26/productivity/large-list-policy.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const catalog={has:(id)=>['squat','row','press'].includes(id)};

function sourceSession(){
  return {
    id:'SESSION-SOURCE',
    clientId:'CLIENT-A',
    status:'published',
    revision:7,
    visibleToClient:true,
    body:{
      title:'Fuerza A',
      durationMinutes:60,
      publishedAt:'2026-08-15T12:00:00.000Z',
      private_note:'NO-GUARDAR',
      blocks:[
        {id:'OLD-1',type:'exercise',exerciseId:'squat',name:'Sentadilla',sets:4,reps:'8',restSeconds:90,tempo:'controlado',targetRpe:7,targetRir:3,private_note:'NO-GUARDAR'},
        {id:'OLD-2',type:'biserie',exerciseIds:['row','press'],rounds:3,prescriptions:{row:{reps:'10',restSeconds:60,tempo:'controlado',targetRpe:7,targetRir:3},press:{reps:'10',restSeconds:60,tempo:'controlado',targetRpe:7,targetRir:3}}},
      ],
    },
  };
}

function memoryStorage(){
  const map=new Map();
  return {
    getItem:(key)=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    dump:()=>[...map.values()].join('\n'),
  };
}

test('RC60.2A reutiliza sesión como borrador independiente con ids nuevos y preview invalidada',()=>{
  const draft=createReusableSessionDraft(sourceSession(),{clientId:'CLIENT-B',catalog});
  assert.equal(draft.clientId,'CLIENT-B');
  assert.match(draft.title,/Fuerza A · copia/u);
  assert.equal(draft.revision,0);
  assert.equal(draft.status,'draft');
  assert.equal(draft.previewAccepted,false);
  assert.equal(draft.blocks.length,2);
  assert.notEqual(draft.blocks[0].id,'OLD-1');
  assert.notEqual(draft.blocks[1].id,'OLD-2');
  assert.equal('publishedAt' in draft,false);
  assert.equal('visibleToClient' in draft,false);
  assert.doesNotMatch(JSON.stringify(draft),/NO-GUARDAR|private_note/u);
});

test('RC60.2A plantilla elimina clientId y campos ajenos a la prescripción',()=>{
  const draft=createReusableSessionDraft(sourceSession(),{clientId:'CLIENT-B',catalog,titleSuffix:''});
  draft.medicalNotes='NO-GUARDAR';
  const snapshot=sessionTemplateSnapshot(draft);
  assert.equal('clientId' in snapshot,false);
  assert.equal('medicalNotes' in snapshot,false);
  assert.doesNotMatch(JSON.stringify(snapshot),/CLIENT-B|NO-GUARDAR|medicalNotes/u);
});

test('RC60.2A repositorio de plantillas es owner scoped y conserva versiones acotadas',()=>{
  const storage=memoryStorage();
  let tick=0;
  const repo=createSessionTemplateRepository({
    ownerId:'coach-1',
    storage,
    now:()=>new Date(`2026-08-16T12:0${tick++}:00.000Z`),
    idFactory:()=> 'TPL-1',
  });
  const draft=createReusableSessionDraft(sourceSession(),{clientId:'CLIENT-B',catalog,titleSuffix:''});
  const v1=repo.save('Fuerza base',draft);
  draft.durationMinutes=65;
  const v2=repo.save('Fuerza base',draft);
  assert.equal(v1.id,'TPL-1');
  assert.equal(v1.version,1);
  assert.equal(v2.version,2);
  assert.equal(repo.list()[0].version,2);
  assert.equal(repo.get('TPL-1',1).snapshot.durationMinutes,60);
  assert.equal(repo.get('TPL-1').snapshot.durationMinutes,65);
  assert.match(repo.key,/coach-1/u);
  assert.doesNotMatch(storage.dump(),/CLIENT-B|medicalNotes|restingHeartRate|hrvMs/iu);
});

test('RC60.2A plantilla crea borrador para otro cliente sin reutilizar ids ni revisión',()=>{
  const storage=memoryStorage();
  const repo=createSessionTemplateRepository({ownerId:'coach-1',storage,idFactory:()=> 'TPL-X'});
  const source=createReusableSessionDraft(sourceSession(),{clientId:'CLIENT-A',catalog,titleSuffix:''});
  repo.save('Base general',source);
  const next=createDraftFromSessionTemplate(repo.get('TPL-X'),{clientId:'CLIENT-C',catalog});
  assert.equal(next.clientId,'CLIENT-C');
  assert.equal(next.revision,0);
  assert.equal(next.previewAccepted,false);
  assert.notEqual(next.id,source.id);
  assert.notEqual(next.blocks[0].id,source.blocks[0].id);
});

test('RC60.2A política de lista grande exige tamaño y coste medidos simultáneamente',()=>{
  assert.equal(COACH_LARGE_LIST_MIN_ITEMS,120);
  assert.equal(COACH_LARGE_LIST_FRAME_BUDGET_MS,24);
  assert.equal(classifyCoachListMeasurement({count:119,elapsedMs:100}).virtualizationRecommended,false);
  assert.equal(classifyCoachListMeasurement({count:500,elapsedMs:12}).virtualizationRecommended,false);
  const measured=classifyCoachListMeasurement({count:500,visibleCount:430,elapsedMs:31});
  assert.equal(measured.virtualizationRecommended,true);
  assert.equal(measured.reason,'measured_large_and_slow');
});

test('RC60.2A instrumenta la lista de clientes antes de introducir virtualización',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  const policy=read('src/m26/productivity/large-list-policy.js');
  const pkg=read('package.json');
  assert.match(workflow,/classifyCoachListMeasurement/u);
  assert.match(workflow,/markCoachListMeasurement/u);
  assert.match(workflow,/data-client-grid/u);
  assert.match(policy,/data-list-virtualization-recommended/u);
  assert.doesNotMatch(pkg,/tanstack\/virtual/iu);
});

test('RC60.2A Sesiones ofrece reutilizar original sin mutarla',()=>{
  const route=read('src/m26/modules/route-render.js');
  const workflow=read('src/m26/app/workflow-controller.js');
  const app=read('src/m26/app/application.js');
  assert.match(route,/data-workflow-action="reuse-session"/u);
  assert.match(route,/Reutilizar como borrador/u);
  assert.match(workflow,/function reuseSession/u);
  assert.match(workflow,/sourceSession/u);
  assert.match(app,/createReusableSessionDraft/u);
  assert.match(app,/sourceSession/u);
});

test('RC60.2A constructor expone plantillas versionadas con callbacks controlados',()=>{
  const ui=read('src/m26/workflows/session-ui.js');
  const controller=read('src/m26/workflows/session-controller.js');
  const app=read('src/m26/app/application.js');
  assert.match(ui,/data-session-template-select/u);
  assert.match(ui,/data-session-template-name/u);
  assert.match(ui,/data-session-action="load-template"/u);
  assert.match(ui,/data-session-action="save-template"/u);
  assert.match(controller,/context\.saveTemplate/u);
  assert.match(controller,/context\.loadTemplate/u);
  assert.match(app,/createSessionTemplateRepository/u);
  assert.match(app,/sessionTemplateRepository/u);
});

test('RC60.2A registra load-template y save-template como acciones Coach Admin auditables',()=>{
  assert.deepEqual(M26_ACTION_REGISTRY['load-template'],{roles:['admin','coach'],domain:'session'});
  assert.deepEqual(M26_ACTION_REGISTRY['save-template'],{roles:['admin','coach'],domain:'session'});
  const markup='<button type="button" data-session-action="load-template" disabled aria-disabled="true">Usar plantilla</button><button type="button" data-session-action="save-template">Guardar nueva versión</button>';
  assert.deepEqual(auditInteractiveMarkup(markup),{ok:true,errors:[]});
});

test('RC60.2A plantillas son locales y no amplían backend ni autorización',()=>{
  const reuse=read('src/m26/productivity/session-reuse.js');
  assert.match(reuse,/globalThis\.localStorage/u);
  assert.doesNotMatch(reuse,/supabase|commandBus|transport\.execute|service_role/iu);
  assert.match(reuse,/session-templates:/u);
});

test('RC60.2A PWA versiona reuse measurement y conserva RC60.1',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(sw,/VERSION='m26-rc60-2a'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc60-1'/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc60-2a[^\n]*m26-rc60-1/u);
  assert.match(sw,/"\/src\/m26\/productivity\/session-reuse\.js"/u);
  assert.match(sw,/"\/src\/m26\/productivity\/large-list-policy\.js"/u);
});

test('RC60.2A cierra reuse measurement sin cerrar prematuramente RC60.2',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(roadmap,/RC60=IN_PROGRESS_COACH_PRODUCTIVITY/u);
  assert.match(roadmap,/RC60_2=IN_PROGRESS_LARGE_LIST_REUSE/u);
  assert.match(roadmap,/RC60_2A=CLOSED_REUSE_MEASUREMENT/u);
  assert.match(roadmap,/RC60_2B=IN_PROGRESS_VIRTUALIZATION_DECISION_BULK_PREP/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
});