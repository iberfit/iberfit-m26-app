import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

// RC29 tests in a large monorepo can produce more than the Node spawnSync
// default stdout buffer. Preserve the actual TAP result instead of inventing
// a test failure when output is truncated.
const runner=readFileSync('scripts/run_rc29_validation.mjs','utf8');
test('RC29 runner raises the default bounded capture limit and reports safe failure causes',()=>{
 assert.match(runner,/MAX_RC29_OUTPUT_BYTES\s*=\s*64\s*\*\s*1024\s*\*\s*1024/);
 assert.match(runner,/maxBuffer:\s*MAX_RC29_OUTPUT_BYTES/);
 assert.match(runner,/result\.error\?\.code/);
 assert.match(runner,/result\.signal/);
 assert.match(runner,/RC29_VALIDATION_FAILED/);
 assert.doesNotMatch(runner,/steps\.push\(\{[^}]*stdout:/s,
  'do not retain complete child output again in long-lived steps');
});
test('a 2 MiB TAP-like subprocess output fails at Node default but succeeds with RC29 limit',()=>{
 const bytes=2*1024*1024;
 const cmd=['-e',`process.stdout.write('x'.repeat(${bytes}))`];
 const legacy=spawnSync(process.execPath,cmd,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.equal(legacy.error?.code,'ENOBUFS');
 const safe=spawnSync(process.execPath,cmd,{encoding:'utf8',stdio:['ignore','pipe','pipe'],
  maxBuffer:64*1024*1024});
 assert.equal(safe.status,0);
 assert.equal(safe.error,undefined);
 assert.equal(safe.stdout.length,bytes);
});
