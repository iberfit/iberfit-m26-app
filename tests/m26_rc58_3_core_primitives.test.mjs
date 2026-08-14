import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  IBERFIT_PRIMITIVE_CONTRACT,
  primitiveContractAudit,
} from '../src/m26/design/primitives.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const css=read('src/m26/design/primitives.css');
const js=read('src/m26/design/primitives.js');
const index=read('public/m26/index.html');
const uiIndex=read('src/m26/ui/index.js');
const launch=read('docs/APP_IBERFIT_CL_LAUNCH_PARITY.md');
const rc58=read('docs/RC58_3_CORE_PRIMITIVES.md');

test('primitive contract cubre el conjunto mínimo premium',()=>{
  const required=[
    'Button','IconButton','Link','Field','Input','Textarea','Select',
    'Checkbox','Radio','Switch','Badge','Chip','Card','Panel','Metric','KPI',
    'Alert','Notice','Toast','Skeleton','EmptyState',
    'ErrorState','RetryState','OfflineState','SyncState','Tooltip','Popover',
    'Dialog','Sheet','Tabs','SegmentedControl','Progress','TableShell',
    'FilterBar','SearchField'
  ];
  for(const primitive of required){
    assert.equal(IBERFIT_PRIMITIVE_CONTRACT.primitives.includes(primitive),true,primitive);
  }
  assert.equal(primitiveContractAudit().ok,true);
});

test('primitives adoptan superficies legacy sin borrar funcionalidad',()=>{
  for(const selector of [
    '.m26-primary-action',
    '.m26-icon-button',
    '.m26-field',
    '.m26-badge',
    '.m26-panel',
    '.m26-stat',
    '.m26-list-card',
    '.m26-client-card',
    '.m26-library-card',
    '.m26-form-status',
    '.m26-action-state'
  ]){
    assert.equal(css.includes(selector),true,selector);
  }
  assert.match(rc58,/RC58_3_STRATEGY=COMPATIBILITY_FIRST/);
  assert.match(rc58,/RC58_3_BUSINESS_LOGIC_DUPLICATED=FALSE/);
});

test('primitives son presentación pura sin frontera de datos o auth',()=>{
  for(const forbidden of [
    /\bfetch\s*\(/,
    /\bsupabase\b/i,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bservice[_-]?role\b/i,
    /\bonclick\s*=/i
  ]){
    assert.doesNotMatch(js,forbidden);
  }
  assert.equal(IBERFIT_PRIMITIVE_CONTRACT.noBusinessLogic,true);
});

test('CSS incluye accesibilidad, estados y reduced motion',()=>{
  assert.match(css,/focus-visible/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(css,/prefers-contrast:\s*more/);
  for(const state of ['success','warning','error','conflict','offline','syncing']){
    assert.equal(css.includes(`data-state="${state}"`),true,state);
  }
  assert.match(css,/--iberfit-control-height:\s*var\(--iberfit-size-touch-target\)/);
});

test('primitives CSS se carga al final de la cascada histórica',()=>{
  const primitivePosition=index.indexOf('/src/m26/design/primitives.css');
  const rc44Position=index.indexOf('/src/m26/rc44/rc44.css');
  assert.ok(rc44Position>0);
  assert.ok(primitivePosition>rc44Position);
  assert.match(uiIndex,/export \* from '\.\.\/design\/primitives\.js';/);
});

test('contrato de lanzamiento preserva app.iberfit.cl hasta cutover controlado',()=>{
  assert.match(launch,/FINAL_APP_LAUNCH_DOMAIN=app\.iberfit\.cl/);
  assert.match(launch,/CURRENT_APP_IBERFIT_CL_PRESERVE_UNTIL_CONTROLLED_CUTOVER=TRUE/);
  assert.match(launch,/FUNCTIONAL_PARITY_REQUIRED_BEFORE_CUTOVER=TRUE/);
  assert.match(launch,/ROLLBACK_REQUIRED_BEFORE_CUTOVER=TRUE/);
  assert.match(launch,/PRESERVE_AND_IMPROVE/);
  assert.match(launch,/wearables\/live HR/);
  assert.match(launch,/Admin/);
  assert.match(launch,/NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY/);
});

test('siguiente paso es role surfaces sin despliegue',()=>{
  assert.match(rc58,/NEXT_ACTION=RC58_4_ROLE_SURFACES/);
  assert.match(rc58,/NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY/);
  assert.match(rc58,/NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY/);
});