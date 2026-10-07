import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

import {
  createSessionDraft,addCatalogExercise,addTrainingGroup,closeTrainingGroup,exerciseMemoryDraftSuggestion,
  validateSessionDraft,acceptSessionPreview,buildPublishSessionCommand,
} from '../src/m26/workflows/session-builder.js';
import {validateExecutionSnapshot,reconcileExecutionSnapshots} from '../src/m26/workflows/session-recovery.js';

import {
  sessionTemplateSnapshot,createDraftFromSessionTemplate,createReusableSessionDraft,createSessionTemplateRepository,mergeSessionTemplateWorkspaces,
  normalizeSessionTemplateWorkspace,
} from '../src/m26/productivity/session-reuse.js';

const catalog=new Map(Array.from({length:20},(_,index)=>{
  const key='ejercicio-'+index;
  return [key,{id:key,name_es:'Ejercicio '+index}];
}));

test('un descanso de cero permanece idéntico al duplicar y reutilizar plantilla',()=>{
  const draft=createSessionDraft({clientId:'cliente-test'});
  addCatalogExercise(draft,'ejercicio-1',catalog,{restSeconds:0,plannedLoad:'12 kg'});
  const snapshot=sessionTemplateSnapshot(draft);
  assert.equal(snapshot.blocks[0].restSeconds,0);
  const fromTemplate=createDraftFromSessionTemplate({snapshot},{clientId:'cliente-2',catalog});
  assert.equal(fromTemplate.blocks[0].restSeconds,0);
  const reused=createReusableSessionDraft(draft,{clientId:'cliente-3',catalog});
  assert.equal(reused.blocks[0].restSeconds,0);
  assert.equal(fromTemplate.blocks[0].plannedLoad,'12 kg');
});

test('un grupo con cero descanso mantiene su prescripción en plantilla y copia',()=>{
  const draft=createSessionDraft({clientId:'cliente-test'});
  addTrainingGroup(draft,'biserie');
  addCatalogExercise(draft,'ejercicio-1',catalog,{restSeconds:0,plannedLoad:'15 kg'});
  addCatalogExercise(draft,'ejercicio-2',catalog,{restSeconds:0});
  const snapshot=sessionTemplateSnapshot(draft);
  assert.equal(snapshot.blocks[0].prescriptions['ejercicio-1'].restSeconds,0);
  const clone=createDraftFromSessionTemplate({snapshot},{clientId:'cliente-2',catalog});
  assert.equal(clone.blocks[0].prescriptions['ejercicio-2'].restSeconds,0);
  assert.equal(clone.blocks[0].prescriptions['ejercicio-1'].plannedLoad,'15 kg');
  assert.ok(validateSessionDraft(clone,catalog).ok);
});

test('un segundo grupo no puede dejar abandonado un grupo en edición',()=>{
  const draft=createSessionDraft({clientId:'cliente-test'});
  addTrainingGroup(draft,'triserie');
  addCatalogExercise(draft,'ejercicio-1',catalog,{restSeconds:0,plannedLoad:'18 kg'});
  const snapshot=structuredClone(draft);
  assert.throws(()=>addTrainingGroup(draft,'circuito'),/M26_SESSION_ACTIVE_GROUP_OPEN/);
  assert.deepEqual(draft,snapshot);
  assert.equal(draft.blocks.length,1);
  assert.equal(draft.blocks[0].exerciseIds.length,1);
});

test('el cierre explícito conserva prescripción completa al convertir grupo incompleto',()=>{
  const draft=createSessionDraft({clientId:'cliente-test'});
  addTrainingGroup(draft,'triserie');
  addCatalogExercise(draft,'ejercicio-1',catalog,{
    reps:'12',restSeconds:0,plannedLoad:'20 kg',targetRpe:8,targetRir:2,tempo:'3-0-1',
  });
  closeTrainingGroup(draft);
  assert.equal(draft.activeGroupId,undefined);
  assert.equal(draft.blocks[0].type,'exercise');
  assert.equal(draft.blocks[0].restSeconds,0);
  assert.equal(draft.blocks[0].plannedLoad,'20 kg');
  assert.equal(draft.blocks[0].targetRpe,8);
  assert.equal(draft.blocks[0].targetRir,2);
  assert.equal(draft.blocks[0].tempo,'3-0-1');
  assert.equal(draft.blocks[0].sets,3);
  assert.ok(validateSessionDraft(draft,catalog).ok);
});

test('grupos con límites exactos y sin desbordar la capacidad del constructor',()=>{
  const draft=createSessionDraft({clientId:'cliente-test'});
  addTrainingGroup(draft,'circuito');
  for(let i=0;i<12;i++)addCatalogExercise(draft,'ejercicio-'+i,catalog,{restSeconds:0});
  assert.equal(draft.activeGroupId,undefined);
  assert.equal(draft.blocks[0].exerciseIds.length,12);
  assert.ok(validateSessionDraft(draft,catalog).ok);
  addCatalogExercise(draft,'ejercicio-12',catalog,{restSeconds:0});
  assert.equal(draft.blocks[1].type,'exercise');
  assert.equal(draft.blocks[0].exerciseIds.length,12);
  assert.throws(()=>addTrainingGroup(createSessionDraft({clientId:'cliente'}),'biserie',
    ['ejercicio-1','ejercicio-2','ejercicio-3']),/M26_SESSION_GROUP_LIMIT_REACHED/);
});

test('previsualizar y publicar no alteran los descansos prescritos',()=>{
  const draft=createSessionDraft({clientId:'cliente-test'});
  addCatalogExercise(draft,'ejercicio-1',catalog,{restSeconds:0});
  acceptSessionPreview(draft,catalog);
  const published=buildPublishSessionCommand(draft,catalog);
  assert.equal(published.payload.patch.blocks[0].restSeconds,0);
});

test('normalización de versiones offline respeta las prescripciones de cero descanso',()=>{
  const draft=createSessionDraft({clientId:'cliente-test'});
  addCatalogExercise(draft,'ejercicio-1',catalog,{restSeconds:0});
  const snapshot=sessionTemplateSnapshot(draft);
  const workspace=normalizeSessionTemplateWorkspace({
    templates:[{id:'t-1',name:'Test',updatedAt:'2026-10-06T10:00:00Z',
      versions:[{version:1,createdAt:'2026-10-06T10:00:00Z',snapshot}]}],
  });
  assert.equal(workspace.templates[0].versions[0].snapshot.blocks[0].restSeconds,0);
});

test('UX comunica cierre de grupo y diferencia prescripción de ejecución',()=>{
  const ui=fs.readFileSync(new URL('../src/m26/workflows/session-ui.js',import.meta.url),'utf8');
  assert.match(ui,/Cierra primero el grupo activo/);
  assert.match(ui,/conservando sus prescripciones/);
  assert.match(ui,/Puede prepararse como borrador editable; confirma la carga realizada/);
  assert.match(ui,/No se autocompleta la carga realizada/);
});

test('búsqueda restaura foco y cursor después de reconstruir la biblioteca',()=>{
  const controller=fs.readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.match(controller,/replacement\.focus\(\{preventScroll:true\}\)/);
  assert.match(controller,/replacement\.setSelectionRange/);
});

test('referencias previas sin repeticiones no prescriben cero por coerción de null o vacío',()=>{
  const timed=exerciseMemoryDraftSuggestion({
    latest:{setCount:2,sets:[{reps:null,seconds:45,load:{raw:''}}]},
  });
  assert.equal(timed.reps,'45 s');
  const empty=exerciseMemoryDraftSuggestion({
    latest:{sets:[{reps:'',seconds:null,load:{raw:''}}]},
  });
  assert.equal(empty,null);
  const strength=exerciseMemoryDraftSuggestion({
    latest:{setCount:3,sets:[{reps:10,seconds:null,load:{raw:'20 kg'}}]},
  });
  assert.equal(strength.reps,'10');
  const observedZero=exerciseMemoryDraftSuggestion({latest:{sets:[{reps:0,seconds:null,load:{raw:''}}]}});
  assert.equal(observedZero.reps,'0','El cero observado no debe perderse');
  const negative=exerciseMemoryDraftSuggestion({latest:{sets:[{reps:-2,seconds:null,load:{raw:''}}]}});
  assert.equal(negative,null);
});


test('plantilla con descanso indefinido no inventa un descanso de cero',()=>{
  const legacy={title:'Sesión antigua',durationMinutes:45,blocks:[{type:'exercise',exerciseId:'ejercicio-1',name:'Ejercicio',sets:3,reps:'8',restSeconds:null}]};
  const snap=sessionTemplateSnapshot(legacy);
  assert.equal(snap.blocks[0].restSeconds,60);
  const missing=sessionTemplateSnapshot({...legacy,blocks:[{...legacy.blocks[0],restSeconds:''}]});
  assert.equal(missing.blocks[0].restSeconds,60);
  const explicit=sessionTemplateSnapshot({...legacy,blocks:[{...legacy.blocks[0],restSeconds:0}]});
  assert.equal(explicit.blocks[0].restSeconds,0);
});


test('versiones de plantilla crecen tras superar las cinco copias retenidas',()=>{
  const storage=(()=>{const data=new Map();return {getItem:(k)=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:(k)=>data.delete(k)}})();
  let day=0;
  const repository=createSessionTemplateRepository({ownerId:'coach-versiones',storage,now:()=>new Date(Date.UTC(2026,9,6,0,0,day++)),idFactory:()=> 'plantilla-a'});
  const versions=[];
  for(let index=0;index<8;index++){
    const saved=repository.save('Fuerza A',{title:'Entrenamiento '+(index+1),durationMinutes:60,blocks:[{type:'exercise',exerciseId:'ejercicio-1',sets:3,reps:'8',restSeconds:0}]});
    versions.push(saved.version);
    assert.equal(repository.list()[0].version,index+1);
  }
  assert.deepEqual(versions,[1,2,3,4,5,6,7,8]);
  assert.deepEqual(repository.workspace().templates[0].versions.map(v=>v.version),[4,5,6,7,8]);
  assert.equal(repository.get('plantilla-a',8).snapshot.title,'Entrenamiento 8');
  assert.equal(repository.get('plantilla-a',3),null);
});

test('mezcla de versiones offline conserva números monotónicos y divergencia',()=>{
  const at=(v,label)=>({version:v,createdAt:`2026-10-06T00:00:0${v%10}Z`,snapshot:{title:label,durationMinutes:60,blocks:[{type:'exercise',exerciseId:'ejercicio-1',sets:3,reps:'8',restSeconds:0}]}});
  const local={templates:[{id:'left',name:'Fuerza A',latestVersion:8,updatedAt:'2026-10-06T11:00:00Z',versions:[at(6,'Seis'),at(7,'Siete'),at(8,'Ocho')]}]};
  const remote={templates:[{id:'right',name:'Fuerza A',latestVersion:8,updatedAt:'2026-10-06T12:00:00Z',versions:[at(6,'Seis'),at(7,'Siete'),at(8,'Ocho remoto')]}]};
  const merged=mergeSessionTemplateWorkspaces(local,remote);
  const versions=merged.templates[0].versions.map(v=>v.version);
  assert.deepEqual(versions,[6,7,8,9]);
  assert.equal(merged.templates[0].latestVersion,9);
  assert.equal(merged.templates[0].versions.length,4);
  assert.equal(merged.templates[0].versions[2].snapshot.title,'Ocho');
  assert.equal(merged.templates[0].versions[3].snapshot.title,'Ocho remoto');
});

test('repetición rápida exige el RPE observado de la serie nueva y conserva la revisión de datos',()=>{
  const execution=fs.readFileSync(new URL('../src/m26/workflows/session-execution.js',import.meta.url),'utf8');
  const controller=fs.readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  const ui=fs.readFileSync(new URL('../src/m26/workflows/session-ui.js',import.meta.url),'utf8');
  assert.match(execution,/M26_EXECUTION_RPE_OBSERVED_REQUIRED/);
  assert.match(execution,/reps:values\.reps,seconds:values\.seconds,load:values\.load,rpe:observedRpe,rir,actor/);
  assert.doesNotMatch(execution,/recordSet\(execution,session,\{\.\.\.values,actor\}\)/);
  assert.match(controller,/rpe:payload\.rpe,rir:payload\.rir,actor/);
  assert.match(controller,/repeat\.disabled=!\(hasObservedRpe\|\|priorValid\)/);
  assert.match(ui,/data-session-action="repeat-previous-set"[^>]*data-rpe-value/);
  assert.match(ui,/confirma RPE anterior en un toque/);
});


test('recuperación rechaza mezclar dos ejecuciones aunque sean del mismo cliente y sesión',()=>{
  const snapshot=(executionId,status='active',revision=1)=>({
    schemaVersion:1,ownerId:'coach-test',savedAt:'2026-10-07T02:00:00Z',dirty:true,
    sessionRevision:1,appointmentId:null,containsCredentials:false,
    execution:{id:executionId,sessionId:'sesion',clientId:'cliente',status,revision,
      queue:[{blockId:'bloque',exerciseId:'ejercicio',sets:3}],index:0,setIndex:0,accumulatedActiveMs:0},
    session:{id:'sesion',clientId:'cliente'},
  });
  const local=snapshot('ejecucion-local');
  const remote=snapshot('ejecucion-distinta','completed',2);
  assert.equal(validateExecutionSnapshot(local).ok,true);
  assert.equal(validateExecutionSnapshot(remote).ok,true);
  const resolved=reconcileExecutionSnapshots({local,remote});
  assert.equal(resolved.kind,'conflict');
  assert.equal(resolved.conflict.code,'SNAPSHOT_SCOPE_MISMATCH');
  assert.equal(resolved.snapshot.execution.id,'ejecucion-local');
});

test('recuperación permite recibir el cierre remoto cuando la ejecución sí coincide',()=>{
  const base={schemaVersion:1,ownerId:'coach-test',savedAt:'2026-10-07T02:00:00Z',dirty:true,
    sessionRevision:1,appointmentId:null,containsCredentials:false,
    execution:{id:'misma-ejecucion',sessionId:'sesion',clientId:'cliente',status:'active',revision:1,
      queue:[{blockId:'bloque',exerciseId:'ejercicio',sets:3}],index:0,setIndex:0,accumulatedActiveMs:0},
    session:{id:'sesion',clientId:'cliente'}};
  const remote=structuredClone(base);
  remote.execution.status='completed';remote.execution.revision=2;remote.dirty=false;
  assert.equal(reconcileExecutionSnapshots({local:base,remote}).kind,'remote');
});


function recoveryFixture({id='exec-1',revision=3,status='active',dirty=true,results={a:{reps:10,rpe:8,load:'40 kg'}},events=[{id:'ev1',type:'SET_RECORDED',payload:{reps:10}}],feedback=null,activeSetDraft=null,finalFeedbackDraft=null}={}){
  return {schemaVersion:1,ownerId:'coach-test',savedAt:'2026-10-07T02:00:00Z',dirty,
    sessionRevision:1,appointmentId:null,containsCredentials:false,
    execution:{id,sessionId:'sesion',clientId:'cliente',status,revision,
      queue:[{blockId:'bloque',exerciseId:'ejercicio',sets:3}],index:0,setIndex:0,
      accumulatedActiveMs:0,results,events,feedback,activeSetDraft,finalFeedbackDraft},
    session:{id:'sesion',clientId:'cliente'},
  };
}

test('cierre remoto no descarta un resultado local divergente y sin sincronizar',()=>{
  const local=recoveryFixture();
  const remote=recoveryFixture({revision:4,status:'completed',dirty:false,
    results:{a:{reps:10,rpe:8,load:'35 kg'}}});
  const outcome=reconcileExecutionSnapshots({local,remote});
  assert.equal(outcome.kind,'conflict');
  assert.equal(outcome.conflict.code,'REMOTE_SETTLED_LOCAL_EVIDENCE_CONFLICT');
  assert.deepEqual(outcome.snapshot.execution.results,local.execution.results);
});

test('cierre remoto no descarta borrador local ni feedback verdadero',()=>{
  const local=recoveryFixture({activeSetDraft:{values:{reps:'12',rpe:'9',load:'45 kg'}},
    feedback:{sessionRpe:9,pain:true,comment:'Molestia'}});
  const remote=recoveryFixture({revision:4,status:'completed',dirty:false,
    feedback:{sessionRpe:8,pain:false,comment:'Sin dolor'}});
  const outcome=reconcileExecutionSnapshots({local,remote});
  assert.equal(outcome.kind,'conflict');
  assert.equal(outcome.snapshot.execution.feedback.pain,true);
});

test('cierre remoto legítimo mantiene continuidad sin falso conflicto',()=>{
  const local=recoveryFixture();
  const remote=recoveryFixture({revision:4,status:'completed',dirty:false,
    events:[...local.execution.events,{id:'ev2',type:'SESSION_COMPLETED',payload:{}}]});
  assert.equal(reconcileExecutionSnapshots({local,remote}).kind,'remote');
});

test('finalizaciones contradictorias requieren revisión explícita',()=>{
  const local=recoveryFixture({status:'cancelled',dirty:false});
  const remote=recoveryFixture({revision:4,status:'completed',dirty:false});
  const outcome=reconcileExecutionSnapshots({local,remote});
  assert.equal(outcome.kind,'conflict');
  assert.equal(outcome.conflict.code,'SNAPSHOT_FINAL_STATUS_CONFLICT');
});

test('una copia local ya confirmada no impide recibir la finalización válida',()=>{
  const local=recoveryFixture({dirty:false});
  const remote=recoveryFixture({revision:4,status:'completed',dirty:false});
  assert.equal(reconcileExecutionSnapshots({local,remote}).kind,'remote');
});

test('las ayudas TRAIN360 se traducen en las cuatro superficies disponibles',()=>{
  const messages=["Añade ejercicios o cierra el grupo actual antes de crear otro. Si cierras un grupo incompleto, los ejercicios ya añadidos pasarán a ser individuales conservando sus prescripciones.","Puede prepararse como borrador editable; confirma la carga realizada","No se autocompleta la carga realizada","Si el esfuerzo fue igual, confirma RPE anterior en un toque. Si cambió, indica el RPE real antes de repetir. No copia notas ni RIR.","Cierra primero el grupo activo","Completar con el RPE real indicado","Indica primero el RPE real para repetir el trabajo anterior"];
  for(const message of messages){
    assert.equal(iberfitSurfaceTranslate(message,{language:'es'}),message);
    for(const language of ['en','fr','pt']){
      const translated=iberfitSurfaceTranslate(message,{language});
      assert.notEqual(translated,message,`Texto sin traducir: ${language}: ${message}`);
    }
  }
});
