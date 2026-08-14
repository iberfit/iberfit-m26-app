import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  IBERFIT_PRIMITIVE_CONTRACT,
  primitiveContractAudit,
} from '../src/m26/design/primitives.js';

const css=fs.readFileSync('src/m26/design/primitives.css','utf8');
const doc=fs.readFileSync('docs/RC58_3A_PRIMITIVE_COMPLETENESS.md','utf8');

const approvedMinimum=[
  'Button','IconButton','Link','Field','Input','Textarea','Select',
  'Checkbox','Radio','Switch','Badge','Chip','Card','Panel','Metric','KPI',
  'Alert','Notice','Toast','Skeleton','EmptyState','ErrorState','RetryState',
  'OfflineState','SyncState','Tooltip','Popover','Dialog','Sheet','Tabs',
  'SegmentedControl','Progress','TableShell','FilterBar','SearchField'
];

test('contrato RC58.3 coincide con los 35 primitives mínimos aprobados',()=>{
  assert.equal(IBERFIT_PRIMITIVE_CONTRACT.version,'58.3.1');
  assert.equal(IBERFIT_PRIMITIVE_CONTRACT.primitives.length,35);
  assert.deepEqual([...IBERFIT_PRIMITIVE_CONTRACT.primitives],approvedMinimum);
  assert.equal(primitiveContractAudit().ok,true);
});

test('los seis primitives omitidos inicialmente tienen CSS canónico',()=>{
  for(const selector of [
    '.iberfit-link',
    '.iberfit-checkbox',
    '.iberfit-radio',
    '.iberfit-switch',
    '.iberfit-kpi',
    '.iberfit-toast'
  ]){
    assert.equal(css.includes(selector),true,selector);
  }
});

test('conflict tiene tratamiento visual propio y no solo color',()=>{
  assert.match(css,/\.iberfit-state\[data-state="conflict"\]/);
  const conflict=css.match(
    /\.iberfit-state\[data-state="conflict"\]\s*\{([\s\S]*?)\}/
  );
  assert.ok(conflict);
  assert.match(conflict[1],/border-style:\s*dashed/);
});

test('choice controls mantienen foco y target táctil',()=>{
  assert.match(css,/\.iberfit-choice[\s\S]*?min-height:\s*var\(--iberfit-control-height\)/);
  assert.match(css,/\.iberfit-checkbox:focus-visible/);
  assert.match(css,/\.iberfit-radio:focus-visible/);
  assert.match(css,/\.iberfit-switch input:focus-visible \+ \.iberfit-switch-track/);
});

test('patch queda documentado y sin deuda escondida',()=>{
  assert.match(doc,/RC58_3A_APPROVED_SCOPE_MINIMUM_COMPLETE=TRUE/);
  assert.match(doc,/RC58_3_CANONICAL_PRIMITIVE_COUNT=35/);
  assert.match(doc,/NEXT_ACTION=RC58_4_ROLE_SURFACES/);
});