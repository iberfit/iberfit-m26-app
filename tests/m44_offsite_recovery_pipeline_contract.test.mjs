import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const w=fs.readFileSync(new URL('../.github/workflows/m44-encrypted-disaster-recovery.yml',import.meta.url),'utf8');
const db=fs.readFileSync(new URL('../scripts/ops/m44_encrypted_backup_archive.mjs',import.meta.url),'utf8');
const storage=fs.readFileSync(new URL('../scripts/ops/m44_storage_backup_bytes.mjs',import.meta.url),'utf8');
test('offsite production archive cannot run for pull requests and requires protected secrets',()=>{
 assert.match(w,/if: github.event_name != 'pull_request'/);
 for(const name of ['IBERFIT_PROD_DATABASE_URL','IBERFIT_PROD_STORAGE_SERVICE_KEY','IBERFIT_BACKUP_PASSPHRASE'])
  assert.match(w,new RegExp('secrets\\.'+name));
 assert.match(w,/sslmode/);
 assert.match(w,/pjhmrhejsoofmouedavw/);
 assert.match(w,/IBERFIT_BACKUP_DATABASE_URL_NOT_CONFIGURED/);
 assert.match(w,/IBERFIT_BACKUP_STORAGE_KEY_NOT_CONFIGURED/);
 assert.match(w,/IBERFIT_BACKUP_PASSPHRASE_NOT_CONFIGURED/);
});
test('cipher archive alone goes to artifacts, restores cannot reach production',()=>{
 const upload=w.split('      - name: Publish encrypted archive only')[1]?.split('      - name: Remove all temporary plaintext')[0];
 assert.ok(upload);
 assert.match(upload,/\/cipher\/\*\.ibf/);
 assert.doesNotMatch(upload,/pgcustom|storage-inventory|plain\.tar|\/isolated/);
 assert.match(w,/ibf-gcm-v1|IBERFIT_CIPHERTEXT_ONLY_READY/);
 assert.match(w,/pg_restore --exit-on-error/);
 assert.match(w,/iberfit_recovery_test/);
 assert.doesNotMatch(w,/pg_restore[^\n]*IBERFIT_PROD_DATABASE_URL/);
 assert.match(w,/rm -rf "\$RUNNER_TEMP\/iberfit-recovery"/);
});
test('database and Storage both included and authenticated before sign-off',()=>{
 const production=w.split('  production-backup:')[1]||'';
 const indexes=['pg_dump -Fc','FROM storage.objects','m44_storage_backup_bytes.mjs export',
 'm44_encrypted_backup_archive.mjs encrypt','m44_encrypted_backup_archive.mjs decrypt',
 'm44_storage_backup_bytes.mjs verify','pg_restore --exit-on-error'];
 for(let i=1;i<indexes.length;i++)
  assert.ok(production.indexOf(indexes[i])>production.indexOf(indexes[i-1]),'Order mismatch: '+indexes[i]);
 assert.match(w,/IBERFIT_PROD_LOCAL_DB_AND_STORAGE_RESTORE_SUCCESS/);
 assert.match(storage,/sha256/);
 assert.match(db,/aes-256-gcm/);
 assert.match(db,/scryptSync/);
 assert.match(storage,/DOWNLOAD_DENIED_OR_MISSING/);
});
