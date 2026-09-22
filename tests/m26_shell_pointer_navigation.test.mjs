import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');

function areaNavigationBlock(){
  const start=source.indexOf("const areaButton = event.target.closest?.('[data-m26-area]');");
  const end=source.indexOf("const actionButton = event.target.closest?.('[data-m26-action]');",start);
  assert.notEqual(start,-1,'data-m26-area handler must exist');
  assert.notEqual(end,-1,'area handler must end before generic actions');
  return source.slice(start,end);
}

test('route navigation releases only the transient pointer lock before committing state',()=>{
  const block=areaNavigationBlock();
  const release=block.indexOf('releasePointerInteraction({deferRender:false});');
  const transition=block.indexOf('runRouteViewTransition(');
  const navigate=block.indexOf('store.navigate(decision.area);');

  assert.ok(release>=0,'route navigation must release pointer interaction');
  assert.ok(transition>release,'pointer release must happen before route transition');
  assert.ok(navigate>transition,'navigation must remain inside the route transition');
  assert.doesNotMatch(block,/releaseFormInteraction/u,'route clicks must not weaken form continuity');
});

test('form and native-select interaction protection remains unchanged',()=>{
  assert.match(source,/const INTERACTION_RELEASE_GRACE_MS=900;/u);
  assert.match(source,/const NATIVE_SELECT_INTERACTION_HOLD_MS=30_000;/u);
  assert.match(source,/function shellInteractionActive\(\)\{return Boolean\(interactionPointerTarget\|\|interactionFocusTarget\|\|focusedInteractiveControl\(\)\|\|\(formInteractionTarget&&root\.contains\?\.\(formInteractionTarget\)\)\);\}/u);
});
