import test from 'node:test';
import assert from 'node:assert/strict';
import {planPrivateStorageBackup} from '../scripts/ops/free_storage_recovery_plan.mjs';
const A='bf179943-b7d5-4e9d-8598-4a2a33449a7e';
const B='f5237199-b7d5-4e9d-8598-4a2a33449a7e';
const clients=[{id:A,name:'María Muñoz'},{id:B,name:'María Muñoz'}];
const objects=[
 {bucketId:'iberfit-exercise-media',objectName:'media/synthetic-example.mp4',sizeBytes:100},
 {bucketId:'iberfit-iri-photogrammetry',objectName:'iri/a.png',sizeBytes:200},
 {bucketId:'iberfit-iri-external-reports',objectName:'unmapped/synthetic.pdf',sizeBytes:300},
];
test('Archive all storage items; only verified client links use personal Drive folder names',()=>{
 const result=planPrivateStorageBackup({
   clients,objects,expectedCount:3,expectedBytes:600,
   verifiedClientLinks:[{...objects[1],clientId:A,verification:'DATABASE_FOREIGN_KEY_VERIFIED'}],
 });
 assert.equal(result.totalCount,3);assert.equal(result.totalBytes,600);
 assert.equal(result.shared,1);assert.equal(result.unattributed,1);assert.equal(result.personal,1);
 assert.equal(result.objects[0].scope,'GENERAL_SHARED');
 assert.equal(result.objects[1].folderName,'María Muñoz · '+A);
 assert.equal(result.objects[2].scope,'GENERAL_UNATTRIBUTED');
 assert.equal(result.downloadedAndEncrypted,false);
 assert.equal(result.storageRestoreVerified,false);
});
test('Reject guessed client links, conflicts, and assigning exercise media to any person',()=>{
 const item=objects[1];
 assert.throws(()=>planPrivateStorageBackup({clients,objects,verifiedClientLinks:[{...item,clientId:A,verification:'UUID_IN_FILENAME'}]}),/CLIENT_RELATION_UNVERIFIED/u);
 assert.throws(()=>planPrivateStorageBackup({clients,objects,verifiedClientLinks:[{...item,clientId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',verification:'DATABASE_FOREIGN_KEY_VERIFIED'}]}),/CLIENT_NOT_IN_CANONICAL_REGISTER/u);
 assert.throws(()=>planPrivateStorageBackup({clients,objects,verifiedClientLinks:[{...item,clientId:A,verification:'DATABASE_FOREIGN_KEY_VERIFIED'},{...item,clientId:B,verification:'DATABASE_FOREIGN_KEY_VERIFIED'}]}),/AMBIGUOUS_CLIENT_LINK/u);
 assert.throws(()=>planPrivateStorageBackup({clients,objects,verifiedClientLinks:[{...objects[0],clientId:A,verification:'DATABASE_FOREIGN_KEY_VERIFIED'}]}),/SHARED_MEDIA_CANNOT_BE_PERSONAL/u);
});
test('Never silently omit, truncate or path-traverse Storage objects',()=>{
 assert.throws(()=>planPrivateStorageBackup({clients,objects,expectedCount:2}),/INVENTORY_COUNT_MISMATCH/u);
 assert.throws(()=>planPrivateStorageBackup({clients,objects,expectedBytes:599}),/INVENTORY_BYTES_MISMATCH/u);
 assert.throws(()=>planPrivateStorageBackup({clients,objects:[objects[0],objects[0]]}),/DUPLICATE_OBJECT/u);
 assert.throws(()=>planPrivateStorageBackup({clients,objects:[{bucketId:'safe-bucket',objectName:'../secret',sizeBytes:1}]}),/OBJECT_PATH_INVALID/u);
 assert.throws(()=>planPrivateStorageBackup({clients,objects:[{bucketId:'safe-bucket',objectName:'safe',sizeBytes:0.5}]}),/OBJECT_SIZE_INVALID/u);
});
