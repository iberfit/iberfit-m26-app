import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
 extractReferencedNames, validateInventory, runInventoryCheck
} from '../scripts/ops/m44_edge_runtime_recovery_contract.mjs';
import {loadInventory} from '../scripts/ops/m44_edge_source_recovery_contract.mjs';

const inventoryPath=path.resolve('scripts/ops/m44_edge_runtime_config_inventory.json');
const fixture=()=>JSON.parse(fs.readFileSync(inventoryPath,'utf8'));

test('M44: every PROD Edge function source has versioned runtime variable NAMES only',()=>{
 const actual=runInventoryCheck();
 assert.equal(actual.functionsAudited,15);
 assert.equal(actual.referencedNamesCatalogued,13);
 assert.equal(actual.runtimeSecretsAvailable,false);
 assert.equal(actual.hostedAuthRecoveryVerified,false);
 assert.equal(actual.hostedVaultRecoveryVerified,false);
 assert.equal(actual.platformRecoveryVerified,false);
 const inv=fixture();
 const historical=inv.functions.find(x=>x.slug==='iberfit-client-onboarding-v1');
 assert.equal(historical.deployment_policy,'historical_source_not_to_deploy');
 const active=inv.functions.find(x=>x.slug==='iberfit-ai');
 assert.ok(active.referenced_names.includes('GEMINI_API_KEY'));
 assert.ok(active.referenced_names.includes('GOOGLE_API_KEY'));
 const webpush=inv.functions.find(x=>x.slug==='iberfit-web-push-sender-v1');
 assert.ok(webpush.referenced_names.includes('IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY'));
});

test('M44: scanner covers modern JSON keys, fallback secrets, dynamic helpers and explicit Deno env',()=>{
 const src=[
   'const a=Deno.env.get("SUPABASE_URL");',
   "jsonKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');",
   "function jsonKey(envName,legacyName){const a=Deno.env.get(envName);return Deno.env.get(legacyName)}",
   'env("IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY");'
 ].join('\n');
 assert.deepEqual(extractReferencedNames(src),[
  'IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY','SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_URL'
 ]);
 assert.throws(()=>extractReferencedNames('Deno.env.get(getSecretName())'),/DYNAMIC_ENV_UNREVIEWED/);
 assert.throws(()=>extractReferencedNames('Deno.env.get(name)'),/INDIRECT_ENV_UNRESOLVED/);
});

test('M44: renamed or undocumented environment keys fail closed',()=>{
 const first=fixture();
 first.functions.find(x=>x.slug==='iberfit-ai').referenced_names.push('NONEXISTENT_API_SECRET');
 first.functions.find(x=>x.slug==='iberfit-ai').referenced_names.sort();
 assert.throws(()=>validateInventory(first),/UNREGISTERED_ENV_REFERENCE/);
 const second=fixture();
 second.classes.external_or_operator_provided.push('UNAUTHORIZED_SECRET_NAME');
 second.classes.external_or_operator_provided.sort();
 // An extra class is permitted only when named and reviewed; no values allowed.
 assert.equal(validateInventory(second).functionsAudited,15);
 const third=fixture();
 third.classes.external_or_operator_provided.push('GEMINI_API_KEY');
 assert.throws(()=>validateInventory(third),/NAMES_INVALID|CLASS_DUPLICATE/);
});

test('M44: refuse values, altered references, source drift or historical reactivation in inventory',()=>{
 const m=fixture();
 m.functions[0].plaintext_secret='should-never-be-added';
 assert.throws(()=>validateInventory(m),/FUNCTION_SHAPE/);
 const bad=fixture();
 bad.project_ref='gjztkdwfmunnzhtvxrsu';
 assert.throws(()=>validateInventory(bad),/MANIFEST_IDENTITY_INVALID/);
 const alt=fixture();
 alt.functions.find(x=>x.slug==='iberfit-client-onboarding-v1').deployment_policy='canonical';
 assert.throws(()=>validateInventory(alt),/FUNCTION_IDENTITY_INVALID/);
 const extra=fixture();
 extra.classes.extra_group=[];
 assert.throws(()=>validateInventory(extra),/CLASSES_INVALID/);
 const orig=loadInventory();
 assert.equal(orig.sources.length,15);
});
