import test from 'node:test';
import assert from 'node:assert/strict';

import {evaluateProductExperience} from '../scripts/audit/product_experience_audit.mjs';

function baseFiles(){
  return {
    'src/m26/design/adaptive-layout.css':`[data-m26-layout="compact-touch"]{} [data-m26-layout="medium-touch"]{} [data-m26-layout="expanded-touch"]{} .x{padding-bottom:env(safe-area-inset-bottom);backdrop-filter:blur(10px);background:linear-gradient(#000,#111)} :focus-visible{outline:2px solid} @media (prefers-reduced-motion: reduce){*{animation:none}}`,
    'src/m26/workflows/session-controller.js':`function enqueueAndApply(){} function beginRest(){} const actions=['rest-plus','rest-minus']; const activeSetDraft={}; const finalFeedbackDraft={}; function pagehide(){} function visibilitychange(){} const sessionRpe=''; const painNotes='';`,
    'src/m26/app/workflow-controller-base.js':'export const orphan=true;',
    'src/m26/app/workflow-controller.js':'export const canonical=true;',
  };
}

test('la auditoría de experiencia separa fortalezas y oportunidades sin convertir mejoras en fallos',()=>{
  const report=evaluateProductExperience(baseFiles());
  assert.equal(report.result,'PASS');
  assert.ok(report.strengths.some((item)=>item.code==='APP_SAFE_AREA_AWARE'));
  assert.ok(report.strengths.some((item)=>item.code==='ADAPTIVE_TOUCH_LAYOUT'));
  assert.ok(report.strengths.some((item)=>item.code==='REDUCED_MOTION_SUPPORTED'));
  assert.ok(report.strengths.some((item)=>item.code==='TRAINING_DRAFT_RECOVERY'));
  assert.ok(report.strengths.some((item)=>item.code==='TRAINING_REST_CONTROL'));
  assert.ok(report.strengths.some((item)=>item.code==='TRAINING_FEEDBACK_COMPLETE'));
  assert.ok(report.opportunities.some((item)=>item.code==='TRAINING_WAKE_LOCK_OPPORTUNITY'&&item.priority==='high'));
  assert.ok(report.opportunities.some((item)=>item.code==='TRAINING_HAPTICS_OPPORTUNITY'&&item.domain==='training'));
  assert.ok(report.opportunities.some((item)=>item.code==='ORPHAN_DEPLOYABLE_MODULE'&&item.domain==='performance'));
  assert.ok(report.summary.opportunities>=3);
});

test('wake lock y háptica pasan a fortalezas cuando existen como mejoras progresivas',()=>{
  const files=baseFiles();
  files['src/m26/workflows/session-device-experience.js']=`navigator.wakeLock.request('screen'); navigator.vibrate(40);`;
  const report=evaluateProductExperience(files);
  assert.ok(report.strengths.some((item)=>item.code==='TRAINING_SCREEN_WAKE_LOCK'));
  assert.ok(report.strengths.some((item)=>item.code==='TRAINING_HAPTIC_FEEDBACK'));
  assert.equal(report.opportunities.some((item)=>item.code==='TRAINING_WAKE_LOCK_OPPORTUNITY'),false);
  assert.equal(report.opportunities.some((item)=>item.code==='TRAINING_HAPTICS_OPPORTUNITY'),false);
});

test('la auditoría prioriza primero oportunidades altas',()=>{
  const report=evaluateProductExperience({'src/m26/minimal.js':'export const x=1;'});
  const priorities=report.opportunities.map((item)=>item.priority);
  const firstMedium=priorities.indexOf('medium');
  const firstLow=priorities.indexOf('low');
  const lastHigh=priorities.lastIndexOf('high');
  if(firstMedium>=0)assert.ok(lastHigh<firstMedium);
  if(firstLow>=0&&firstMedium>=0)assert.ok(firstMedium<firstLow);
});
