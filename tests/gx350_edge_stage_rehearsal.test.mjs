import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {verifyModuleGraph,rehearseEdgePackages,repositoryReader} from '../scripts/ops/gx350_edge_stage_rehearsal.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const m=JSON.parse(readFileSync(new URL('../scripts/ops/gx350_edge_scope.json',import.meta.url),'utf8'));
const files=items=>new Map(Object.entries(items).map(([name,value])=>[name,Buffer.from(value)]));
test('six real source packages close all local dependencies; not a runtime certificate',()=>{
 const p=rehearseEdgePackages(m,repositoryReader(root));
 assert.equal(p.packages,6);assert.equal(p.repositoryFiles,33);
 assert.equal(p.proofs.reduce((n,x)=>n+x.modules,0),31);
 assert.equal(p.productionAuthorized,false);assert.equal(p.rollbackRuntimeCertified,false);
 assert.equal(p.remoteWrites,0);
});
test('reject missing module, unpinned remote, dynamic import, path escape, unreachable source',()=>{
 for(const x of [
  {'index.ts':"import './missing.js';"},
  {'index.ts':"import 'npm:pdf-lib@latest';"},
  {'index.ts':"const x=import('./other.js');"},
  {'index.ts':"import '../escape.js';"},
  {'index.ts':'// entry','hidden.js':'// unused'}
 ])assert.throws(()=>verifyModuleGraph(files(x)),/GX350_EDGE_STAGE_/);
});
test('multiline import and nested reexport resolve only within package',()=>{
 const x=files({'index.ts':"import {\n  x\n} from './nested/a.js';\nimport 'npm:pdf-lib@1.17.1';",'nested/a.js':"export * from '../b.js';",'b.js':'export const x=1;'});
 assert.deepEqual(verifyModuleGraph(x),{modules:3,externalDependencies:1});
});
test('reject any altered recovered bytes',()=>assert.throws(()=>rehearseEdgePackages(m,()=>Buffer.from('drift')),/SOURCE_DRIFT/));
