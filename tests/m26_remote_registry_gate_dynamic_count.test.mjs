import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const remoteGate=readFileSync(new URL('../scripts/remote-gates/run_authenticated_readonly_gate.mjs',import.meta.url),'utf8');

test('remote authenticated readonly gate derives registry count from canonical catalog',()=>{
  assert.match(remoteGate,/const expectedCommands=M26_EXTENDED_COMMAND_REGISTRY\.length;/u);
  assert.match(remoteGate,/remoteRegistry\.length!==expectedCommands/u);
  assert.match(remoteGate,/expectedCommands,remoteCommands:remoteRegistry\.length/u);
  assert.doesNotMatch(remoteGate,/remoteRegistry\.length!==52/u);
  assert.doesNotMatch(remoteGate,/expectedCommands:52/u);
});
