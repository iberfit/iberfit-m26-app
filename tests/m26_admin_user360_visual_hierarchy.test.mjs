import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
const premium=readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');

test('Admin User 360 uses the quiet editorial directory layer',()=>{
  const begin=css.indexOf('ADMIN_USER_DIRECTORY_EDITORIAL_BEGIN');
  const end=css.indexOf('ADMIN_USER_DIRECTORY_EDITORIAL_END');
  assert.ok(begin>=0&&end>begin);
  const layer=css.slice(begin,end);
  assert.ok(layer.includes('.m26-admin-user360 [data-admin-user-results]'));
  assert.ok(layer.includes('grid-template-columns:1fr'));
  assert.ok(layer.includes('.m26-admin-user360-grid > div'));
  assert.ok(layer.includes('.m26-admin-user-management'));
  assert.ok(layer.includes('min-height:44px'));
  assert.ok(layer.includes('@media(max-width:680px)'));
});

test('Premium V3 preserves the quiet Users 360 exception after global card rules',()=>{
  const begin=premium.indexOf('ADMIN_USER_DIRECTORY_QUIET_V1_BEGIN');
  const end=premium.indexOf('ADMIN_USER_DIRECTORY_QUIET_V1_END');
  assert.ok(begin>=0&&end>begin);
  const layer=premium.slice(begin,end);
  assert.ok(layer.includes('.m26-admin-user360-overview'));
  assert.ok(layer.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'));
  assert.ok(layer.includes('.m26-admin-user-directory-tools'));
  assert.ok(layer.includes('.m26-admin-user-management'));
  assert.ok(layer.includes('background:transparent!important'));
  assert.ok(layer.includes('box-shadow:none!important'));
});
