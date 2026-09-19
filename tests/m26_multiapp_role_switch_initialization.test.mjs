import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source=await fs.readFile(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
const add="root.addEventListener('m26:switch-role',onSwitchRole);";
const remove="root.removeEventListener('m26:switch-role',onSwitchRole);";

test('visible multiapp choice is wired before progressive shell paint',()=>{
  const setup=source.indexOf('async function setupAuthenticated(){');
  const listener=source.indexOf(add,setup);
  const mount=source.indexOf('shell.mount({progressive:true});',setup);
  assert.ok(setup>=0,'authenticated setup exists');
  assert.ok(listener>setup,'role-switch listener is installed during authenticated setup');
  assert.ok(mount>listener,'listener is installed before the progressive shell exposes role choice');
  assert.equal(source.split(add).length-1,1,'role-switch listener is installed exactly once');
});

test('role-switch listener retains teardown symmetry',()=>{
  const listener=source.indexOf(add);
  const teardown=source.indexOf(remove,listener);
  assert.ok(listener>=0);
  assert.ok(teardown>listener,'destroyControllers removes the early role-switch listener');
});
