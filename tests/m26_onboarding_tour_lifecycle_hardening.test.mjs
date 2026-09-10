import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE,
  createProgressiveOnboardingOpenState,
  __progressiveOnboardingInternals,
} from '../src/m26/onboarding/progressive-onboarding.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function fakeRoot(){
  const attributes=new Map();
  return {
    setAttribute(name,value){attributes.set(name,String(value));},
    removeAttribute(name){attributes.delete(name);},
    getAttribute(name){return attributes.has(name)?attributes.get(name):null;},
    attributes,
  };
}

function fakeDocument(){
  let tourOpen=false;
  return {
    setTourOpen(value){tourOpen=Boolean(value);},
    querySelector(selector){
      if(selector==='[data-m26-guided-tour]')return tourOpen?{}:null;
      return null;
    },
  };
}

test('tour open state notifies true, activates compaction, restores on close and can reopen',()=>{
  const root=fakeRoot();
  const documentLike=fakeDocument();
  const changes=[];
  const state=createProgressiveOnboardingOpenState({
    root,
    documentLike,
    onOpenChange:(open)=>changes.push(open),
  });

  assert.equal(state.sync(),false);
  assert.equal(root.getAttribute(PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE),null);
  assert.deepEqual(changes,[]);

  documentLike.setTourOpen(true);
  assert.equal(state.sync(),true);
  assert.equal(state.isOpen(),true);
  assert.equal(root.getAttribute(PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE),'true');
  assert.deepEqual(changes,[true]);

  assert.equal(state.sync(),true,'repeated sync must not duplicate notifications');
  assert.deepEqual(changes,[true]);

  documentLike.setTourOpen(false);
  assert.equal(state.sync(),false);
  assert.equal(state.isOpen(),false);
  assert.equal(root.getAttribute(PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE),null);
  assert.deepEqual(changes,[true,false]);

  documentLike.setTourOpen(true);
  state.sync();
  documentLike.setTourOpen(false);
  state.sync();
  assert.deepEqual(changes,[true,false,true,false]);
  assert.equal(root.getAttribute(PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE),null);
});

test('unmount cleanup is idempotent and callback exceptions cannot strand visual state',()=>{
  const root=fakeRoot();
  const documentLike=fakeDocument();
  const events=[];
  const state=createProgressiveOnboardingOpenState({
    root,
    documentLike,
    onOpenChange:(open)=>{
      events.push(open);
      if(open)throw new Error('consumer failure');
    },
  });

  documentLike.setTourOpen(true);
  assert.doesNotThrow(()=>state.sync());
  assert.equal(root.getAttribute(PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE),'true');
  assert.deepEqual(events,[true]);

  assert.doesNotThrow(()=>state.clear());
  assert.equal(state.isOpen(),false);
  assert.equal(root.getAttribute(PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE),null);
  assert.deepEqual(events,[true,false]);

  assert.doesNotThrow(()=>state.clear());
  assert.deepEqual(events,[true,false], 'repeated cleanup must not duplicate callbacks');
});

test('active-tour compaction is additive, responsive and keeps controls reachable',()=>{
  const css=__progressiveOnboardingInternals.PROGRESSIVE_ONBOARDING_COMPACT_STYLE_TEXT;
  assert.match(css,new RegExp(`\\[${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"\\] \\.m26-topbar`,'u'));
  assert.match(css,new RegExp(`\\[${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"\\] \\.m26-main`,'u'));
  assert.match(css,/@media \(min-width:901px\)[\s\S]*\.m26-sidebar/u);
  assert.match(css,/@media \(max-width:900px\)[\s\S]*\.m26-guided-tour[\s\S]*bottom:calc\(4\.75rem \+ env\(safe-area-inset-bottom\)\)/u);
  assert.match(css,/@media \(max-width:580px\)/u);
  assert.match(css,/prefers-reduced-motion:reduce/u);
  assert.doesNotMatch(css,/display\s*:\s*none|pointer-events\s*:|overflow\s*:\s*hidden|visibility\s*:\s*hidden/iu);
  assert.doesNotMatch(css,/\.m26-nav-item\s*\{[^}]*min-height/iu,'tour compaction must not shrink navigation touch targets');
});

test('controller wires optional outward state, redundant close detection and complete cleanup',()=>{
  const source=read('src/m26/onboarding/progressive-onboarding.js');
  assert.match(source,/createProgressiveOnboardingController\(\{[\s\S]*onOpenChange,/u);
  assert.match(source,/createProgressiveOnboardingOpenState\(\{root,documentLike,onOpenChange\}\)/u);
  assert.match(source,/tourObserver\.observe\(documentLike\.body,\{childList:true\}\)/u);
  assert.match(source,/documentLike\?\.addEventListener\?\.\('click',onDocumentTourClick,true\)/u);
  assert.match(source,/documentLike\?\.addEventListener\?\.\('keydown',onDocumentTourKeydown,true\)/u);
  assert.match(source,/guidedTour\.open\?\.\(\);\n\s*syncTourOpenState\(\)/u);
  assert.match(source,/guidedTour\.refresh\?\.\(\);\n\s*scheduleTourOpenStateSync\(\)/u);
  assert.match(source,/tourObserver\?\.disconnect\?\.\(\);[\s\S]*guidedTour\.destroy\?\.\(\);[\s\S]*tourOpenState\.clear\(\);[\s\S]*releaseCompactStyle\?\.\(\)/u);
  const destroyStart=source.indexOf('    destroy(){');
  const refreshStart=source.indexOf('    refresh(){',destroyStart);
  const destroySection=source.slice(destroyStart,refreshStart);
  assert.ok(destroyStart>=0&&refreshStart>destroyStart);
  assert.doesNotMatch(destroySection,/if\(!mounted\)return/u,'destroy must clean residual state even after imperfect lifecycle ordering');
  assert.match(source,/isTourOpen\(\)[\s\S]*tourOpenState\.isOpen\(\)/u);
});

test('all real guided-tour exits remove the dialog so the bridge reports false',()=>{
  const guided=[
    read('src/m26/onboarding/guided-tour.js'),
    fs.existsSync('src/m26/onboarding/guided-tour-core.js')?read('src/m26/onboarding/guided-tour-core.js'):'',
  ].join('\n');
  assert.match(guided,/function pause\(\)[\s\S]*?suppressed=true;\n\s*removeDialog\(\);/u);
  assert.match(guided,/function skip\(\)[\s\S]*?suppressed=true;\n\s*removeDialog\(\);/u);
  assert.match(guided,/function complete\(\)[\s\S]*?suppressed=true;\n\s*removeDialog\(\);/u);
  assert.match(guided,/data-m26-guided-tour-close[^\n]*pause\(\)/u);
  assert.match(guided,/data-m26-guided-tour-skip[^\n]*skip\(\)/u);
  assert.match(guided,/if\(index>=available\.length-1\)\{\n\s*complete\(\)/u);
  assert.match(guided,/if\(!contextValue\)\{[\s\S]*?removeDialog\(\{restoreFocus:false\}\)/u);
  assert.match(guided,/lastContextKey!==contextValue\.key\)[\s\S]*?removeDialog\(\{restoreFocus:false\}\)/u);
  assert.match(guided,/event\.key!=='Escape'[\s\S]*?pause\(\)/u);
  assert.match(guided,/destroy\(\)\{[\s\S]*?removeDialog\(\{restoreFocus:false\}\)/u);
});

test('layout adaptation is root-scoped and does not introduce global scroll or input locks',()=>{
  const source=read('src/m26/onboarding/progressive-onboarding.js');
  const css=__progressiveOnboardingInternals.PROGRESSIVE_ONBOARDING_COMPACT_STYLE_TEXT;
  assert.match(source,/root\?\.setAttribute\?\.\(PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE,'true'\)/u);
  assert.match(source,/root\?\.removeAttribute\?\.\(PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE\)/u);
  assert.doesNotMatch(source,/documentElement\.(?:classList|style)|documentLike\?\.body\?\.(?:classList|style)/u);
  assert.doesNotMatch(css,/html\s*\{|body\s*\{|overscroll-behavior|touch-action|pointer-events/iu);
});

test('mobile tour clears the bottom navigation while desktop compacts chrome without hiding it',()=>{
  const shell=read('src/m26/shell/shell.css');
  const css=__progressiveOnboardingInternals.PROGRESSIVE_ONBOARDING_COMPACT_STYLE_TEXT;
  assert.match(shell,/\.m26-mobile-nav \{ display: grid; position: sticky; bottom: 0;/u);
  assert.match(css,/\.m26-guided-tour\{\n\s*bottom:calc\(4\.75rem \+ env\(safe-area-inset-bottom\)\)/u);
  assert.match(css,/@media \(min-width:901px\)[\s\S]*\.m26-sidebar/u);
  assert.doesNotMatch(css,/\.m26-mobile-nav[\s\S]{0,120}display\s*:\s*none/iu);
});

test('existing onboarding contracts remain intact while the new callback stays optional',()=>{
  const source=read('src/m26/onboarding/progressive-onboarding.js');
  assert.match(source,/const guidedTour=createGuidedTourController\(\{root,identityProvider,storage,scope\}\);/u);
  assert.match(source,/guidedTour\.mount\?\.\(\)/u);
  assert.match(source,/guidedTour\.destroy\?\.\(\)/u);
  assert.match(source,/guidedTour\.refresh\?\.\(\)/u);
  const root=fakeRoot();
  const documentLike=fakeDocument();
  assert.doesNotThrow(()=>createProgressiveOnboardingOpenState({root,documentLike}));
});
