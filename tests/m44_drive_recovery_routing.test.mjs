import test from 'node:test';
import assert from 'node:assert/strict';
import {generalEncryptedM44DriveRoute,requirePrivateDriveFolder} from '../scripts/ops/m44_drive_recovery_routing.mjs';
const folder={
 id:'synthetic-drive-folder-id',title:'01 - Copia general cifrada IBERFIT',
 mime_type:'application/vnd.google-apps.folder',file_or_folder:'folder',
 shared:false,source_visibility_status:'permission_metadata_available',
 permissions:[{type:'user',role:'owner',emailAddress:'iberfit.cl@gmail.com'}],
};
test('Real M44 encrypted recovery artifacts are ALWAYS global, never filed under a client name',()=>{
 const route=generalEncryptedM44DriveRoute({
   runId:38832323773,sourceSha:'a'.repeat(40),createdAt:'2026-10-15T21:04:06Z',
   artifactName:'iberfit-prod-ciphertext-38832323773',destination:folder,
 });
 assert.equal(route.scope,'ALL_IBERFIT');assert.equal(route.clientId,null);
 assert.equal(route.folderId,folder.id);
 assert.equal(route.filename,'IBERFIT · Recuperación general cifrada · 20261015T210406000Z · aaaaaaaaaaaa.zip');
 assert.equal(route.restorationVerified,false);
 assert.equal(route.uploaded,false);
 assert.equal(route.needsEncryptedContentsVerification,true);
});
test('Drive folder without verified exclusive IBERFIT owner is not a backup destination',()=>{
 for(const unsafe of [
  {...folder,shared:true},
  {...folder,permissions:[...folder.permissions,{type:'anyone',role:'reader'}]},
  {...folder,permissions:[{type:'user',role:'writer',emailAddress:'iberfit.cl@gmail.com'}]},
  {...folder,permissions:null},
  {...folder,source_visibility_status:'access_not_verified'},
  {...folder,mime_type:'text/plain'},
 ]){
  assert.throws(()=>requirePrivateDriveFolder(unsafe,{expectedName:folder.title}),/DESTINATION_(IDENTITY_NOT_VERIFIED|NOT_OWNER_PRIVATE)/u);
 }
});
test('Cannot route non-M44 files or unknown artifacts into global backup folder',()=>{
 for(const artifactName of ['iberfit-prod-ciphertext-1','some-person-private-backup','database-plaintext.sql']){
   assert.throws(()=>generalEncryptedM44DriveRoute({
     runId:38832323773,sourceSha:'a'.repeat(40),createdAt:'2026-10-15T21:04:06Z',
     artifactName,destination:folder,
   }),/ARTIFACT_PROVENANCE_INVALID/u);
 }
});
