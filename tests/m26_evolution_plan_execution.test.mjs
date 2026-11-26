import test from 'node:test';
import assert from 'node:assert/strict';

import {buildPlanExecutionSummary} from '../src/m26/engagement/progress-engine.js';
import {originalSeriesCoverage} from '../src/m26/domain/session-execution-truth.js';
import {renderProgressRoute} from '../src/m26/modules/route-render.js';

const NOW=new Date('2026-09-12T12:00:00Z');

test('Evolución fechada usa la prescripción congelada, no el plan modificado después',()=>{
 const block={id:'b1',type:'exercise',exerciseId:'sq',sets:2,reps:'8'};
 const sourceSnapshot={clientId:'c1',sessionId:'s1',cycleId:'cycle',title:'Sesión original',blocks:[block],queue:[{blockId:'b1',exerciseId:'sq',sets:2,prescription:{reps:'8'}}]};
 const execution={id:'e-date',clientId:'c1',sessionId:'s1',occurrenceId:'o1',sourceRevision:2,status:'completed',syncStatus:'clean',completedAt:'2026-09-11T11:00:00Z',sourceSnapshot,results:[{exerciseId:'sq',setNumber:1,reps:8},{exerciseId:'sq',setNumber:2,reps:8}]};
 const state={collections:{sessions:[{id:'s1',clientId:'c1',title:'Plan actualizado',blocks:[{...block,sets:8}]}],sessionExecutions:[execution]}};
 for(const requireSnapshot of [true,false]){
  const opts={now:NOW,days:28,civilPeriod:true,requireSnapshot};
  const valid=buildPlanExecutionSummary(state,'c1',opts);assert.equal(valid.comparedSessions,1);assert.equal(valid.plannedSets,2);assert.equal(valid.recordedSets,2);assert.equal(valid.latest.sessionTitle,'Sesión original');
  for(const invalid of [{...execution,sourceRevision:null},{...execution,sourceSnapshot:{...sourceSnapshot,clientId:'otro'}},{...execution,body:{sourceSnapshot:{...sourceSnapshot,cycleId:'otro'}}}]){
   const r=buildPlanExecutionSummary({...state,collections:{...state.collections,sessionExecutions:[invalid]}},'c1',opts);assert.equal(r.comparedSessions,0);assert.equal(r.unmatchedExecutions,1);
  }
 }
});

function frozenCoverageFixture(){
 const blocks=[{id:'b1',type:'exercise',exerciseId:'sq',sets:2},{id:'b2',type:'exercise',exerciseId:'row',sets:1}];
 const snapshot={sessionId:'s1',blocks};
 const row=(exerciseId,blockId,setNumber)=>({exerciseId,blockId,setNumber,reps:8});
 const rows=[row('sq','b1',1),row('sq','b1',2),row('row','b2',1)];
 const execution={id:'e1',clientId:'c1',sessionId:'s1',status:'completed',syncStatus:'clean',completedAt:'2026-09-11T11:00:00Z',planSnapshot:snapshot,results:rows};
 return {snapshot,execution,rows,row};
}
test('GX: igualdad de recuentos no acredita correspondencia cuando cambia un ejercicio',()=>{
 const {snapshot,execution,rows,row}=frozenCoverageFixture();
 const changed={...execution,results:[rows[0],rows[1],row('press','b2',1)]};
 const state={collections:{sessionExecutions:[changed]}};
 const p=buildPlanExecutionSummary(state,'c1',{now:NOW,requireSnapshot:true});
 assert.equal(p.plannedSets,3);assert.equal(p.recordedSets,3);assert.equal(p.matchedRecordedSets,2);assert.equal(p.unlinkedRecordedSets,1);assert.equal(p.unresolvedPlannedSets,1);assert.equal(p.asPlannedSessions,0);
 const good=buildPlanExecutionSummary({collections:{sessionExecutions:[execution]}},'c1',{now:NOW,requireSnapshot:true});
 assert.equal(good.asPlannedSessions,1);assert.equal(good.matchedRecordedSets,3);assert.equal(good.unresolvedPlannedSets,0);
});
test('GX: duplicado y omisión simultánea no certifican la serie',()=>{
 const {snapshot,execution,rows}=frozenCoverageFixture();
 const c=originalSeriesCoverage({...execution,results:[...rows,rows[0]],skippedSets:[rows[1]]},snapshot);
 assert.equal(c.matchedRecordedSets,1);assert.equal(c.matchedSkippedSets,0);assert.equal(c.conflictingCoordinates,2);assert.equal(c.unresolvedPlannedSets,2);assert.equal(c.completeEvidence,false);
 const omitted=originalSeriesCoverage({...execution,results:[rows[0],rows[2]],skippedSets:[rows[1]]},snapshot);assert.equal(omitted.matchedSkippedSets,1);assert.equal(omitted.unresolvedPlannedSets,0);
});
test('GX: ejercicio repetido requiere bloque o clave original inequívoca',()=>{
 const {snapshot,execution,row}=frozenCoverageFixture();const p={...snapshot,blocks:[{id:'b1',type:'exercise',exerciseId:'sq',sets:1},{id:'b2',type:'exercise',exerciseId:'sq',sets:1}]};
 const ambiguous=originalSeriesCoverage({...execution,results:[{exerciseId:'sq',setNumber:1,reps:8}]},p);assert.equal(ambiguous.matchedRecordedSets,0);assert.equal(ambiguous.conflictingCoordinates,2);
 const scoped=originalSeriesCoverage({...execution,results:{'b1:sq:1':{exerciseId:'sq',setNumber:1,reps:8},'b2:sq:1':{exerciseId:'sq',setNumber:1,reps:8}}},p);assert.equal(scoped.matchedRecordedSets,2);assert.equal(scoped.completeEvidence,true);
 const forged=originalSeriesCoverage({...execution,results:{'b1:sq:1':row('sq','b2',1)}},p);assert.equal(forged.matchedRecordedSets,0);assert.equal(forged.completeEvidence,false);
});
test('GX: alias contradictorios, registros no observados y claves incompatibles se excluyen',()=>{
 const {snapshot,execution,rows}=frozenCoverageFixture();
 for(const bad of [{...rows[0],set_number:2},{...rows[0],completed:false},{...rows[0],exercise_id:'row'},{exerciseId:'sq',blockId:'b1',setNumber:1,rpe:7}]){
  const c=originalSeriesCoverage({...execution,results:[bad,...rows]},snapshot);assert.ok(c.matchedRecordedSets<3);assert.equal(c.completeEvidence,false);
 }
 const alias=originalSeriesCoverage({...execution,body:{results:[rows[0]]}},snapshot);assert.equal(alias.collectionConflict,true);assert.equal(alias.matchedRecordedSets,0);
 const wrongKey=originalSeriesCoverage({...execution,results:{'row:1':rows[0]}},snapshot);assert.equal(wrongKey.matchedRecordedSets,0);assert.equal(wrongKey.completeEvidence,false);
});

function results(count){
  const out={};
  for(let index=1;index<=count;index+=1){
    out[`set-${index}`]={exerciseId:index<=3?'squat':'row',setNumber:index,reps:10,rpe:7};
  }
  return out;
}

function sampleState(){
  return {
    collections:{
      sessions:[{
        id:'s1',
        clientId:'c1',
        title:'Fuerza base',
        blocks:[
          {id:'b1',type:'exercise',exerciseId:'squat',sets:3,reps:'10'},
          {id:'b2',type:'circuit',exerciseIds:['row','press'],rounds:2},
        ],
      }],
      sessionExecutions:[
        {
          id:'e1',clientId:'c1',sessionId:'s1',status:'completed',syncStatus:'clean',
          completedAt:'2026-09-10T11:00:00Z',results:results(7),skippedSets:{},events:[],
        },
        {
          id:'e2',clientId:'c1',sessionId:'s1',status:'completed',syncStatus:'clean',
          completedAt:'2026-09-11T11:00:00Z',results:results(5),
          skippedSets:{
            a:{exerciseId:'press',setNumber:1,reason:'Ajuste contextual'},
            b:{exerciseId:'press',setNumber:2,reason:'Ajuste contextual'},
          },
          events:[{type:'EXERCISE_SUBSTITUTED',at:'2026-09-11T10:15:00Z'}],
        },
        {
          id:'e-unmatched',clientId:'c1',sessionId:'missing-session',status:'completed',syncStatus:'clean',
          completedAt:'2026-09-11T12:00:00Z',results:results(2),events:[],
        },
      ],
      appointments:[],
      checkins:[],
      iriAssessments:[],
      wearableDailySummaries:[],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };
}

test('Evolución compara planificación publicada y ejecución confirmada sin score ni juicio automático',()=>{
  const summary=buildPlanExecutionSummary(sampleState(),'c1',{now:NOW,days:28});
  assert.equal(summary.comparedSessions,2);
  assert.equal(summary.unmatchedExecutions,1);
  assert.equal(summary.plannedExercises,6);
  assert.equal(summary.plannedSets,14);
  assert.equal(summary.recordedSets,12);
  assert.equal(summary.skippedSets,2);
  assert.equal(summary.unresolvedPlannedSets,0);
  assert.equal(summary.substitutions,1);
  assert.equal(summary.explicitAdjustments,1);
  assert.equal(summary.asPlannedSessions,0);
  assert.equal(summary.unverifiedSessions,2);
  assert.equal(summary.adjustedSessions,1);
  assert.equal(summary.quality,'media');
  assert.equal(Object.hasOwn(summary,'score'),false);
  assert.match(summary.semantics.neutral,/no las clasifica como mejores o peores/u);
  assert.match(summary.semantics.skipped,/nunca se cuenta como registrada/u);
});

test('Evolución excluye ejecuciones pendientes de confirmación',()=>{
  const state=sampleState();
  state.pendingOperations=[{
    operationId:'op-e2',
    type:'EJECUCION_COMPLETAR',
    entityType:'session_execution',
    entityId:'e2',
    clientId:'c1',
    status:'pending',
  }];
  const summary=buildPlanExecutionSummary(state,'c1',{now:NOW,days:28});
  assert.equal(summary.comparedSessions,1);
  assert.equal(summary.plannedSets,7);
  assert.equal(summary.recordedSets,7);
  assert.equal(summary.skippedSets,0);
  assert.equal(summary.asPlannedSessions,0);
  assert.equal(summary.unverifiedSessions,1);
});

test('Evolución mantiene ausencias explícitas cuando no existe plan publicado comparable',()=>{
  const state=sampleState();
  state.collections.sessions=[];
  const summary=buildPlanExecutionSummary(state,'c1',{now:NOW,days:28});
  assert.equal(summary.comparedSessions,0);
  assert.equal(summary.unmatchedExecutions,3);
  assert.equal(summary.quality,'insuficiente');
  assert.match(summary.summary,/Sin sesiones con una planificación publicada comparable/u);
});

test('superficie de Evolución separa Planificación vs ejecución de los hitos IRI',()=>{
  const planExecution=buildPlanExecutionSummary(sampleState(),'c1',{now:NOW,days:28});
  const summary={
    clientId:'c1',days:28,dataQuality:'media',
    plannedSessions:2,completedSessions:2,adherence:1,
    averageRpe:7,volume:null,volumeDelta:null,
    iriCurrent:null,iriPrevious:null,iriDelta:null,iriAssessmentCount:0,
    evolution:null,iri2:null,
    checkins:0,checkinAverage:{energy:null,sleep:null,stress:null,pain:null,fatigue:null,motivation:null},
    lastExecutionAt:null,lastExecutionRpe:null,latestCheckinAt:null,
    unconfirmedExecutions:0,
    wearable:{metrics:{},providers:[],daysWithData:0,freshness:'sin_datos',quality:'limitada'},
  };
  const html=renderProgressRoute({
    role:'coach',
    summary,
    planExecution,
    timeline:[],
    alerts:[],
    signal:{label:'Seguimiento',level:'neutral'},
    longitudinal:null,
    exerciseProgress:[],
  });
  assert.match(html,/data-evolution-plan-execution/u);
  assert.match(html,/Evolución y seguimiento/u);
  assert.match(html,/De lo planificado a lo realizado/u);
  assert.match(html,/Series previstas/u);
  assert.match(html,/Series registradas/u);
  assert.match(html,/Series omitidas/u);
  assert.match(html,/Lectura descriptiva/u);
  assert.doesNotMatch(html,/Evolución IRI 2\.0/u);
});

test('el IRI permanece como baseline separado de la evolución cotidiana y conserva el no-score',()=>{
  const planExecution=buildPlanExecutionSummary(sampleState(),'c1',{now:NOW,days:28});
  const summary={
    clientId:'c1',days:28,dataQuality:'media',
    plannedSessions:2,completedSessions:2,adherence:1,
    averageRpe:7,volume:null,volumeDelta:null,
    iriCurrent:3,iriPrevious:null,iriDelta:null,iriAssessmentCount:1,
    iriBaseline:{
      detail:'Punto de partida confirmado. Las reevaluaciones y el seguimiento longitudinal se mantienen fuera del Diagnóstico IRI.',
    },
    evolution:null,
    iri2:null,
    checkins:0,checkinAverage:{energy:null,sleep:null,stress:null,pain:null,fatigue:null,motivation:null},
    lastExecutionAt:null,lastExecutionRpe:null,latestCheckinAt:null,
    unconfirmedExecutions:0,
    wearable:{metrics:{},providers:[],daysWithData:0,freshness:'sin_datos',quality:'limitada'},
  };
  const html=renderProgressRoute({
    role:'coach',summary,planExecution,timeline:[],alerts:[],
    signal:{label:'Seguimiento',level:'neutral'},longitudinal:null,exerciseProgress:[],
  });
  assert.match(html,/data-iri-baseline/u);
  assert.match(html,/Diagnóstico IRI inicial/u);
  assert.match(html,/Sin puntuación global/u);
  assert.match(html,/seguimiento longitudinal se construyen fuera del IRI/u);
  assert.doesNotMatch(html,/data-iri-milestones|Hitos IRI comparables|Diagnóstico y reevaluación IRI|Evolución IRI 2\.0/u);
});
