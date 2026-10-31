import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {argsFor,exportPrivate} from '../scripts/stitch_export_private.mjs';
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const id='abcdef1234567890';
const stub={project:()=>({screens:async()=>[{id,getHtml:async()=>'<html><body>DEMO</body></html>',getImage:async()=>png}]}),
  callTool:async()=>({screenInstances:[{sourceScreen:'projects/1399435845853535416/screens/'+id,label:'Cliente · Hoy V2.3',width:390,height:844}]})};
test('fail-closed argument handling',()=>{
  assert.throws(()=>argsFor(['--project','../etc']),/BAD_PROJECT/);
  assert.throws(()=>argsFor(['--limit','100']),/BAD_LIMIT/);
  assert.equal(argsFor(['--screen',id]).title,'');
});
test('list is read-only and uses canvas labels',async()=>{
  const r=await exportPrivate({sdk:stub,options:argsFor(['--list'])});
  assert.equal(r.screens.length,1);assert.equal(r.screens[0].width,390);
});
test('HTML and image retained only in ignored directory with digests',async()=>{
  const root=await mkdtemp(join(tmpdir(),'iberfit-stitch-'));
  const r=await exportPrivate({sdk:stub,root,options:argsFor([])});
  assert.deepEqual((await readdir(r.output)).sort(),[id+'.html',id+'.png','manifest.json']);
  const m=JSON.parse(await readFile(join(r.output,'manifest.json'),'utf8'));
  assert.equal(m.exported[0].sha256.image.length,64);
  assert.doesNotMatch(JSON.stringify(m),/AIza|X-Goog-Api-Key/);
});