import test from 'node:test';
import assert from 'node:assert/strict';
import {certifyStorageMetadataParity} from '../scripts/ops/m44_storage_metadata_parity.mjs';
const first={bucket_id:'private-iri',name:'person/image.jpg',
 id:'11111111-1111-4111-8111-111111111111',version:'v01',
 updated_at:'2026-10-16T02:01:02.123456Z',size:'9'};
const second={bucket_id:'private-iri',name:'person/document.pdf',
 id:'22222222-2222-4222-8222-222222222222',version:null,updated_at:null,size:null};
const snapshot=()=>[{...first},{...second}];
const manifest=()=>({schema:'iberfit.storage.backup.v1',project:'pjhmrhejsoofmouedavw',
 objects:[
  {bucket:first.bucket_id,name:first.name,relative:'files/000000.bin',bytes:9,sha256:'a'.repeat(64)},
  {bucket:second.bucket_id,name:second.name,relative:'files/000001.bin',bytes:0,sha256:'b'.repeat(64)}
 ]});
test('reordered live snapshot and isolated restore match exactly',()=>{
 for(const phase of ['source','isolated']){
  const p=certifyStorageMetadataParity({before:snapshot(),after:snapshot().reverse(),manifest:manifest(),phase});
  assert.equal(p.ok,true);assert.equal(p.count,2);
  assert.equal(p.platformRecoveryVerified,false);
 }
});
test('same-name overwrite changes version/id/updated-at/size and fails closed',()=>{
 for(const field of ['id','version','updated_at','size']){
  const other=snapshot();
  other[0][field]=field==='id'?'99999999-9999-4999-8999-999999999999':
   field==='updated_at'?'2026-10-16T02:04:05.222222Z':field==='size'?'10':'v02';
  assert.throws(()=>certifyStorageMetadataParity({before:snapshot(),after:other,manifest:manifest(),phase:'source'}),/SOURCE_MUTATED_DURING_EXPORT/);
  assert.throws(()=>certifyStorageMetadataParity({before:snapshot(),after:other,manifest:manifest(),phase:'isolated'}),/ISOLATED_DATABASE_DIVERGENCE/);
 }
});
test('deleted, added and duplicate objects are always rejected',()=>{
 assert.throws(()=>certifyStorageMetadataParity({before:snapshot(),after:snapshot().slice(0,1),manifest:manifest(),phase:'source'}),/COUNT_DRIFT/);
 assert.throws(()=>certifyStorageMetadataParity({before:[first,first],after:snapshot(),manifest:manifest(),phase:'source'}),/INVENTORY_DUPLICATE/);
 const more=snapshot();more.push({...first,name:'extra',id:'33333333-3333-4333-8333-333333333333'});
 assert.throws(()=>certifyStorageMetadataParity({before:snapshot(),after:more,manifest:manifest(),phase:'source'}),/COUNT_DRIFT/);
});
test('manifest wrong source, path, and object mismatch fail closed',()=>{
 const wrong=manifest();wrong.project='QA';
 assert.throws(()=>certifyStorageMetadataParity({before:snapshot(),after:snapshot(),manifest:wrong,phase:'source'}),/MANIFEST_INVALID/);
 const wrongPath=manifest();wrongPath.objects[0].relative='../unsafe';
 assert.throws(()=>certifyStorageMetadataParity({before:snapshot(),after:snapshot(),manifest:wrongPath,phase:'source'}),/MANIFEST_ENTRY_INVALID/);
 const wrongName=manifest();wrongName.objects[0].name='another-client-private-name';
 assert.throws(()=>certifyStorageMetadataParity({before:snapshot(),after:snapshot(),manifest:wrongName,phase:'source'}),/MANIFEST_OBJECT_MISMATCH/);
});
test('never reveal private names or object IDs in thrown errors',()=>{
 try{certifyStorageMetadataParity({before:snapshot(),after:[],manifest:manifest(),phase:'source'});assert.fail('should reject')}
 catch(e){assert.equal(e.message,'IBERFIT_M44_STORAGE_PARITY_INVENTORY_COUNT_DRIFT');
  assert.doesNotMatch(e.message,/private-iri|person|image|11111111/);}
});
