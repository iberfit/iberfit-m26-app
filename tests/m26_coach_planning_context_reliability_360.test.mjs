import test from 'node:test';
import assert from 'node:assert/strict';
import {selectCurrentTrainingCycle} from '../src/m26/workflows/planning-workflow.js';
import {
  sessionDraftDefaultsFromState,createSessionDraft,addTrainingGroup,
  updateSessionBlock,
} from '../src/m26/workflows/session-builder.js';

const clientId='synthetic-client-plan-360';
const now=new Date('2026-10-08T15:00:00.000Z');
const cycle=(id,start,end,duration,extra={})=>({
  id,clientId,status:'published',
  body:{id,clientId,startDate:start,endDate:end,sessionDurationMinutes:duration,...extra},
});
const context=(cycles,profiles=[])=>({
  collections:{trainingCycles:cycles,clientProfiles:profiles},
});

test('a current cycle wins over historic and future cycles regardless of collection order',()=>{
 const past=cycle('past','2026-01-01','2026-02-01',45);
 const current=cycle('current','2026-10-01','2026-10-31',75);
 const future=cycle('future','2026-11-01','2026-11-30',100);
 for(const order of [[past,future,current],[future,current,past],[current,past,future]]){
   const state=context(order,[{clientId,sessionDurationMinutes:60}]);
   assert.equal(selectCurrentTrainingCycle(order,{clientId,now})?.id,'current');
   assert.deepEqual(sessionDraftDefaultsFromState(state,clientId,{now}),{
     clientId,durationMinutes:75,source:'cycle',
   });
 }
});

test('new sessions never inherit a closed or historical cycle as current prescription',()=>{
 const historic=cycle('historic','2026-08-01','2026-08-31',90);
 const closed=cycle('closed','2026-10-01','2026-10-31',120,{status:'completed'});
 const archived=cycle('archived','2026-10-01','2026-10-31',110,{status:'archived'});
 const state=context([historic,closed,archived],[{clientId,sessionDurationMinutes:55}]);
 assert.equal(selectCurrentTrainingCycle(state.collections.trainingCycles,{clientId,now}),null);
 assert.equal(sessionDraftDefaultsFromState(state,clientId,{now}).durationMinutes,55);
 assert.equal(sessionDraftDefaultsFromState(state,clientId,{now}).source,'profile');
});

test('client isolation and historical un-dated compatibility remain intact',()=>{
 const foreign=cycle('foreign','2026-10-01','2026-10-31',100,{clientId:'other-client'});
 const legacy={id:'legacy',clientId,body:{clientId,sessionDurationMinutes:65}};
 const state=context([foreign,legacy]);
 assert.equal(selectCurrentTrainingCycle(state.collections.trainingCycles,{clientId,now})?.id,'legacy');
 assert.equal(sessionDraftDefaultsFromState(state,clientId,{now}).durationMinutes,65);
 assert.equal(selectCurrentTrainingCycle(state.collections.trainingCycles,{clientId:'absent',now}),null);
});

test('cycle duration must be valid to be treated as a confirmed source',()=>{
 const current=cycle('current','2026-10-01','2026-10-31','500');
 const state=context([current],[{clientId,sessionDurationMinutes:70}]);
 assert.deepEqual(sessionDraftDefaultsFromState(state,clientId,{now}),{
   clientId,durationMinutes:70,source:'profile',
 });
 assert.equal(sessionDraftDefaultsFromState(context([current]),clientId,{now}).source,'default');
 assert.equal(sessionDraftDefaultsFromState(context([current]),clientId,{now}).durationMinutes,50);
});

test('two current cycles resolve deterministically to the most recently started',()=>{
 const earlier=cycle('earlier','2026-09-01','2026-11-01',50,{updatedAt:'2026-10-08T12:00:00Z'});
 const newer=cycle('newer','2026-10-04','2026-10-28',80,{updatedAt:'2026-10-07T12:00:00Z'});
 assert.equal(selectCurrentTrainingCycle([earlier,newer],{clientId,now})?.id,'newer');
});

test('civil-day boundary is Santiago-local, not UTC midnight',()=>{
 const nextDay=cycle('next-day','2026-10-08','2026-10-31',85);
 const nowBeforeSantiagoMidnight=new Date('2026-10-08T02:30:00.000Z');
 assert.equal(selectCurrentTrainingCycle([nextDay],{clientId,now:nowBeforeSantiagoMidnight}),null);
 assert.equal(selectCurrentTrainingCycle([nextDay],{clientId,now})?.id,'next-day');
});

test('group editing rejects unknown fields without mutating draft or preview state',()=>{
 const draft=createSessionDraft({clientId});
 addTrainingGroup(draft,'biserie',['squat','row']);
 const block=draft.blocks[0];
 draft.previewAccepted=true;
 const before=structuredClone(draft);
 assert.throws(
   ()=>updateSessionBlock(draft,{blockId:block.id,exerciseId:'squat',field:'notARealPrescription',value:'x'}),
   /M26_SESSION_GROUP_FIELD_INVALID/,
 );
 assert.deepEqual(draft,before);
});

test('supported group fields including explicit RIR zero still update exactly one exercise',()=>{
 const draft=createSessionDraft({clientId});
 addTrainingGroup(draft,'biserie',['squat','row']);
 const id=draft.blocks[0].id;
 draft.previewAccepted=true;
 updateSessionBlock(draft,{blockId:id,exerciseId:'squat',field:'targetRir',value:0});
 assert.equal(draft.blocks[0].prescriptions.squat.targetRir,0);
 assert.equal(draft.blocks[0].prescriptions.row.targetRir,3);
 assert.equal(draft.previewAccepted,false);
});
