import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
const qaSource=fs.readFileSync(new URL('../qa/rc64/authenticated-current-contract.spec.mjs',import.meta.url),'utf8');

function navBlock(){
  const start=source.lastIndexOf("    const areaButton = event.target.closest?.('[data-m26-area]');");
  const end=source.indexOf("    const actionButton = event.target.closest?.('[data-m26-action]');",start);
  assert.ok(start>0&&end>start);
  return source.slice(start,end);
}

test('B37: real Client touch click finishes before any navigation-induced shell rebuild',()=>{
  const block=navBlock();
  assert.match(block,/releasePointerInteraction\(\{deferRender:false\}\)/u);
  assert.match(block,/releaseFormInteraction\(\{deferRender:false\}\)/u);
  assert.match(block,/const clientTouch=String\(current\.identity\?\.role\|\|''\)==='client'/u);
  assert.match(block,/maxTouchPoints/u);
  assert.match(block,/pointer: coarse/u);
  assert.match(block,/if\(clientTouch&&typeof windowLike\?\.setTimeout==='function'\)/u);
  assert.match(block,/windowLike\.setTimeout\(\(\)=>\{/u);
  assert.match(block,/\},0\);\s*\}else commitRoute\(\);/u);
  assert.ok(block.indexOf('runRouteViewTransition(')>block.indexOf('releaseFormInteraction('));
  assert.ok(block.indexOf('store.navigate(decision.area);')>block.indexOf('runRouteViewTransition('));
});

test('B37: delayed touch commits fail closed on newer navigation, logout or account switch',()=>{
  const block=navBlock();
  assert.match(block,/const ticket=\+\+touchRouteTicket/u);
  assert.match(block,/ticket!==touchRouteTicket\|\|version!==generation\|\|!unsubscribe/u);
  assert.match(block,/String\(latest\.identity\?\.id\|\|''\)!==ownerId/u);
  assert.match(block,/String\(latest\.identity\?\.role\|\|''\)!=='client'/u);
  assert.match(block,/String\(latest\.activeArea\|\|''\)!==previousArea/u);
  assert.match(block,/commitRoute\(\);/u);
  assert.match(source,/function destroy\(\)\s*\{[^]*?generation\+=1;/u);
});

test('B37: existing UI harness still checks a physical click and a real route change',()=>{
  assert.match(qaSource,/visibleNavigationTarget\.click\(\{timeout:5_000\}\)/u);
  assert.match(qaSource,/\[aria-current="page"\]:visible/u);
  assert.match(qaSource,/RC64_CLIENT_NAV_CLICK_LATENCY/u);
});
