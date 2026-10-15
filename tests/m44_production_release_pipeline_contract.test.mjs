import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/production-promote.yml',import.meta.url),'utf8');
const config=readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8');
const source=readFileSync(new URL('../supabase/functions/iberfit-evolution-report-emission-v1/index.ts',import.meta.url),'utf8');
test('M44 production release orders database gate before protected PDF deploy and frontend',()=>{
 const gate=workflow.indexOf('run: node scripts/ops/verify_m44_prod_schema.mjs');
 const broker=workflow.indexOf('functions deploy iberfit-evolution-report-emission-v1');
 const frontend=workflow.indexOf('Deploy exact certified surface to production with Wrangler');
 assert.ok(gate>0&&broker>gate&&frontend>broker,'schema -> Edge -> frontend must be ordered');
 assert.equal((workflow.match(/verify_m44_prod_schema\.mjs/g)||[]).length,1);
 assert.equal((workflow.match(/functions deploy iberfit-evolution-report-emission-v1/g)||[]).length,1);
});
test('M44 production broker retains gateway JWT and its own authorization checks',()=>{
 assert.match(config,/\[functions\.iberfit-evolution-report-emission-v1\]\s*\nverify_jwt = true/);
 const part=workflow.split('      - name: Deploy and verify protected M44 evolution PDF broker to production')[1]?.split('      - name: Deploy and verify guarded exercise media broker')[0];
 assert.ok(part,'protected Edge release segment exists');
 assert.doesNotMatch(part,/^[^\n]*\b--no-verify-jwt\b[^\n]*$/m);
 assert.match(part,/M44_PROD_NO_JWT_DENIAL_HTTP/);
 assert.match(part,/test "\$code" = '401'/);
 assert.match(source,/M44_PDF_AUTH_REQUIRED/);
 assert.match(source,/M44_PDF_ORIGIN_FORBIDDEN/);
 assert.match(source,/\.auth\.getUser\(/);
});
