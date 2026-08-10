import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionDraft,
  addCatalogExercise,
  addTrainingGroup,
  duplicateSessionBlock,
  updateSessionBlock,
} from '../src/m26/workflows/session-builder.js';
import {
  createExecution,
  startExecution,
  recordSet,
} from '../src/m26/workflows/session-execution.js';
import {
  renderSessionBuilder,
  renderGuidedExecution,
} from '../src/m26/workflows/session-ui.js';

const exercises=[
  {id:'ex-1',name_es:'Sentadilla goblet',pattern:'sentadilla',equipment:'mancuerna',primary_muscles:['cuádriceps'],cues:['Controla la bajada']},
  {id:'ex-2',name_es:'Peso muerto rumano',pattern:'bisagra',equipment:'mancuerna',primary_muscles:['isquios'],cues:['Mantén la espalda estable']},
  {id:'ex-3',name_es:'Sentadilla a caja',pattern:'sentadilla',equipment:'peso corporal',primary_muscles:['cuádriceps'],cues:['Controla el apoyo']},
];
const byId=new Map(exercises.map((x)=>[x.id,x]));
const catalog={
  count:367,
  get:(id)=>byId.get(id)||null,
  has:(id)=>byId.has(id),
  list:()=>exercises,
  search:(query='',filters={})=>{
    const q=String(query||'').toLowerCase();
    return exercises.filter((x)=>{
      if(q&&!x.name_es.toLowerCase().includes(q))return false;
      if(filters.pattern&&x.pattern!==filters.pattern)return false;
      return true;
    });
  },
};

test('Coach puede duplicar un bloque sin compartir estado mutable',()=>{
  const draft=createSessionDraft({clientId:'C1'});
  addCatalogExercise(draft,'ex-1',catalog,{sets:3,reps:'8',restSeconds:75,targetRpe:7,targetRir:3});
  const original=draft.blocks[0];
  duplicateSessionBlock(draft,original.id);
  assert.equal(draft.blocks.length,2);
  assert.notEqual(draft.blocks[0].id,draft.blocks[1].id);
  assert.equal(draft.blocks[1].exerciseId,'ex-1');
  updateSessionBlock(draft,{blockId:draft.blocks[1].id,field:'reps',value:'10',catalog});
  assert.equal(draft.blocks[0].reps,'8');
  assert.equal(draft.blocks[1].reps,'10');
  assert.equal(draft.previewAccepted,false);
});

test('También duplica grupos completos de forma independiente',()=>{
  const draft=createSessionDraft({clientId:'C1'});
  addTrainingGroup(draft,'biserie',['ex-1','ex-2']);
  const group=draft.blocks[0];
  duplicateSessionBlock(draft,group.id);
  assert.equal(draft.blocks.length,2);
  assert.notEqual(draft.blocks[0].id,draft.blocks[1].id);
  draft.blocks[1].prescriptions['ex-1'].reps='20';
  assert.notEqual(draft.blocks[0].prescriptions['ex-1'].reps,'20');
});

test('Constructor muestra resumen vivo y acción de duplicar',()=>{
  const draft=createSessionDraft({clientId:'C1',title:'Fuerza A',durationMinutes:50});
  addCatalogExercise(draft,'ex-1',catalog,{sets:3,reps:'8',restSeconds:75,targetRpe:7,targetRir:3});
  const html=renderSessionBuilder({draft,catalog,mediaMap:null,role:'coach'});
  assert.match(html,/Resumen de sesión/);
  assert.match(html,/1 ejercicio/);
  assert.match(html,/3 series\/rondas/);
  assert.match(html,/Duplicar/);
});

test('Tras registrar una serie la ejecución cambia a modo descanso y continuación',()=>{
  const session={
    id:'S1',
    clientId:'C1',
    title:'Sesión guiada',
    blocks:[{id:'B1',type:'exercise',exerciseId:'ex-1',sets:2,reps:'8',restSeconds:60,tempo:'controlado',targetRpe:7,targetRir:3,alternativeId:'ex-3'}],
  };
  const execution=createExecution({session,clientId:'C1',executionId:'E1'});
  startExecution(execution);
  recordSet(execution,session,{reps:8,load:'12 kg',rpe:7,rir:3});
  const html=renderGuidedExecution({execution,session,catalog,mediaMap:null,role:'client'});
  assert.match(html,/Serie registrada/);
  assert.match(html,/12 kg/);
  assert.match(html,/Continuar · serie 2/);
  assert.doesNotMatch(html,/data-session-action="complete-set"/);
});

test('Antes de registrar, la ejecución mantiene objetivo y controles secundarios plegados',()=>{
  const session={
    id:'S1',
    clientId:'C1',
    title:'Sesión guiada',
    blocks:[{id:'B1',type:'exercise',exerciseId:'ex-1',sets:1,reps:'8',restSeconds:60,tempo:'controlado',targetRpe:7,targetRir:3,alternativeId:'ex-3'}],
  };
  const execution=createExecution({session,clientId:'C1',executionId:'E2'});
  startExecution(execution);
  const html=renderGuidedExecution({execution,session,catalog,mediaMap:null,role:'client'});
  assert.match(html,/Objetivo de esta serie/);
  assert.match(html,/Completar serie/);
  assert.match(html,/<details class="m26-session-options">/);
  assert.match(html,/Ajustes y alternativas/);
});
