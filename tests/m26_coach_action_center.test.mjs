import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deriveCoachCockpit,__coachCockpitInternals} from '../src/m26/experience/coach-cockpit.js';
import {iberfitDomainTranslate,iberfitDomainTranslationCoverage} from '../src/m26/ui/i18n-domain.js';

function client({id,name,stage='active',priority=5,nextAction={},adaptiveExperience=null}={}){
  return {
    id,
    name,
    modality:'hibrido',
    experience:{stage,stageLabel:stage,priority},
    nextAction:{key:'review_follow_up',label:'Revisar seguimiento',area:'expediente',reason:'Seguimiento',...nextAction},
    ...(adaptiveExperience?{adaptiveExperience}:{}),
  };
}

test('Coach Action Center maps semantic tasks without changing cockpit priority order',()=>{
  const cockpit=deriveCoachCockpit([
    {client:client({id:'PLAN',name:'Plan',stage:'planning',priority:3,nextAction:{key:'prepare_plan',area:'planificacion'}})},
    {client:client({id:'CRIT',name:'Critical'}),alerts:[{severity:'critical',title:'Risk'}]},
    {client:client({id:'CHECK',name:'Check-in',stage:'scheduling',priority:4,nextAction:{key:'schedule_appointment',area:'agenda'}})},
  ]);

  assert.deepEqual(cockpit.items.map((item)=>item.clientId),['CRIT','PLAN','CHECK']);
  assert.equal(cockpit.items.find((item)=>item.clientId==='PLAN').actionType,'needs-initial-plan');
  assert.equal(cockpit.items.find((item)=>item.clientId==='CHECK').actionType,'upcoming-checkin');
  assert.equal(cockpit.items.find((item)=>item.clientId==='CRIT').actionType,'manual-attention');
});

test('Adaptive review semantics map load and adherence without a second ranking engine',()=>{
  const load=__coachCockpitInternals.itemFromEntry({
    client:client({
      id:'LOAD',name:'Load',
      adaptiveExperience:{kind:'warning',coachReviewRequired:true,label:'Review',reason:'Review load',action:{key:'review_session_adjustment',area:'expediente'}},
    }),
  });
  const feedback=__coachCockpitInternals.itemFromEntry({
    client:client({
      id:'FEEDBACK',name:'Feedback',
      adaptiveExperience:{kind:'warning',coachReviewRequired:true,label:'Review',reason:'Review adherence',action:{key:'review_adherence_session',area:'expediente'}},
    }),
  });

  assert.equal(load.actionType,'load-change');
  assert.equal(feedback.actionType,'feedback-review');
  assert.equal(load.rank,1);
  assert.equal(feedback.rank,1);
});

test('Action Center translations are complete in ES EN FR PT',()=>{
  const coverage=iberfitDomainTranslationCoverage();
  assert.deepEqual(coverage.map((item)=>item.language),['es','en','fr','pt']);
  assert.ok(coverage.every((item)=>item.complete));

  for(const language of ['es','en','fr','pt']){
    for(const type of ['needs-initial-plan','feedback-review','upcoming-checkin','load-change','manual-attention']){
      const label=iberfitDomainTranslate(`coach.actionCenter.type.${type}`,{language});
      const why=iberfitDomainTranslate(`coach.actionCenter.why.${type}`,{language});
      const cta=iberfitDomainTranslate(`coach.actionCenter.cta.${type}`,{language});
      assert.ok(label&&!label.startsWith('coach.actionCenter.'));
      assert.ok(why&&!why.startsWith('coach.actionCenter.'));
      assert.ok(cta&&!cta.startsWith('coach.actionCenter.'));
    }
  }
});

test('Coach Today Action Center is semantic, accessible and exposes contextual client navigation',async()=>{
  const source=await readFile(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.match(source,/aria-labelledby="m26-coach-action-center-title"/u);
  assert.match(source,/data-m26-coach-action-center/u);
  assert.match(source,/data-coach-action-type=/u);
  assert.match(source,/data-m26-coach-action/u);
  assert.match(source,/data-m26-client-id=/u);
  assert.match(source,/data-m26-target-area=/u);
  assert.match(source,/aria-label=/u);
});

test('Coach action navigation validates client and route before mutating selection',async()=>{
  const source=await readFile(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
  const guardIndex=source.indexOf('const clientId=guardClientSelection');
  const decisionIndex=source.indexOf('const decision=resolveM26Route');
  const selectIndex=source.indexOf('store.selectClient(clientId)');
  assert.ok(guardIndex>=0&&decisionIndex>guardIndex&&selectIndex>decisionIndex);
  assert.match(source,/if\(!decision\.allowed\)throw new Error/u);
  assert.ok(source.includes("current?.identity?.role||'')!=='coach'"));
  assert.match(source,/event\.stopPropagation/u);
});
