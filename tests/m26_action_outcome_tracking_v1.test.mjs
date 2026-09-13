import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ACTION_OUTCOME_ENTITY_TYPE,
  actionOutcomeEntities,
  summarizeActionOutcomes,
  validateActionDecisionDraft,
  validateActionOutcomeDraft,
} from '../src/m26/intelligence/action-outcome.js';
import {
  buildActionTrackingCommand,
  buildActionOutcomeCommand,
} from '../src/m26/engagement/command-builders.js';
import {
  M26_ENGAGEMENT_EXTENSION_REGISTRY,
  engagementCapabilities,
} from '../src/m26/engagement/activity-capabilities.js';
import {M26_EXTENDED_COMMAND_REGISTRY} from '../src/m26/command-catalog.js';
import {projectCollectionsForRole} from '../src/m26/security/role-projection.js';

const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const trackingId='fd7f2e99-5a3f-49d7-86df-e49e9cdb8f0b';

function openRecord(overrides={}){
  return {
    entityType:ACTION_OUTCOME_ENTITY_TYPE,
    entityId:trackingId,
    clientId,
    status:'abierto',
    revision:1,
    body:{
      id:trackingId,
      clientId,
      visibleToClient:false,
      signalSummary:'RPE alto con peor recuperación en dos sesiones.',
      signalSource:'session',
      decisionSummary:'Reducir temporalmente la exigencia y revisar tolerancia.',
      interventionType:'load_adjustment',
      interventionSummary:'Reducir volumen de accesorios y mantener técnica.',
      expectedOutcome:'RPE más estable sin pérdida de adherencia.',
      reviewAt:'2026-09-15',
      createdAt:'2026-09-01T12:00:00Z',
      updatedAt:'2026-09-01T12:00:00Z',
      ...overrides.body,
    },
    ...overrides,
  };
}

test('Action Outcome valida señal, decisión, intervención y resultado sin inferirlos',()=>{
  const decision=validateActionDecisionDraft({
    signalSummary:'Dolor percibido más alto tras la sesión.',
    signalSource:'checkin',
    decisionSummary:'Revisar la dosis de trabajo antes de progresar.',
    interventionType:'recovery',
    interventionSummary:'Mantener carga y reducir densidad durante una semana.',
    expectedOutcome:'Menor dolor percibido y RPE estable.',
    reviewAt:'2026-09-20',
  });
  assert.equal(decision.ok,true);
  assert.equal(decision.value.visibleToClient,false);
  assert.deepEqual(validateActionDecisionDraft({}).errors,[
    'signalSummary','decisionSummary','interventionSummary','expectedOutcome','signalSource','interventionType','reviewAt'
  ]);

  const outcome=validateActionOutcomeDraft({
    outcomeStatus:'improved',
    outcomeSummary:'El dolor bajó y el cliente completó las sesiones previstas.',
    outcomeEvidence:'Dos check-ins y dos ejecuciones confirmadas.',
    reviewedAt:'2026-09-20',
  });
  assert.equal(outcome.ok,true);
  assert.equal(outcome.value.visibleToClient,false);
  assert.equal(validateActionOutcomeDraft({outcomeStatus:'better'}).ok,false);
});

test('Action Outcome resume abiertos, revisiones vencidas y distribución de resultados',()=>{
  const rows=[
    openRecord(),
    openRecord({
      entityId:'b8f0d80a-8714-4029-a947-cf24120993c1',
      revision:2,
      status:'cerrado',
      body:{
        id:'b8f0d80a-8714-4029-a947-cf24120993c1',
        clientId,
        visibleToClient:false,
        signalSummary:'Adherencia irregular.',
        signalSource:'adherence',
        decisionSummary:'Simplificar la semana.',
        interventionType:'plan',
        interventionSummary:'Dos sesiones prioritarias.',
        expectedOutcome:'Recuperar continuidad.',
        reviewAt:'2026-09-05',
        outcomeStatus:'improved',
        outcomeSummary:'Completó las dos sesiones.',
        outcomeEvidence:'Ejecuciones confirmadas.',
        reviewedAt:'2026-09-06',
        createdAt:'2026-08-25T12:00:00Z',
        updatedAt:'2026-09-06T12:00:00Z',
      },
    }),
  ];
  const summary=summarizeActionOutcomes(rows,clientId,{now:new Date('2026-09-16T12:00:00Z')});
  assert.equal(summary.total,2);
  assert.equal(summary.openCount,1);
  assert.equal(summary.closedCount,1);
  assert.equal(summary.overdueCount,1);
  assert.equal(summary.outcomes.improved,1);
  assert.equal(summary.completionRate,0.5);
  assert.equal(summary.improvementRate,1);
  assert.equal(summary.needsReview?.id,trackingId);
});

test('Action Outcome commands are private, revisioned and Coach/Admin-only',()=>{
  const tracking=buildActionTrackingCommand({
    clientId,
    entityId:trackingId,
    tracking:{
      signalSummary:'RPE alto.',
      signalSource:'session',
      decisionSummary:'Revisar dosis.',
      interventionType:'load_adjustment',
      interventionSummary:'Reducir volumen.',
      expectedOutcome:'RPE más estable.',
      reviewAt:'2026-09-20',
    },
  },{registry:M26_EXTENDED_COMMAND_REGISTRY,role:'coach'});
  assert.equal(tracking.type,'ACCION_SEGUIMIENTO_REGISTRAR');
  assert.equal(tracking.entityType,'action_outcome');
  assert.equal(tracking.payload.patch.visibleToClient,false);
  assert.equal(tracking.baseRevision,0);

  const outcome=buildActionOutcomeCommand({
    clientId,
    trackingId,
    baseRevision:1,
    outcome:{
      outcomeStatus:'stable',
      outcomeSummary:'La respuesta se mantuvo estable.',
      outcomeEvidence:'Sesiones confirmadas.',
      reviewedAt:'2026-09-20',
    },
  },{registry:M26_EXTENDED_COMMAND_REGISTRY,role:'admin'});
  assert.equal(outcome.type,'ACCION_RESULTADO_REGISTRAR');
  assert.equal(outcome.baseRevision,1);
  assert.equal(outcome.payload.patch.visibleToClient,false);

  assert.throws(()=>buildActionTrackingCommand({
    clientId,
    entityId:trackingId,
    tracking:{
      signalSummary:'RPE alto.',
      signalSource:'session',
      decisionSummary:'Revisar dosis.',
      interventionType:'load_adjustment',
      interventionSummary:'Reducir volumen.',
      expectedOutcome:'RPE más estable.',
      reviewAt:'2026-09-20',
    },
  },{registry:M26_EXTENDED_COMMAND_REGISTRY,role:'client'}),/ROLE_NOT_ALLOWED/);
});

test('runtime registry expone Action Outcome solo cuando ambos comandos están instalados',()=>{
  const caps=engagementCapabilities(M26_ENGAGEMENT_EXTENSION_REGISTRY);
  assert.equal(caps.actionOutcomeTracking.ready,true);
  assert.deepEqual(caps.actionOutcomeTracking.required,[
    'ACCION_SEGUIMIENTO_REGISTRAR',
    'ACCION_RESULTADO_REGISTRAR',
  ]);
  const missing=engagementCapabilities(
    M26_ENGAGEMENT_EXTENSION_REGISTRY.filter((item)=>item.type!=='ACCION_RESULTADO_REGISTRAR')
  );
  assert.equal(missing.actionOutcomeTracking.ready,false);
  assert.deepEqual(missing.actionOutcomeTracking.missing,['ACCION_RESULTADO_REGISTRAR']);
});

test('Cliente no recibe Action Outcome privado aunque comparta clientId',()=>{
  const collections={
    m26Entities:[openRecord()],
  };
  const projected=projectCollectionsForRole(collections,{
    id:'61227666-d8b4-4d1e-aa08-2405ad2000db',
    role:'client',
    clientId,
  },['m26Entities']);
  assert.deepEqual(projected.m26Entities,[]);
});

test('workspace Action Outcome conserva evidencia, progressive disclosure y responsive',()=>{
  const controller=fs.readFileSync(new URL('../src/m26/engagement/engagement-controller.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../src/m26/design/premium-ux.css',import.meta.url),'utf8');
  assert.match(controller,/data-action-outcome-manager/);
  assert.match(controller,/data-engagement-form','action-tracking/);
  assert.match(controller,/data-engagement-form','action-outcome/);
  assert.match(controller,/recordActionTracking/);
  assert.match(controller,/recordActionOutcome/);
  const domain=fs.readFileSync(new URL('../src/m26/intelligence/action-outcome.js',import.meta.url),'utf8');
  assert.match(domain,/visibleToClient:false/);
  assert.match(css,/ACTION_OUTCOME_TRACKING_V1_BEGIN/);
  assert.match(css,/\.m26-action-outcome-manager/);
  assert.match(css,/@media \(max-width:580px\)/);
});

test('migration instala dos comandos, privacidad y wrapper canónico fail-closed',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20260913220500_action_outcome_tracking_v26.sql',import.meta.url),'utf8');
  for(const marker of [
    "'ACCION_SEGUIMIENTO_REGISTRAR'",
    "'ACCION_RESULTADO_REGISTRAR'",
    "'action_outcome'",
    "'REGISTRAR'",
    "'CERRAR'",
    "iberfit_validate_action_outcome_v26",
    "iberfit_require_privileged_assurance_v65d",
    "iberfit_execute_command_v26_pre_action_outcome",
    "ACTION_TRACKING_MUST_BE_PRIVATE",
    "ACTION_OUTCOME_MUST_BE_PRIVATE",
  ])assert.ok(sql.includes(marker),marker);
  assert.match(sql,/\('action_outcome','borrador','REGISTRAR','abierto'\)/u);
  assert.match(sql,/\('action_outcome','abierto','CERRAR','cerrado'\)/u);
  assert.match(sql,/revoke all on function public\.iberfit_execute_command_v26_pre_action_outcome\(jsonb\) from public,anon,authenticated/iu);
  assert.doesNotMatch(sql,/grant execute on function public\.iberfit_execute_command_v26_pre_action_outcome\(jsonb\) to authenticated/iu);
});
