import test from 'node:test';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('GX350 real local Edge modules preserve denial across prior/candidate/prior with isolated native module trees',()=>{
 const script=fileURLToPath(new URL('../scripts/ops/gx350_edge_local_runtime.mjs',import.meta.url));
 const out=execFileSync(process.execPath,[script],{encoding:'utf8',timeout:45000,maxBuffer:65536,env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(?:SUPABASE|TOKEN|SECRET|PASSWORD|API[_-]?KEY)/i.test(k)))});
 const p=JSON.parse(out);assert.equal(p.instances,18);assert.equal(p.checks,90);
 assert.equal(p.realLocalModules,true);assert.equal(p.externalPackagesStubbed,true);assert.equal(p.hostedRollbackVerified,false);assert.equal(p.productionAuthorized,false);assert.equal(p.remoteWrites,0);
});
