import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {areaAllowedForRole,navigationForRole} from '../src/m26/shell/navigation.js';
import {resolveAdaptiveLayout} from '../src/m26/shell/shell-controller.js';

const inventory=JSON.parse(readFileSync(new URL('../qa/visual/signature-360-coverage.json',import.meta.url),'utf8'));
const roles=['client','coach','admin'];

test('SIGNATURE U22 inventory: 43 distinct role-routes, real role navigation, no invented certification',()=>{
  assert.deepEqual(roles.map((role)=>inventory.roles[role].length),[9,17,17]);
  const pairs=new Set();
  for(const role of roles){
    const nav=navigationForRole(role);
    const keys=new Set([...nav.primary,...nav.context,...nav.tools].map((item)=>item.key));
    for(const item of inventory.roles[role]){
      const key=role+':'+item.area;
      assert.equal(pairs.has(key),false,'duplicate '+key);
      pairs.add(key);
      assert.equal(keys.has(item.area),true,'missing real navigation '+key);
      assert.equal(areaAllowedForRole(item.area,role),true,'invalid role access '+key);
      assert.ok(['P0','P1'].includes(item.priority),'unknown priority '+key);
      assert.ok(['pending','verified','blocked','failed'].includes(item.evidenceStatus),'unknown evidence status '+key);
    }
  }
  assert.equal(pairs.size,43);
  assert.equal(inventory.status,'WIP_NOT_PRODUCTION','integral product certification must be explicit');
  assert.deepEqual(inventory.viewports,[320,390,768,1024,1440]);
  assert.deepEqual(inventory.screenStates,['loading','empty','populated','error','retry','offline','conflict','session-expired']);
});

test('SIGNATURE U22 role isolation preserves Cliente privacy and Admin control',()=>{
  for(const key of ['admin-usuarios','admin-clientes','admin-operaciones','iri','notas','verificacion']){
    assert.equal(areaAllowedForRole(key,'client'),false,key);
  }
  for(const key of ['clientes','expediente','iri','sesion','notas','verificacion']){
    assert.equal(areaAllowedForRole(key,'admin'),false,key);
  }
  assert.equal(areaAllowedForRole('biblioteca','admin'),true);
  assert.equal(areaAllowedForRole('biblioteca','coach'),true);
});

test('SIGNATURE U22 covers 5 physical widths with touch and pointer layouts',()=>{
  const expected=[
    [320,'compact-touch'],[390,'compact-touch'],
    [768,'medium-touch'],[1024,'medium-touch'],[1440,'expanded-touch'],
  ];
  for(const [width,layout] of expected){
    assert.equal(resolveAdaptiveLayout({width,coarsePointer:true,touchPoints:5}),layout,String(width));
  }
  assert.equal(resolveAdaptiveLayout({width:1440,coarsePointer:false,touchPoints:0}),'expanded-pointer');
});

test('SIGNATURE U22 permanently gates all roles on device matrix and native disclosure contract',()=>{
  const config=readFileSync(new URL('../playwright.device-experience.config.mjs',import.meta.url),'utf8');
  const spec=readFileSync(new URL('../qa/device-experience/signature-route-shell.spec.mjs',import.meta.url),'utf8');
  const shell=readFileSync(new URL('../src/m26/shell/shell-render.js',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
  assert.ok(config.includes("'signature-route-shell.spec.mjs'"));
  for(const role of roles)assert.ok(spec.includes("'"+role+"'"),role);
  assert.match(spec,/horizontal overflow/u);
  assert.ok(spec.includes("page.keyboard.press('Escape')"));
  assert.doesNotMatch(shell,/class="m26-mobile-more-menu" role="menu"/u);
  assert.doesNotMatch(shell,/aria-controls="m26-mobile-more-menu" aria-haspopup="menu"/u);
  const fixture=readFileSync(new URL('../qa/visual/signature-route-shell.fixture.mjs',import.meta.url),'utf8');
  assert.ok(fixture.includes('admin_media_review_enabled:true'),'fixture needs explicit QA Media Factory flag');
  assert.ok(fixture.includes("role==='admin'"),'Media Factory QA flag must be role-scoped');
  const guard=readFileSync(new URL('../src/m26/shell/route-guard.js',import.meta.url),'utf8');
  assert.ok(guard.includes('M26_ADMIN_MEDIA_REVIEW_DISABLED'),'preserve fail-closed route gate');
  assert.match(controller,/includeMobileMore/u);
  const media=readFileSync(new URL('../src/m26/admin/media-review.js',import.meta.url),'utf8');
  assert.match(media,/live&&live\.textContent!==pending/u,
    'Admin Media Factory loading text must not schedule an infinite mutation loop');
  assert.ok(controller.includes('function onKeyDown(event)'));
});
