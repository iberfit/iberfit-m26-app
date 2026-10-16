import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const w=fs.readFileSync('.github/workflows/m44-encrypted-disaster-recovery.yml','utf8');
const synthetic=fs.readFileSync('scripts/ops/m44_synthetic_acl_restore_drill.sh','utf8');
const prod=w.split('  production-backup:')[1]||'';
test('protected encrypted PG17 custom dump retains owners and GRANT/REVOKE contents',()=>{
 const exportLine=prod.split('\n').find(x=>x.includes("'pg_dump -Fc "));
 assert.ok(exportLine,'production dump command is present');
 assert.match(exportLine,/pg_dump -Fc --dbname=/);
 assert.doesNotMatch(exportLine,/--no-acl|--no-privileges/);
 // Owner metadata is retained by the custom format; omit -O to remove any doubt.
 assert.doesNotMatch(exportLine,/--no-owner/);
 assert.match(prod,/m44_encrypted_backup_archive\.mjs encrypt/);
 assert.match(prod,/database\.pgcustom global-roles\.sql storage/);
});
test('TOC ACL and DEFAULT ACL proof happens after decryption and before restore success',()=>{
 const decrypt=prod.indexOf('m44_encrypted_backup_archive.mjs decrypt');
 const toc=prod.indexOf('pg_restore --list /work/database.pgcustom');
 const acl=prod.indexOf('m44_acl_toc_selector.mjs');
 const valid=prod.indexOf('IBERFIT_PGCUSTOM_ACL_DEFAULTS_ARCHIVED_ENCRYPTED_ONLY');
 const restore=prod.indexOf('pg_restore --exit-on-error');
 const done=prod.indexOf('IBERFIT_PROD_LOCAL_DB_AND_STORAGE_RESTORE_SUCCESS');
 assert.ok(decrypt>0&&decrypt<toc&&toc<acl&&acl<valid&&valid<restore&&restore<done);
 assert.match(prod,/rm -f "\$WORK\/isolated\/acl-toc-private\.list"/);
 const upload=prod.split('      - name: Publish verified encrypted archive')[1]?.split('      - name: Remove all temporary plaintext')[0]||'';
 assert.doesNotMatch(upload,/acl-toc-private|pgcustom|global-roles\.sql/);
});
test('first-stage isolated restore remains intentionally read-only/privilege-stripped',()=>{
 const pgrestore=prod.split('\n').find(x=>x.includes('pg_restore --exit-on-error'));
 assert.match(pgrestore||'',/pg_restore --exit-on-error/);
 assert.match(prod,/--no-owner --no-acl.*-h 127\.0\.0\.1/);
 assert.match(prod,/IBERFIT_GLOBAL_ROLES_ARCHIVED_BUT_NOT_APPLIED/);
 assert.match(prod,/IBERFIT_SOURCE_CATALOG_ENCRYPTED_PLATFORM_RECOVERY_NOT_YET_VERIFIED/);
});
test('real synthetic PG17 owner grant default and RLS role query is checked against custom TOC',()=>{
 assert.match(synthetic,/pg_dump -Fc --dbname="\$src"/);
 assert.match(synthetic,/pg_restore --list "\$work\/synthetic\.acl\.pgcustom"/);
 assert.match(synthetic,/IBERFIT_M44_SYNTHETIC_PGCUSTOM_ACL_DEFAULTS_RETAINED/);
 assert.match(synthetic,/IBERFIT_M44_SYNTHETIC_ACL_ARCHIVE_INCOMPLETE/);
 assert.match(synthetic,/ALTER DEFAULT PRIVILEGES FOR ROLE/);
 assert.match(synthetic,/SET ROLE iberfit_m44_fixture_reader/);
 assert.match(synthetic,/IBERFIT_M44_PLATFORM_RECOVERY_NOT_CERTIFIED/);
});
