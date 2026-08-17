import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  M26_MOTION_STATE_SELECTOR,
  describeM26MotionState,
  shouldAnimateM26StateTransition,
  prefersReducedMotion,
} from '../src/m26/motion/motion-controller.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function mockNode({
  matches=[],
  text='',
  status='',
  busy='',
  hidden=false,
  ariaHidden='false',
}={}){
  const set=new Set(matches);
  return {
    nodeType:1,
    hidden,
    textContent:text,
    matches:(selector)=>String(selector??'').split(',').map((part)=>part.trim()).some((part)=>set.has(part)),
    getAttribute:(name)=>{
      if(name==='data-status')return status||null;
      if(name==='aria-busy')return busy||null;
      if(name==='aria-hidden')return ariaHidden||null;
      return null;
    },
    querySelectorAll:()=>[],
  };
}

test('RC61.2 exposes one semantic selector for sync status empty and loading states',()=>{
  assert.match(M26_MOTION_STATE_SELECTOR,/m26-sync-banner/u);
  assert.match(M26_MOTION_STATE_SELECTOR,/m26-action-state\.is-success/u);
  assert.match(M26_MOTION_STATE_SELECTOR,/m26-action-state\.is-error/u);
  assert.match(M26_MOTION_STATE_SELECTOR,/m26-empty-copy/u);
  assert.match(M26_MOTION_STATE_SELECTOR,/m26-skeleton/u);
  assert.match(M26_MOTION_STATE_SELECTOR,/data-empty-state/u);
  assert.match(M26_MOTION_STATE_SELECTOR,/data-loading-state/u);
});

test('RC61.2 semantic state keeps static text as source of truth',()=>{
  const sync=describeM26MotionState(mockNode({
    matches:['.m26-sync-banner'],
    text:'Pendiente de sincronización',
    status:'pending',
  }));
  assert.equal(sync.kind,'sync');
  assert.equal(sync.preset,'status');
  assert.equal(sync.visible,true);
  assert.match(sync.signature,/Pendiente de sincronización/u);

  const empty=describeM26MotionState(mockNode({
    matches:['.m26-empty-copy'],
    text:'No hay sesiones publicadas.',
  }));
  assert.equal(empty.kind,'empty');
  assert.equal(empty.preset,'entrance');
  assert.match(empty.signature,/No hay sesiones publicadas/u);
});

test('RC61.2 repeated mutation with identical semantic signature does not animate twice',()=>{
  const node=mockNode({
    matches:['.m26-sync-banner'],
    text:'Sincronizado',
    status:'clean',
  });
  const next=describeM26MotionState(node);
  assert.equal(shouldAnimateM26StateTransition(null,next),true);
  assert.equal(shouldAnimateM26StateTransition(next.signature,next),false);
});

test('RC61.2 status or text changes produce a new transition',()=>{
  const before=describeM26MotionState(mockNode({
    matches:['.m26-sync-banner'],
    text:'Sincronizando…',
    status:'pending',
  }));
  const after=describeM26MotionState(mockNode({
    matches:['.m26-sync-banner'],
    text:'Sincronizado',
    status:'clean',
  }));
  assert.notEqual(before.signature,after.signature);
  assert.equal(shouldAnimateM26StateTransition(before.signature,after),true);
});

test('RC61.2 hidden semantic states never animate',()=>{
  const hidden=describeM26MotionState(mockNode({
    matches:['.m26-empty-copy'],
    text:'Sin elementos',
    hidden:true,
  }));
  assert.equal(hidden.visible,false);
  assert.equal(shouldAnimateM26StateTransition(null,hidden),false);
});

test('RC61.2 controller primes existing states and uses WeakMap signatures',()=>{
  const source=read('src/m26/motion/motion-controller.js');
  assert.match(source,/const stateSignatures=new WeakMap\(\)/u);
  assert.match(source,/function primeMotionStates/u);
  assert.match(source,/primeMotionStates\(\)/u);
  assert.match(source,/describeM26MotionState/u);
  assert.match(source,/shouldAnimateM26StateTransition/u);
  assert.doesNotMatch(source,/const animatedNodes=new WeakSet/u);
});

test('RC61.2 observer includes semantic visibility and status attributes',()=>{
  const source=read('src/m26/motion/motion-controller.js');
  assert.match(source,/attributeFilter:\['class','data-status','aria-busy','aria-hidden','hidden'\]/u);
  assert.match(source,/interestingMutationNodes/u);
  assert.match(source,/visitMotionStateNodes/u);
});

test('RC61.2 motion never authors product copy or accessibility meaning',()=>{
  const source=read('src/m26/motion/motion-controller.js');
  assert.doesNotMatch(source,/textContent\s*=/u);
  assert.doesNotMatch(source,/innerHTML\s*=/u);
  assert.doesNotMatch(source,/setAttribute\(\s*['"]aria-label/u);
  assert.doesNotMatch(source,/setAttribute\(\s*['"]role/u);
});

test('RC61.2 reduced motion remains authoritative after orchestration closeout',()=>{
  assert.equal(prefersReducedMotion({matchMedia:()=>({matches:true})}),true);
  const css=read('src/m26/design/primitives.css');
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css,/transition-duration: 0\.01ms !important/u);
  assert.match(css,/animation-duration: 0\.01ms !important/u);
});

test('RC61.2 keeps one native motion engine without new runtime dependencies',()=>{
  const pkg=read('package.json');
  const source=read('src/m26/motion/motion-controller.js');
  assert.doesNotMatch(pkg,/"motion"|"@formkit\/auto-animate"/iu);
  assert.doesNotMatch(source,/cdn\.jsdelivr|unpkg|https:\/\//u);
});

test('RC61.2 PWA versions closeout and preserves RC61.1 lineage',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc61-2[^\n]*m26-rc61-1/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc61-2[^\n]*m26-rc61-1/u);
  assert.match(sw,/"\/src\/m26\/motion\/motion-controller\.js"/u);
});

test('RC61.2 preserves durable Motion closeout and cross-cutting rails',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  assert.match(roadmap,/RC61=CLOSED_MOTION_MICROINTERACTIONS/u);
  assert.match(roadmap,/RC61_1=CLOSED_MOTION_FOUNDATION_REDUCED_MOTION/u);
  assert.match(roadmap,/RC61_2=CLOSED_SYNC_EMPTY_TRANSITIONS/u);
  assert.match(roadmap,/PREMIUM_REPORT_PARITY=REQUIRED_ALL_FORMAL_REPORTS_IRI_LEVEL/u);
  assert.match(roadmap,/RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u);
});