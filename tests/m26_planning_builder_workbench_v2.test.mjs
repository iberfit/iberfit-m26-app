import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {
  createSessionDraft,
  addCatalogExercise,
  addTrainingGroup,
  closeTrainingGroup,
  updateSessionBlock,
  validateSessionDraft,
} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';
import {renderSessionBuilder,renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {
  createReusableSessionDraft,
  sessionTemplateSnapshot,
} from '../src/m26/productivity/session-reuse.js';
import {renderPlanningRoute} from '../src/m26/modules/route-render.js';

const data=JSON.parse(
  fs.readFileSync(
    new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url)
  )
);
const catalog=createExerciseCatalog(data);

function prescribedDraft(){
  const draft=createSessionDraft({
    clientId:'client-planning-v2',
    title:'Fuerza base A',
    durationMinutes:55,
  });
  const exerciseId=catalog.list()[0].id;
  addCatalogExercise(
    draft,
    exerciseId,
    catalog,
    {
      sets:3,
      reps:'8',
      plannedLoad:'22.5 kg',
      restSeconds:90,
      tempo:'3-1-1',
      targetRpe:7.5,
      targetRir:2,
      prescriptionNotes:'Mantener control técnico y rango completo.',
      progression:'Subir carga solo si completa las series con RIR 2 o mayor.',
    }
  );
  return draft;
}

test('constructor conserva carga, indicaciones y progresión como prescripción opcional',()=>{
  const draft=prescribedDraft();
  const block=draft.blocks[0];

  assert.equal(block.plannedLoad,'22.5 kg');
  assert.equal(block.prescriptionNotes,'Mantener control técnico y rango completo.');
  assert.match(block.progression,/Subir carga/);
  assert.equal(validateSessionDraft(draft,catalog).ok,true);

  updateSessionBlock(draft,{
    blockId:block.id,
    field:'plannedLoad',
    value:'25 kg',
    catalog,
  });
  updateSessionBlock(draft,{
    blockId:block.id,
    field:'prescriptionNotes',
    value:'Técnica antes que carga.',
    catalog,
  });
  updateSessionBlock(draft,{
    blockId:block.id,
    field:'progression',
    value:'Retroceder carga si pierde el rango.',
    catalog,
  });

  assert.equal(block.plannedLoad,'25 kg');
  assert.equal(block.prescriptionNotes,'Técnica antes que carga.');
  assert.equal(block.progression,'Retroceder carga si pierde el rango.');
  assert.equal(validateSessionDraft(draft,catalog).ok,true);
});

test('plantillas y duplicación reutilizable no pierden la prescripción extendida',()=>{
  const draft=prescribedDraft();
  const snapshot=sessionTemplateSnapshot(draft);
  assert.equal(snapshot.blocks[0].plannedLoad,'22.5 kg');
  assert.match(snapshot.blocks[0].prescriptionNotes,/control técnico/);
  assert.match(snapshot.blocks[0].progression,/Subir carga/);

  const copy=createReusableSessionDraft(
    {body:draft},
    {clientId:'client-copy',catalog}
  );

  assert.equal(copy.blocks[0].plannedLoad,'22.5 kg');
  assert.equal(copy.blocks[0].prescriptionNotes,draft.blocks[0].prescriptionNotes);
  assert.equal(copy.blocks[0].progression,draft.blocks[0].progression);
});

test('constructor V2 prioriza campos operativos y conserva toda la estructura avanzada',()=>{
  const draft=prescribedDraft();
  const html=renderSessionBuilder({draft,catalog,templates:[],role:'coach'});

  assert.match(html,/data-session-builder-workbench-v2/);
  assert.match(html,/Constructor de sesión/);
  assert.match(html,/m26-builder-session-strip/);
  assert.match(html,/m26-builder-workbench-grid/);
  assert.match(html,/Carga planificada/);
  assert.match(html,/data-session-block-field="plannedLoad"/);
  assert.match(html,/Prescripción y alternativas/);
  assert.match(html,/data-session-block-field="prescriptionNotes"/);
  assert.match(html,/data-session-block-field="progression"/);
  assert.match(html,/data-session-action="duplicate-block"/);
  assert.match(html,/data-session-action="move-up"/);
  assert.match(html,/data-session-action="move-down"/);
  assert.match(html,/data-session-template-tools/);
  assert.match(html,/data-group-type="biserie"/);
  assert.match(html,/data-group-type="triserie"/);
  assert.match(html,/data-group-type="circuito"/);
  assert.match(html,/data-group-type="amrap"/);
  assert.match(html,/data-group-type="tabata"/);
  assert.match(html,/data-session-action="preview"/);
  assert.doesNotMatch(html,/onclick=/);
});

test('prescripción extendida llega a Live sin autocompletar la carga realizada',()=>{
  const draft=prescribedDraft();
  const execution=createExecution({session:draft,clientId:draft.clientId});

  assert.equal(execution.queue[0].prescription.plannedLoad,'22.5 kg');
  assert.match(execution.queue[0].prescription.prescriptionNotes,/control técnico/);
  assert.match(execution.queue[0].prescription.progression,/Subir carga/);

  startExecution(execution);
  const html=renderGuidedExecution({
    execution,
    session:draft,
    catalog,
    role:'client',
  });

  assert.match(html,/Carga planificada/);
  assert.match(html,/22\.5 kg/);
  assert.match(html,/No se autocompleta/);
  assert.match(html,/Indicaciones del Coach/);
  assert.match(html,/Progresión prevista/);
  assert.match(html,/no modifica automáticamente la ejecución de hoy/i);
  assert.match(html,/data-set-field="load">/);
  assert.doesNotMatch(html,/data-set-field="load"[^>]*value=/);
});

test('prescripción extendida funciona también dentro de grupos',()=>{
  const draft=createSessionDraft({clientId:'client-group'});
  const exerciseId=catalog.list()[0].id;

  addTrainingGroup(draft,'amrap');
  const group=draft.blocks[0];
  addCatalogExercise(draft,exerciseId,catalog,{
    reps:'10',
    plannedLoad:'peso corporal',
    prescriptionNotes:'Ritmo sostenible.',
    progression:'Añadir una ronda cuando complete el objetivo.',
  });
  closeTrainingGroup(draft);

  const converted=draft.blocks[0];
  assert.equal(converted.type,'exercise');
  assert.equal(converted.plannedLoad,'peso corporal');
  assert.equal(converted.prescriptionNotes,'Ritmo sostenible.');
  assert.match(converted.progression,/Añadir una ronda/);
});

test('Planificación V2 orienta del ciclo a la sesión sin saltarse publicación',()=>{
  const vm={
    role:'coach',
    canEdit:true,
    currentCycle:{
      id:'cycle-1',
      body:{
        name:'Ciclo Base',
        startDate:'2026-09-01',
        endDate:'2026-10-31',
        modality:'hibrido',
        weeklyFrequency:3,
        sessionDurationMinutes:60,
        goal:'Mejorar fuerza y adherencia.',
      },
    },
    iriPlanningSeed:null,
    cycles:[],
    sessions:[],
    cycleCounts:{approved:1},
    sessionCounts:{published:0},
  };

  const html=renderPlanningRoute(vm);
  assert.match(html,/data-planning-workbench-v2/);
  assert.match(html,/Siguiente decisión/);
  assert.match(html,/Construir y revisar sesiones/);
  assert.match(html,/m26-planning-current-cycle/);
  assert.match(html,/data-workflow-action="open-session-builder"/);
  assert.match(html,/data-workflow-action="validate-plan"/);
  assert.match(html,/Validar cambios/);
  assert.match(html,/Versiones y publicación/);
  assert.match(html,/Sesiones del ciclo/);
  assert.match(html,/Mejorar fuerza y adherencia/);
});

test('Planificación V2 mantiene un camino funcional para crear el primer ciclo',()=>{
  const html=renderPlanningRoute({
    role:'coach',
    canEdit:true,
    currentCycle:null,
    iriPlanningSeed:null,
    cycles:[],
    sessions:[],
    cycleCounts:{approved:0},
    sessionCounts:{published:0},
  });

  assert.match(html,/href="#m26-planning-cycle-editor"/);
  assert.match(html,/id="m26-planning-cycle-editor"/);
  assert.match(html,/Definir ciclo/);
  assert.doesNotMatch(html,/data-m26-planning-focus-cycle/);
});

test('capa visual V2 cubre desktop, tablet y móvil sin depender de drag and drop',()=>{
  const css=fs.readFileSync(
    new URL('../src/m26/design/dark-iberfit-v2.css',import.meta.url),
    'utf8'
  );
  assert.match(css,/PLANNING_BUILDER_WORKBENCH_V2_BEGIN/);
  assert.match(css,/\.m26-builder-workbench-grid/);
  assert.match(css,/@media \(max-width:840px\)/);
  assert.match(css,/@media \(max-width:520px\)/);
  assert.match(css,/PLANNING_BUILDER_WORKBENCH_V2_END/);

  const source=fs.readFileSync(
    new URL('../src/m26/workflows/session-ui.js',import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source,/draggable="true"/);
});
