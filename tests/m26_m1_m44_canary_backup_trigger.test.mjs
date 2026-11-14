import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('M1 U72 protected Canary integration renews real M44 recovery with no PR production backup',()=>{
 const workflow=read('.github/workflows/m44-encrypted-disaster-recovery.yml');
 const on=workflow.match(/\non:\n([\s\S]*?)\npermissions:/u)?.[1]||'';
 assert.match(on,/  push:\n    branches: \['canary\/rc74-4'\]\n    paths:/u);
 const push=on.match(/  push:\n([\s\S]*?)(?:\n  workflow_dispatch:|$)/u)?.[1]||'';
 assert.match(push,/scripts\/release\/materialize_u72_prod_sql\.mjs/u);
 assert.match(push,/\.github\/workflows\/m44-encrypted-disaster-recovery\.yml/u);
 assert.doesNotMatch(push,/branches: \['main'\]|branches: \['master'\]|'feature\//u);
 assert.match(workflow,/name: m44-prod-db-storage-encrypted-backup-and-restore/u);
 assert.match(workflow,/if: github\.event_name != 'pull_request' && \(github\.event_name != 'workflow_dispatch'/u);
 assert.match(workflow,/needs: \[crypto-contract, synthetic-restore\]/u);
 assert.match(workflow,/Encrypt authenticated recovery archive before any upload/u);
 assert.match(workflow,/Reopen ciphertext and verify restored Storage bytes in isolated workspace/u);
 assert.match(workflow,/Publish verified encrypted archive for immediate private-drive transfer/u);
 assert.match(workflow,/retention-days: 1/u);
});
test('M1 U72 SQL source remains fail-closed and does not contain a PROD grant',()=>{
 const s=read('scripts/release/materialize_u72_prod_sql.mjs');
 assert.match(s,/M1_U72_PROD_SQL_OUTPUT_DRIFT/u);
 assert.match(s,/U72_OUTPUT_SHA/u);
 assert.doesNotMatch(s,/supabase\.co\/rest|postgresql:\/\//u);
});
