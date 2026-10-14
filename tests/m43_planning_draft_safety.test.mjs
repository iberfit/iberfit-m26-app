import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMemoryEngagementDraftRepository} from '../src/m26/engagement/activity-drafts.js';
import {planningDraftScope,restorePlanningDraft,listPlanningDrafts,removeConfirmedPlanningDraft,LEGACY_PLANNING_DRAFT_SCOPE} from '../src/m26/workflows/planning-draft-safety.js';

const source=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const cycle=(id,clientId='client-1',name='Ciclo')=>({
  id,clientId,name,startDate:'2026-10-15',endDate:'2026-11-15',goal:'Fuerza',
  modality:'presencial',weeklyFrequency:'2',sessionDurationMinutes:'60',
});

test('M43: each training cycle has an independent valid local scope',()=>{
  assert.notEqual(planningDraftScope('cy-1'),planningDraftScope('cy-2'));
  assert.notEqual(planningDraftScope('cy:a'),planningDraftScope('cy_3aa'));
  assert.match(planningDraftScope('cy-1'),/^planning-cycle-[a-zA-Z0-9._-]+$/);
  assert.throws(()=>planningDraftScope('../danger'),/M43_PLAN_DRAFT_ID_INVALID/);
  assert.throws(()=>planningDraftScope('a'.repeat(70)),/M43_PLAN_DRAFT_SCOPE_TOO_LONG/);
});

test('M43: two cycles for one client are independently saved, restored and cleaned',async()=>{
  const repo=createMemoryEngagementDraftRepository({ownerId:'coach-m43-plan'});
  const a=cycle('cy-1','client-1','Fuerza'),b=cycle('cy-2','client-1','Running');
  await repo.save(a.clientId,planningDraftScope(a.id),a);
  await repo.save(b.clientId,planningDraftScope(b.id),b);
  assert.equal((await restorePlanningDraft(repo,'client-1',a.id)).value.name,'Fuerza');
  assert.equal((await restorePlanningDraft(repo,'client-1',b.id)).value.name,'Running');
  assert.deepEqual((await listPlanningDrafts(repo,'client-1')).map(x=>x.value.id).sort(),['cy-1','cy-2']);
  await removeConfirmedPlanningDraft(repo,'client-1',a.id);
  assert.equal(await restorePlanningDraft(repo,'client-1',a.id),null);
  assert.equal((await restorePlanningDraft(repo,'client-1',b.id)).value.name,'Running');
});

test('M43: legacy single-key draft remains readable; only matching confirmed ID may remove it',async()=>{
  const repo=createMemoryEngagementDraftRepository({ownerId:'coach-m43-legacy'});
  const a=cycle('cy-legacy'),b=cycle('cy-new','client-1','Ciclo posterior');
  await repo.save('client-1',LEGACY_PLANNING_DRAFT_SCOPE,a);
  await repo.save('client-1',planningDraftScope(b.id),b);
  assert.equal((await restorePlanningDraft(repo,'client-1',a.id)).value.name,'Ciclo');
  assert.equal((await restorePlanningDraft(repo,'client-1',b.id)).value.name,'Ciclo posterior');
  assert.deepEqual((await listPlanningDrafts(repo,'client-1')).map(x=>x.value.id).sort(),['cy-legacy','cy-new']);
  await removeConfirmedPlanningDraft(repo,'client-1',b.id);
  assert.ok(await repo.load('client-1',LEGACY_PLANNING_DRAFT_SCOPE));
  await repo.save('client-1',planningDraftScope(a.id),{...a,name:'Ciclo revisado'});
  const listed=await listPlanningDrafts(repo,'client-1');
  assert.equal(listed.length,1);
  assert.equal(listed[0].value.name,'Ciclo revisado');
  await removeConfirmedPlanningDraft(repo,'client-1',a.id);
  assert.equal(await repo.load('client-1',LEGACY_PLANNING_DRAFT_SCOPE),undefined);
});

test('M43: client isolation and malformed stored cycle identity never enters the picker',async()=>{
  const repo=createMemoryEngagementDraftRepository({ownerId:'coach-m43-isolation'});
  await repo.save('client-1',planningDraftScope('a'),cycle('a'));
  await repo.save('client-10',planningDraftScope('b'),cycle('b','client-10'));
  await repo.save('client-1',planningDraftScope('c'),cycle('d'));
  assert.deepEqual((await listPlanningDrafts(repo,'client-1')).map(x=>x.value.id),['a']);
  await assert.rejects(()=>restorePlanningDraft(repo,'client-1','c'),/M43_PLAN_DRAFT_IDENTITY_CONFLICT/);
  assert.equal(await restorePlanningDraft(repo,'client-1','b'),null);
  assert.equal((await listPlanningDrafts(repo,'client-10')).length,1);
});

test('M43: controller always saves and removes an individual cycle identity',()=>{
  const workflow=source('src/m26/app/workflow-controller.js');
  const save=workflow.slice(workflow.indexOf('async function savePlanDraft('),workflow.indexOf('function queuePlanSave('));
  assert.match(save,/planningDraftScope\(stableId\)/);
  assert.match(save,/entityControl\.value=stableId/);
  assert.match(save,/draftRepository\.save\(clientId,scope,draft\)/);
  assert.doesNotMatch(save,/ensureValidForm\(/);
  assert.doesNotMatch(save,/draftRepository\.save\(clientId,'planning-cycle'/);
  const validate=workflow.slice(workflow.indexOf('async function performValidatePlan('),workflow.indexOf('async function createAppointment('));
  assert.match(validate,/restorePlanningDraft\(draftRepository,clientId,visibleId\)/);
  assert.match(validate,/removeConfirmedPlanningDraft\(draftRepository,clientId,stableId\)/);
  assert.match(validate,/draftRepository\?\.save\?\.\(clientId,scoped,draft\)/);
  assert.match(workflow,/async function selectPlanDraft\(form,selectedId\)/);
  assert.match(workflow,/if\(editedPlanForms\.has\(form\)\)\{\s*await savePlanDraft/);
  assert.match(workflow,/data-plan-draft-choice/);
  const route=source('src/m26/modules/route-render.js');
  assert.match(route,/data-plan-draft-choice/);
  assert.match(route,/Crear un ciclo nuevo/);
  const sw=source('public/m26/sw.js');
  assert.match(sw,/\/src\/m26\/workflows\/planning-draft-safety\.js/);
});
