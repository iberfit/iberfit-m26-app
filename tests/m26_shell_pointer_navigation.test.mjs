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


test('explicit route commits reconcile canonical state with the rendered route',()=>{
  const block=areaNavigationBlock();
  const navigate=block.indexOf('store.navigate(decision.area);');
  const reconcileAfterNavigate=block.indexOf('reconcileRouteRender(decision.area);',navigate);

  assert.ok(navigate>=0,'explicit route navigation must still commit canonical state');
  assert.ok(
    reconcileAfterNavigate>navigate,
    'explicit route navigation must verify that the committed route actually rendered'
  );

  const helperStart=source.indexOf('function reconcileRouteRender(area){');
  const helperEnd=source.indexOf('function focusMain()',helperStart);

  assert.ok(helperStart>=0,'route reconciliation helper must exist');
  assert.ok(helperEnd>helperStart,'route reconciliation helper must remain locally bounded');

  const helper=source.slice(helperStart,helperEnd);

  assert.match(
    helper,
    /String\(state\.activeArea\|\|''\)!==expected\|\|renderedArea\(\)===expected/u,
    'reconciliation must no-op when canonical state moved on or DOM already matches'
  );

  const clearQueued=helper.indexOf('queuedState=null;');
  const invalidateMarkup=helper.indexOf("lastMarkup='';");
  const forceRender=helper.indexOf('renderNow(state,{force:true});');

  assert.ok(clearQueued>=0,'stale deferred route state must be retired before reconciliation');
  assert.ok(invalidateMarkup>clearQueued,'markup identity must be invalidated only after a proven mismatch');
  assert.ok(forceRender>invalidateMarkup,'a proven state/DOM mismatch must force one reconciliation render');
});

test('same canonical route repairs stale rendered markup instead of returning silently',()=>{
  const block=areaNavigationBlock();
  const sameRoute=block.indexOf("if(String(current.activeArea||'')===String(decision.area||'')){");
  const reconcile=block.indexOf('reconcileRouteRender(decision.area);',sameRoute);
  const focus=block.indexOf('focusMain();',sameRoute);
  const end=block.indexOf('return;',sameRoute);

  assert.ok(sameRoute>=0,'same-route guard must remain present');
  assert.ok(reconcile>sameRoute,'same-route selection must reconcile stale rendered state');
  assert.ok(focus>reconcile,'focus restoration must follow reconciliation scheduling');
  assert.ok(end>focus,'same-route branch may return only after reconciliation is scheduled');
});

test('touch pointerup inside mobile Más activates the route before the native click can be lost',()=>{
  const start=source.indexOf('function onPointerRelease(event){');
  const end=source.indexOf('function onPointerCancel()',start);

  assert.ok(start>=0,'pointer release handler must receive the PointerEvent');
  assert.ok(end>start,'pointer release handler must remain locally bounded');

  const block=source.slice(start,end);

  assert.match(block,/details\.m26-mobile-more/u,'fast path must be limited to mobile Más');
  assert.match(block,/control===areaButton/u,'touch must end on the same route control that received pointerdown');
  assert.match(block,/\['touch','pen'\]\.includes\(pointerType\)/u,'mouse and keyboard navigation must remain on the normal click path');
  assert.match(block,/event\.isPrimary!==false/u,'secondary multi-touch pointers must not commit routes');

  const release=block.indexOf('releasePointerInteraction({deferRender:false});');
  const click=block.indexOf('areaButton.click?.();');
  const fallback=block.indexOf('schedulePointerRelease(control);');

  assert.ok(release>=0,'touch route activation must retire the transient pointer lock first');
  assert.ok(click>release,'the proven DOM click path must run after pointer lock release');
  assert.ok(fallback>click,'normal pointer release must remain the fallback');
});