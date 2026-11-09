import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  renderCoachPlanningSessionsProgressive,
  hydrateCoachPlanningBatchOnToggle,
  COACH_PLANNING_VISIBLE_SESSIONS,
  COACH_PLANNING_ARCHIVE_GROUP,
} from '../src/m26/modules/route-render.js';

test('Coach archive keeps every authorized publication in inert batches',()=>{
  const rows=Array.from({length:48},(_,i)=>({
    id:'synthetic-'+i,
    title:'Entrenamiento sintético '+i,
    dateLabel:'Día '+i,
    publication:{status:'published',statusLabel:'Publicado'},
    raw:{},
  }));
  const html=renderCoachPlanningSessionsProgressive(rows,'session');
  assert.match(html,/data-coach-planning-total="48"/);
  assert.equal((html.match(/data-coach-archive-size=/g)||[]).length,
    Math.ceil((rows.length-COACH_PLANNING_VISIBLE_SESSIONS)/COACH_PLANNING_ARCHIVE_GROUP));
  assert.equal((html.match(/data-coach-planning-template/g)||[]).length,3);
  assert.equal((html.match(/data-publication-card/g)||[]).length,rows.length);
  assert.match(html,/Consultar otras 42 sesiones/);
});

test('native details toggle mounts one batch once with all delegated actions intact',()=>{
  let mountCount=0,removeCount=0;
  const content={testPayload:'full historical publication actions'};
  const template={content,remove:()=>{removeCount++;}};
  const mount={append:(x)=>{assert.equal(x,content);mountCount++;}};
  let available=true;
  const batch={
    tagName:'DETAILS',open:true,
    hasAttribute:(x)=>x==='data-coach-planning-batch',
    querySelector:(selector)=>{
      if(selector===':scope > template[data-coach-planning-template]')return available?template:null;
      if(selector===':scope > [data-coach-planning-content]')return mount;
      return null;
    },
  };
  template.remove=()=>{available=false;removeCount++;};
  assert.equal(hydrateCoachPlanningBatchOnToggle({target:batch}),true);
  assert.equal(mountCount,1);
  assert.equal(removeCount,1);
  assert.equal(hydrateCoachPlanningBatchOnToggle({target:batch}),false);
  batch.open=false;
  assert.equal(hydrateCoachPlanningBatchOnToggle({target:batch}),false);
  assert.equal(mountCount,1);
});

test('Coach on-demand history never hydrates non-target details or malformed events',()=>{
  for(const target of [null,{}, {tagName:'DIV',open:true,hasAttribute:()=>true},
    {tagName:'DETAILS',open:false,hasAttribute:()=>true},
    {tagName:'DETAILS',open:true,hasAttribute:()=>false}]){
    assert.equal(hydrateCoachPlanningBatchOnToggle({target}),false);
  }
  assert.throws(()=>renderCoachPlanningSessionsProgressive([],'client'),
    /COACH_PLANNING_ENTITY_INVALID/);
});

test('Client and Admin 4K/320px checks run in the real mandatory CI matrices',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/device-experience-gate.yml',import.meta.url),'utf8');
  const clientConfig=readFileSync(new URL('../playwright.authenticated-visual.config.mjs',import.meta.url),'utf8');
  const adminWorkflow=readFileSync(new URL('../.github/workflows/admin-interaction-matrix.yml',import.meta.url),'utf8');
  const adminConfig=readFileSync(new URL('../playwright.admin-interaction.config.mjs',import.meta.url),'utf8');
  for(const name of ['authenticated-visual-uhd-chromium','authenticated-visual-compact-mobile-chromium']){
    assert.ok(workflow.includes('--project='+name),name+' missing mandatory current-source workflow');
    assert.ok(clientConfig.includes("name:'"+name+"'"),name+' missing configured viewport');
  }
  assert.ok(adminWorkflow.includes('--project=admin-uhd-chromium'));
  assert.match(adminConfig,/name:'admin-uhd-chromium'[^\n]*width:3840,height:2160/);
  assert.match(clientConfig,/name:'authenticated-visual-uhd-chromium'[^\n]*width:3840,height:2160/);
});
