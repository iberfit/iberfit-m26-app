import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  COACH_LARGE_LIST_MIN_ITEMS,
  COACH_LARGE_LIST_FRAME_BUDGET_MS,
  COACH_VIRTUALIZATION_REQUIRED_RUNTIME_SAMPLES,
  classifyCoachListMeasurement,
  decideCoachVirtualization,
} from '../src/m26/productivity/large-list-policy.js';
import {
  BULK_PREPARATION_ACTIONS,
  BULK_PREPARATION_MAX_TARGETS,
  createBulkOperationPreview,
  confirmBulkOperationPreview,
  buildBulkCommandDrafts,
  orderBulkTargets,
} from '../src/m26/productivity/bulk-preparation.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC60.2B synthetic evidence never decides dependency adoption',()=>{
  const samples=[
    classifyCoachListMeasurement({count:500,elapsedMs:40,source:'synthetic'}),
    classifyCoachListMeasurement({count:500,elapsedMs:42,source:'synthetic'}),
    classifyCoachListMeasurement({count:500,elapsedMs:39,source:'synthetic'}),
  ];
  const decision=decideCoachVirtualization(samples);
  assert.equal(decision.decision,'defer');
  assert.equal(decision.reason,'insufficient_runtime_evidence');
  assert.equal(decision.runtimeSamples,0);
});

test('RC60.2B repeated runtime evidence can produce future adoption candidate but never auto-load dependency',()=>{
  assert.equal(COACH_LARGE_LIST_MIN_ITEMS,120);
  assert.equal(COACH_LARGE_LIST_FRAME_BUDGET_MS,24);
  assert.equal(COACH_VIRTUALIZATION_REQUIRED_RUNTIME_SAMPLES,3);
  const samples=[
    classifyCoachListMeasurement({count:180,visibleCount:180,elapsedMs:29,source:'runtime'}),
    classifyCoachListMeasurement({count:180,visibleCount:170,elapsedMs:31,source:'runtime'}),
    classifyCoachListMeasurement({count:180,visibleCount:160,elapsedMs:27,source:'runtime'}),
  ];
  const decision=decideCoachVirtualization(samples);
  assert.equal(decision.decision,'candidate');
  assert.equal(decision.reason,'repeated_runtime_budget_exceeded');
  assert.equal(decision.automaticAdoption,false);
});

test('RC60.2B mixed runtime evidence defers virtualization',()=>{
  const samples=[
    classifyCoachListMeasurement({count:180,elapsedMs:29,source:'runtime'}),
    classifyCoachListMeasurement({count:180,elapsedMs:12,source:'runtime'}),
    classifyCoachListMeasurement({count:180,elapsedMs:28,source:'runtime'}),
  ];
  const decision=decideCoachVirtualization(samples);
  assert.equal(decision.decision,'defer');
  assert.equal(decision.reason,'runtime_evidence_not_consistent');
});

test('RC60.2B release keeps TanStack Virtual out until field evidence exists',()=>{
  const pkg=read('package.json');
  const policy=read('src/m26/productivity/large-list-policy.js');
  assert.doesNotMatch(pkg,/tanstack\/virtual/iu);
  assert.match(policy,/automaticAdoption:false/u);
});

test('RC60.2B bulk preparation only allows explicit client-access actions',()=>{
  assert.deepEqual(
    BULK_PREPARATION_ACTIONS.map((item)=>item.type),
    ['CLIENTE_REENVIAR_INVITACION','CLIENTE_SUSPENDER','CLIENTE_REACTIVAR'],
  );
  assert.equal(BULK_PREPARATION_MAX_TARGETS,25);
  assert.throws(
    ()=>createBulkOperationPreview({
      action:'IRI_COMPLETAR',
      selectedClientIds:['A','B'],
      visibleClientIds:['A','B'],
    }),
    /M26_BULK_ACTION_UNSUPPORTED/u,
  );
});

test('RC60.2B bulk preparation fails closed on targets outside visible scope',()=>{
  assert.throws(
    ()=>createBulkOperationPreview({
      action:'CLIENTE_REENVIAR_INVITACION',
      selectedClientIds:['A','X'],
      visibleClientIds:['A','B'],
    }),
    /M26_BULK_TARGET_OUT_OF_SCOPE:X/u,
  );
});

test('RC60.2B destructive bulk action requires reason and exact confirmation',()=>{
  assert.throws(
    ()=>createBulkOperationPreview({
      action:'CLIENTE_SUSPENDER',
      selectedClientIds:['A','B'],
      visibleClientIds:['A','B'],
    }),
    /M26_BULK_REASON_REQUIRED/u,
  );
  const preview=createBulkOperationPreview({
    action:'CLIENTE_SUSPENDER',
    selectedClientIds:['A','B'],
    visibleClientIds:['A','B'],
    reason:'Cambio organizativo confirmado por el Coach.',
  });
  assert.equal(preview.confirmationToken,'CONFIRMAR 2');
  assert.equal(preview.automaticExecution,false);
  assert.throws(
    ()=>confirmBulkOperationPreview(preview,{confirmation:'confirmar'}),
    /M26_BULK_CONFIRMATION_MISMATCH/u,
  );
  const confirmed=confirmBulkOperationPreview(preview,{confirmation:'CONFIRMAR 2'});
  assert.equal(confirmed.confirmed,true);
  assert.equal(confirmed.automaticExecution,false);
});

test('RC60.2B drafts bulk preserve deterministic visible ordering and still do not execute',()=>{
  const ordered=orderBulkTargets(['C','A'],['A','B','C']);
  assert.deepEqual(ordered,['A','C']);
  const preview=createBulkOperationPreview({
    action:'CLIENTE_REENVIAR_INVITACION',
    selectedClientIds:['C','A'],
    visibleClientIds:['A','B','C'],
  });
  const confirmed=confirmBulkOperationPreview(preview,{confirmation:'CONFIRMAR 2'});
  const commands=buildBulkCommandDrafts(confirmed);
  assert.deepEqual(commands.map((item)=>item.clientId),['A','C']);
  assert.ok(commands.every((item)=>item.bulkPrepared===true));
  assert.ok(commands.every((item)=>item.previewAccepted===false));
  const source=read('src/m26/productivity/bulk-preparation.js');
  assert.doesNotMatch(source,/commandBus|transport\.execute|fetch\(|supabase|service_role/iu);
});

test('RC60.2B existing keyboard reorder and conventional session controls remain intact',()=>{
  const builder=read('src/m26/workflows/session-builder.js');
  const ui=read('src/m26/workflows/session-ui.js');
  assert.match(builder,/export function moveSessionBlock/u);
  assert.match(ui,/data-session-action="move-up"/u);
  assert.match(ui,/data-session-action="move-down"/u);
});

test('RC60.2B PWA versions the decision layer and preserves RC60.2A lineage',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc60-2b[^\n]*m26-rc60-2a/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc60-2b[^\n]*m26-rc60-2a/u);
  assert.match(sw,/"\/src\/m26\/productivity\/bulk-preparation\.js"/u);
});

test('RC60.2B preserves durable Coach Productivity closeout and cross-cutting rails',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(roadmap,/RC60=CLOSED_COACH_PRODUCTIVITY/u);
  assert.match(roadmap,/RC60_2=CLOSED_LARGE_LIST_REUSE/u);
  assert.match(roadmap,/RC60_2B=CLOSED_VIRTUALIZATION_DECISION_BULK_PREP/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
});