import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

function tail(value,limit=7000){
  const text=String(value||'');
  return text.length<=limit?text:text.slice(-limit);
}

test('000 RC29 build diagnostic remains within packaging budgets',()=>{
  const result=spawnSync(
    process.execPath,
    ['scripts/build_rc29_prepublication_candidate.mjs'],
    {encoding:'utf8'},
  );

  assert.equal(
    result.status,
    0,
    `RC29_BUILD_DIAGNOSTIC status=${result.status}\nSTDOUT\n${tail(result.stdout)}\nSTDERR\n${tail(result.stderr)}`,
  );
});
