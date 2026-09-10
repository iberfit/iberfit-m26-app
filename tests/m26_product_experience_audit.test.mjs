import test from 'node:test';
import assert from 'node:assert/strict';

import {evaluateProductExperience} from '../scripts/audit/product_experience_audit.mjs';

function baseFiles(){
  return {
    'src/m26/design/adaptive-layout.css':`[data-m26-layout="compact-touch"]{} [data-m26-layout="medium-touch"]{} [data-m26-layout="expanded-touch"]{} .x{padding-bottom:env(safe-area-inset-bottom);backdrop-filter:blur(10px);background:linear-gradient(#000,#111);box-shadow:0 1px 2px #000} :focus-visible{outline:2px solid} :disabled{opacity:.5} [aria-busy="true"]{cursor:wait} .error{color:var(--danger)} @media (prefers-reduced-motion: reduce){*{animation:none}}`,
    'src/m26/workflows/session-controller.js':`function enqueueAndApply(){} function beginRest(){} const actions=['rest-plus','rest-minus']; const activeSetDraft={}; const finalFeedbackDraft={}; function pagehide(){} function visibilitychange(){} const sessionRpe=''; const painNotes='';`,
    'src/m26/app/workflow-controller-base.js':'export const orphan=true;',
    'src/m26/app/workflow-controller.js':'export const canonical=true;',
  };
}

function designTokens(visualDelta='intentionally-minimal'){
  return JSON.stringify({
    meta:{sourceOfTruth:true,visualDelta,touchTargetRecommendedPx:44},
    color:{
      semantic:{canvas:'#0a0',surfaceBase:'#0b0',surfaceRaised:'#0c0',surfaceOverlay:'#0d0',textPrimary:'#fff',textSecondary:'#ddd',textSubtle:'#ccc',accent:'#aa0',accentStrong:'#bb0',border:'#333',borderStrong:'#444',focus:'#fff',success:'#0f0',warning:'#ff0',danger:'#f00',info:'#0ff'},
      dataViz:{series1:'#1',series2:'#2',series3:'#3',series4:'#4',series5:'#5',series6:'#6',grid:'#7',missing:'#8'},
    },
    space:{1:4,2:8,3:12,4:16,5:24,6:32,7:48,8:64},
    radius:{sm:10,md:14,lg:20,xl:24,pill:999},
    shadow:{subtle:'a',elevated:'b',floating:'c'},
    typography:{family:{ui:'Inter',editorial:'Serif'},sizePx:{xs:12,sm:14,md:16,lg:18,xl:20,'2xl':24,'3xl':32,'4xl':40},weight:{regular:400,medium:500,semibold:600,bold:700},lineHeight:{tight:1.1,normal:1.5,relaxed:1.7}},
    breakpoint:{mobilePx:580,tabletPx:900,desktopPx:1180,widePx:1440},
    size:{touchTargetPx:44},
    density:{client:{controlMinPx:48},coach:{controlMinPx:44},admin:{controlMinPx:44}},
  });
}

function visuallyStructuredFiles(visualDelta='intentionally-minimal'){
  const files=baseFiles();
  files['src/m26/design/tokens.json']=designTokens(visualDelta);
  files['src/m26/design/role-surfaces.css']=`.m26-shell[data-m26-role="client"]{} .m26-shell[data-m26-role="coach"]{} .m26-shell[data-m26-role="admin"]{}`;
  return files;
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

test('el contrato anterior se conserva y la madurez visual se añade de forma compatible',()=>{
  const report=evaluateProductExperience(visuallyStructuredFiles());
  assert.equal(report.version,'1.1.0');
  assert.equal(report.result,'PASS');
  assert.ok(Array.isArray(report.strengths));
  assert.ok(Array.isArray(report.opportunities));
  assert.equal(typeof report.summary.strengths,'number');
  assert.equal(typeof report.summary.opportunities,'number');
  assert.equal(typeof report.visualMaturity.score,'number');
  assert.equal(typeof report.visualMaturity.structuralScore,'number');
  assert.equal(report.visualMaturity.maxScore,100);
  assert.equal(report.visualMaturity.requiresHumanVisualReview,true);
  assert.equal(report.summary.visualScore,report.visualMaturity.score);
  assert.equal(report.summary.visualStructuralScore,report.visualMaturity.structuralScore);
});

test('intentionally-minimal nunca puede desaparecer detrás de un falso PASS premium',()=>{
  const report=evaluateProductExperience(visuallyStructuredFiles('intentionally-minimal'));
  const gap=report.opportunities.find((item)=>item.code==='VISUAL_DIRECTION_MINIMAL_DELTA');
  assert.ok(gap);
  assert.equal(gap.priority,'high');
  assert.equal(gap.domain,'aesthetic');
  assert.equal(report.visualMaturity.intentionallyMinimal,true);
  assert.equal(report.visualMaturity.structuralScore,100);
  assert.equal(report.visualMaturity.score,70);
  assert.equal(report.visualMaturity.level,'foundation-direction-limited');
  assert.ok(report.summary.opportunities>0);
  assert.ok(report.strengths.some((item)=>item.code==='PREMIUM_VISUAL_LAYERING'));
  assert.match(report.strengths.find((item)=>item.code==='PREMIUM_VISUAL_LAYERING').message,/por sí sola no certifica acabado premium/u);
});

test('la evaluación de madurez visual es determinista y separa estructura de revisión humana',()=>{
  const files=visuallyStructuredFiles('meaningful-elevation');
  const first=evaluateProductExperience(files);
  const second=evaluateProductExperience(files);
  assert.deepEqual(first.visualMaturity,second.visualMaturity);
  assert.equal(first.visualMaturity.requiresHumanVisualReview,true);
  assert.equal(first.opportunities.some((item)=>item.code==='VISUAL_DIRECTION_MINIMAL_DELTA'),false);
  assert.equal(first.visualMaturity.structuralScore,100);
  assert.equal(first.visualMaturity.score,100);
  assert.equal(first.visualMaturity.level,'elevated');
});
