import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  M26_MOTION_SCHEMA_VERSION,
  M26_MOTION_PRESETS,
  prefersReducedMotion,
  motionIntentForSessionAction,
  animateM26Node,
} from '../src/m26/motion/motion-controller.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC61.1 motion foundation exposes one canonical schema and bounded presets',()=>{
  assert.equal(M26_MOTION_SCHEMA_VERSION,'iberfit.motion.v1');
  assert.deepEqual(
    Object.keys(M26_MOTION_PRESETS),
    ['feedback','set','reorder','filter','status','entrance'],
  );
  for(const preset of Object.values(M26_MOTION_PRESETS)){
    assert.ok(preset.duration>=0&&preset.duration<=320);
    assert.ok(Array.isArray(preset.keyframes));
    assert.ok(preset.keyframes.length>=2);
  }
});

test('RC61.1 prefers reduced motion is authoritative and never calls WAAPI',()=>{
  let calls=0;
  const node={dataset:{},animate(){calls++;return {};}};
  const result=animateM26Node(node,'set',{reduced:true});
  assert.equal(result.animated,false);
  assert.equal(result.reason,'reduced_motion');
  assert.equal(calls,0);
  assert.equal(node.dataset.motionState,'reduced');
  assert.equal(prefersReducedMotion({matchMedia:()=>({matches:true})}),true);
});

test('RC61.1 WAAPI is used only when available and motion is permitted',()=>{
  let options=null;
  const node={
    dataset:{},
    animate(frames,input){
      options={frames,input};
      return {finished:Promise.resolve()};
    },
  };
  const result=animateM26Node(node,'feedback',{reduced:false});
  assert.equal(result.animated,true);
  assert.equal(result.reason,'waapi');
  assert.equal(options.input.duration,M26_MOTION_PRESETS.feedback.duration);
  assert.equal(options.frames.length,2);
});

test('RC61.1 session intents cover save set reorder and completion without business decisions',()=>{
  assert.equal(motionIntentForSessionAction('save-draft'),'feedback');
  assert.equal(motionIntentForSessionAction('complete-set'),'set');
  assert.equal(motionIntentForSessionAction('move-up'),'reorder');
  assert.equal(motionIntentForSessionAction('finish'),'set');
  assert.equal(motionIntentForSessionAction('unknown'),null);
});

test('RC61.1 controller observes filter status sync and empty transitions',()=>{
  const source=read('src/m26/motion/motion-controller.js');
  assert.match(source,/data-client-search/u);
  assert.match(source,/data-client-filter/u);
  assert.match(source,/m26-action-state\.is-success/u);
  assert.match(source,/m26-action-state\.is-error/u);
  assert.match(source,/m26-sync-banner/u);
  assert.match(source,/m26-empty-copy/u);
  assert.match(source,/MutationObserver/u);
});

test('RC61.1 application owns motion lifecycle instead of global side effects',()=>{
  const app=read('src/m26/app/application.js');
  assert.match(app,/createM26MotionController/u);
  assert.match(app,/motion=createM26MotionController\(\{root\}\)/u);
  assert.match(app,/motion\.mount\(\)/u);
  assert.match(app,/motion\?\.destroy/u);
});

test('RC61.1 CSS globally fails safe under prefers-reduced-motion',()=>{
  const css=read('src/m26/design/primitives.css');
  assert.match(css,/IBERFIT RC61\.1 · Motion Foundation/u);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css,/animation-duration: 0\.01ms !important/u);
  assert.match(css,/transition-duration: 0\.01ms !important/u);
  assert.match(css,/scroll-behavior: auto !important/u);
});

test('RC61.1 does not add Motion or AutoAnimate dependency while WAAPI is sufficient',()=>{
  const pkg=read('package.json');
  const source=read('src/m26/motion/motion-controller.js');
  assert.doesNotMatch(pkg,/"motion"|"@formkit\/auto-animate"/iu);
  assert.doesNotMatch(source,/cdn\.jsdelivr|unpkg|https:\/\//u);
  assert.match(source,/node\.animate/u);
});

test('RC61.1 PWA versions motion and preserves RC60.2B lineage',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(sw,/VERSION='m26-rc61-1'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc60-2b'/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc61-1[^\n]*m26-rc60-2b/u);
  assert.match(sw,/"\/src\/m26\/motion\/motion-controller\.js"/u);
});

test('RC61.1 closes foundation without prematurely closing RC61',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(roadmap,/RC61=IN_PROGRESS_MOTION_MICROINTERACTIONS/u);
  assert.match(roadmap,/RC61_1=CLOSED_MOTION_FOUNDATION_REDUCED_MOTION/u);
  assert.match(roadmap,/RC61_2=IN_PROGRESS_SYNC_EMPTY_TRANSITIONS/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
});