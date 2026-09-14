import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {__adminControllerInternals} from '../src/m26/admin/controller.js';

const controller=fs.readFileSync('src/m26/admin/controller.js','utf8').replace(/\r\n/g,'\n');
const render=fs.readFileSync('src/m26/admin/route-render.js','utf8').replace(/\r\n/g,'\n');
const css=fs.readFileSync('src/m26/admin/admin.css','utf8').replace(/\r\n/g,'\n');

test('real client creation extracts the persisted client id from supported Admin response shapes',()=>{
  const {createdClientId}=__adminControllerInternals;
  assert.equal(createdClientId({response:{clientId:'CLIENT-A'}}),'CLIENT-A');
  assert.equal(createdClientId({response:{client_id:'CLIENT-B'}}),'CLIENT-B');
  assert.equal(createdClientId({response:[{entityId:'CLIENT-C'}]}),'CLIENT-C');
  assert.equal(createdClientId({response:{data:{client_id:'CLIENT-D'}}}),'CLIENT-D');
  assert.equal(createdClientId({}),'');
});

test('successful Admin creation preserves the new client context after refresh',()=>{
  assert.match(controller,/let pendingCreatedClientId='';/u);
  assert.match(controller,/if\(clientId\)pendingCreatedClientId=clientId;/u);
  assert.match(controller,/if\(outcome\?\.ok===true\)\{\n\s+render\(\);[\s\S]*?clientWizard\.sync\(\);\n\s+restoreCreatedClientFocus\(\);\n\s+return;/u);
  assert.match(controller,/clientWizard\.sync\(\);\n\s+restoreCreatedClientFocus\(\);/u);
  assert.match(controller,/\[data-admin-client-edit-open\]/u);
  assert.match(controller,/scrollIntoView/u);
});

test('Admin client rows expose stable ids and highlight the just-created record without animation',()=>{
  assert.match(render,/data-admin-client-id="\$\{e\(c\.id\)\}"/u);
  assert.match(css,/data-admin-client-created="true"/u);
  assert.doesNotMatch(css.slice(css.indexOf('ADMIN_POST_CREATE_CLIENT_CONTINUITY_V1')),/@keyframes|animation:/u);
});
