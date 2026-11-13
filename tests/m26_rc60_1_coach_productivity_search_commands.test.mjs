import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import Fuse from '../src/m26/vendor/fuse-7.5.0.basic.min.js';
import {
  FUSE_COACH_PRODUCTIVITY_VERSION,
  rankCoachClientDocuments,
  buildCoachCommandEntries,
  rankCoachCommandEntries,
  normalizeCoachSavedView,
  coachProductivityStorageKey,
  createCoachProductivityController,
} from '../src/m26/productivity/coach-productivity.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC60.1 fija Fuse.js 7.5.0 y tolera errores tipográficos reales',()=>{
  assert.equal(FUSE_COACH_PRODUCTIVITY_VERSION,'7.5.0');
  assert.equal(Fuse.version,'7.5.0');
  const docs=[
    {id:'1',name:'Claudia Fuentes',text:'claudia fuentes presencial fuerza',iri:'completed',modality:'presencial',stage:'active',priority:2},
    {id:'2',name:'Mario Soto',text:'mario soto online movilidad',iri:'progress',modality:'online',stage:'evaluation',priority:1},
  ];
  const result=rankCoachClientDocuments(docs,{query:'clauda funtes'});
  assert.equal(result[0]?.id,'1');
});

test('RC60.1 conserva filtros exactos y prioridad cuando la búsqueda está vacía',()=>{
  const docs=[
    {id:'A',name:'Ana',text:'ana presencial',iri:'completed',modality:'presencial',stage:'active',priority:4},
    {id:'B',name:'Berta',text:'berta presencial',iri:'completed',modality:'presencial',stage:'active',priority:1},
    {id:'C',name:'Carla',text:'carla online',iri:'progress',modality:'online',stage:'evaluation',priority:0},
  ];
  const result=rankCoachClientDocuments(docs,{
    filters:{iri:'completed',modality:'presencial',stage:'active'},
    sort:'priority',
  });
  assert.deepEqual(result.map((item)=>item.id),['B','A']);
});

test('RC60.1 command palette solo indexa áreas y clientes que recibe dentro del alcance',()=>{
  const entries=buildCoachCommandEntries({
    areas:[{area:'hoy',label:'Hoy'},{area:'clientes',label:'Clientes'},{area:'clientes',label:'Ver clientes'}],
    clients:[{id:'C1',name:'Laura Pérez',modality:'presencial',profile:{primaryObjective:'fuerza'}}],
    selectedClientId:'C1',
  });
  assert.deepEqual(entries.map((item)=>item.id),['area:hoy','area:clientes','client:C1']);
  assert.equal(rankCoachCommandEntries(entries,'clietnes')[0]?.target,'clientes');
  assert.equal(rankCoachCommandEntries(entries,'laura')[0]?.target,'C1');
});

test('RC60.1 vistas guardadas se limitan a filtros operativos y no guardan salud',()=>{
  const view=normalizeCoachSavedView({
    id:'v1',name:'Seguimiento activo',query:'fuerza',iri:'completed',modality:'presencial',stage:'active',sort:'priority',
    restingHeartRate:52,hrvMs:48,medicalNotes:'no debe persistir',
  });
  assert.deepEqual(Object.keys(view),['id','name','query','iri','modality','stage','sort','updatedAt']);
  assert.equal('restingHeartRate' in view,false);
  assert.equal('hrvMs' in view,false);
  assert.equal('medicalNotes' in view,false);
  assert.match(coachProductivityStorageKey('coach-123'),/^iberfit-m26:coach-productivity:/u);
});

test('RC60.1 integra ranking Fuse en la lista de clientes existente',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  assert.match(workflow,/rankCoachClientDocuments/u);
  assert.match(workflow,/const ranked=rankCoachClientDocuments/u);
  assert.match(workflow,/data-client-text/u);
});

test('RC60.1 shell Coach Admin expone launcher y palette accesible con Ctrl Cmd K',()=>{
  const shell=read('src/m26/shell/shell-render.js');
  const productivity=read('src/m26/productivity/coach-productivity.js');
  assert.match(shell,/data-coach-command-open/u);
  assert.match(shell,/data-coach-command-palette/u);
  assert.match(shell,/role="dialog"/u);
  assert.match(productivity,/event\.ctrlKey\|\|event\.metaKey/u);
  assert.match(productivity,/key==='escape'/u);
});

test('RC60.1 Clientes ofrece vistas guardadas y recientes sin mutar backend',()=>{
  const route=read('src/m26/modules/route-render.js');
  const productivity=read('src/m26/productivity/coach-productivity.js');
  assert.match(route,/data-coach-saved-view/u);
  assert.match(route,/data-coach-save-view/u);
  assert.match(route,/data-coach-recents/u);
  assert.match(productivity,/globalThis\.localStorage/u);
  assert.doesNotMatch(productivity,/supabase|commandBus|transport\.execute|service_role/iu);
});

test('RC60.1 application monta y destruye productivity con owner aislado',()=>{
  const app=read('src/m26/app/application.js');
  assert.match(app,/createCoachProductivityController/u);
  assert.match(app,/ownerId/u);
  assert.match(app,/\{name:'productivity',controller:productivity\}/u);
  assert.match(app,/productivity\?\.destroy/u);
});

test('RC60.1 vendor Fuse es same-origin y licencia Apache se conserva',()=>{
  const module=read('src/m26/productivity/coach-productivity.js');
  const vendor=read('src/m26/vendor/fuse-7.5.0.basic.min.js');
  const license=read('src/m26/vendor/fuse-7.5.0.LICENSE.txt');
  assert.match(module,/\.\.\/vendor\/fuse-7\.5\.0\.basic\.min\.js/u);
  assert.match(vendor,/Fuse\.js v7\.5\.0/u);
  assert.match(license,/Apache License/u);
  assert.doesNotMatch(module,/cdn\.jsdelivr|unpkg|https:\/\//u);
});

test('RC60.1 PWA versiona productividad y conserva RC59.6 como lineage',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc60-1[^\n]*m26-rc59-6/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc60-1[^\n]*m26-rc59-6/u);
  assert.match(sw,/"\/src\/m26\/productivity\/coach-productivity\.js"/u);
  assert.match(sw,/"\/src\/m26\/vendor\/fuse-7\.5\.0\.basic\.min\.js"/u);
});

test('RC60.1 conserva cierre histórico de Search Command Surface y rails transversales',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(roadmap,/RC60_1=CLOSED_SEARCH_COMMAND_SURFACE/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
});

test('P1 Coach productividad no clona el historial completo al navegar, renderizar ni abrir la paleta', async ()=>{
  let fullReads=0, legacySubscriptions=0, directoryReads=0;
  const listeners=new Map();
  const recents={innerHTML:''},results={innerHTML:''},status={textContent:''};
  const root={
    addEventListener(name,listener){listeners.set(name,listener);},
    removeEventListener(name,listener){if(listeners.get(name)===listener)listeners.delete(name);},
    querySelector(selector){
      if(selector==='[data-coach-recents]')return recents;
      if(selector==='[data-coach-command-results]')return results;
      if(selector==='[data-coach-command-status]')return status;
      return null;
    },
    querySelectorAll(){return [];},
  };
  let invalidation=null;
  const store={
    getState(){fullReads+=1;throw Error('U38_FULL_ARCHIVE_CLONE_FORBIDDEN_ON_NAVIGATION');},
    getNavigationSnapshot(){return Object.freeze({identity:Object.freeze({role:'coach',id:'coach-1'})});},
    getRouteAuthorizationSnapshot(){
      directoryReads+=1;
      return {
        identity:{id:'coach-1',role:'coach'},
        selectedClientId:'C1',
        collections:{clients:[{id:'C1',name:'Laura Pérez',modality:'presencial'}]},
      };
    },
    subscribeInvalidation(fn){invalidation=fn;return ()=>{invalidation=null;};},
    subscribe(){legacySubscriptions+=1;throw Error('UNBOUNDED_SUBSCRIBE_FORBIDDEN');},
  };
  const storage={
    getItem:()=>JSON.stringify({recents:['C1']}),
    setItem:()=>{},
    removeItem:()=>{},
  };
  const controller=createCoachProductivityController({root,store,ownerId:'coach-1',storage});
  controller.mount();
  await Promise.resolve();
  assert.match(recents.innerHTML,/Laura Pérez/u);
  assert.ok(controller.renderPalette('Laura').length>0);
  assert.match(results.innerHTML,/Laura Pérez/u);
  listeners.get('m26:shell-rendered')?.();
  invalidation?.();
  await Promise.resolve();
  assert.match(recents.innerHTML,/Laura Pérez/u);
  assert.ok(directoryReads>=2);
  assert.equal(fullReads,0);
  assert.equal(legacySubscriptions,0);
  controller.destroy();
  assert.equal(invalidation,null);
});

test('P1 productividad conserva fallback de store legacy sin proyecciones',async()=>{
  const listeners=new Map();
  let reads=0,unsubscribed=false;
  const root={
    addEventListener(name,handler){listeners.set(name,handler);},
    removeEventListener(name,handler){if(listeners.get(name)===handler)listeners.delete(name);},
    querySelector:()=>null,
    querySelectorAll:()=>[],
  };
  const store={
    getState(){reads+=1;return {identity:{role:'coach'},collections:{clients:[]},selectedClientId:null};},
    subscribe(){return ()=>{unsubscribed=true;};},
  };
  const controller=createCoachProductivityController({root,store,ownerId:'legacy-coach',storage:{getItem:()=>null}});
  controller.mount();
  await Promise.resolve();
  assert.ok(reads>=1);
  controller.destroy();
  assert.equal(unsubscribed,true);
});
