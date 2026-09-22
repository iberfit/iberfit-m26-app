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

test('route navigation retires transient pointer and stale form locks before committing state',()=>{
  const block=areaNavigationBlock();
  const pointerRelease=block.indexOf('releasePointerInteraction({deferRender:false});');
  const formRelease=block.indexOf('releaseFormInteraction({deferRender:false});');
  const transition=block.indexOf('runRouteViewTransition(');
  const navigate=block.indexOf('store.navigate(decision.area);');

  assert.ok(pointerRelease>=0,'route navigation must release pointer interaction');
  assert.ok(formRelease>pointerRelease,'route navigation must retire stale form interaction after pointer release');
  assert.ok(transition>formRelease,'both interaction locks must be retired before route transition');
  assert.ok(navigate>transition,'navigation must remain inside the route transition');
});

test('shell render lock follows actual editable focus instead of a stale focus reference',()=>{
  const match=source.match(/function shellInteractionActive\(\)\{([^}]*)\}/u);
  assert.ok(match,'shellInteractionActive must exist');
  const body=match[1];
  assert.doesNotMatch(body,/interactionFocusTarget/u,'historical focus references must not keep the shell locked');
  assert.match(body,/focusedInteractiveControl\(\)/u,'actual focused editable controls must still protect continuity');
});

test('form and native-select interaction protection remains unchanged',()=>{
  assert.match(source,/const INTERACTION_RELEASE_GRACE_MS=900;/u);
  assert.match(source,/const NATIVE_SELECT_INTERACTION_HOLD_MS=30_000;/u);
  assert.match(source,/function shellInteractionActive\(\)\{return Boolean\(interactionPointerTarget\|\|focusedInteractiveControl\(\)\|\|\(formInteractionTarget&&root\.contains\?\.\(formInteractionTarget\)\)\);\}/u);
});
