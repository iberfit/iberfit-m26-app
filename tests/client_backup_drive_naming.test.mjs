import test from 'node:test';
import assert from 'node:assert/strict';
import {clientBackupFolderName,clientBackupFileName,assertIndividualBackup} from '../scripts/ops/client_backup_drive_naming.mjs';
const one='bf179943-b7d5-4e9d-8598-4a2a33449a7e';
const two='f5237199-b7d5-4e9d-8598-4a2a33449a7e';
test('Drive filenames use full personal names but never confuse two identical names',()=>{
 const a=clientBackupFolderName({clientId:one,fullName:'  María   José Muñoz-López '});
 const b=clientBackupFolderName({clientId:two,fullName:'María José Muñoz-López'});
 assert.equal(a,'María José Muñoz-López · '+one);
 assert.notEqual(a,b);
 assert.equal(clientBackupFileName({clientId:one,fullName:'María José Muñoz-López'},'2026-10-15T12:00:00Z'),'María José Muñoz-López · 20261015T120000000Z · copia-cifrada.enc');
});
test('Never rename a database-wide IBERFIT archive as an individual client backup',()=>{
 assert.equal(assertIndividualBackup({clientId:one,archiveClientId:one,scope:'ONE_CLIENT'}),true);
 assert.throws(()=>assertIndividualBackup({clientId:one,archiveClientId:two,scope:'ONE_CLIENT'}),/BACKUP_CLIENT_SCOPE_INVALID/);
 assert.throws(()=>assertIndividualBackup({clientId:one,archiveClientId:one,scope:'WHOLE_DATABASE'}),/BACKUP_CLIENT_SCOPE_INVALID/);
});
test('Reject unsafe names, fake client IDs and invalid dates',()=>{
 for(const name of ['../Otro','Nombre/Apellido','<script>','.', '   ', 'Nombre\\Apellido']){
   assert.throws(()=>clientBackupFolderName({clientId:one,fullName:name}),/BACKUP_CLIENT_NAME_INVALID/);
 }
 assert.throws(()=>clientBackupFolderName({clientId:'not-uuid',fullName:'Una Persona'}),/BACKUP_CLIENT_ID_INVALID/);
 assert.throws(()=>clientBackupFileName({clientId:one,fullName:'Una Persona'},'bad'),/BACKUP_CLIENT_DATE_INVALID/);
});
