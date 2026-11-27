import test from 'node:test';
import assert from 'node:assert/strict';
import {gx350SourceScope,verifyGx350Catalog,verifyGx350Edges,GX350_CANDIDATE,GX350_PREVIOUS_LIVE} from '../scripts/release/verify_gx350_preactivated.mjs';
const paths=["supabase/functions/iberfit-admin-client-invite-v1/index.ts","supabase/functions/iberfit-evolution-report-emission-v1/artifact-authorization.js","supabase/functions/iberfit-evolution-report-emission-v1/index.ts","supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js","supabase/functions/iberfit-evolution-report-emission-v1/report-trend-contract.js","supabase/functions/iberfit-iri-report-emission-v1/index.ts","supabase/functions/iberfit-iri-report-emission-v1/vendor/workflows/iri-photogrammetry-v2.js","supabase/functions/iberfit-iri-report-emission-v1/vendor/workflows/iri-protocol-catalog.js","supabase/functions/iberfit-iri-report-emission-v1/vendor/workflows/iri-report-measurements.js","supabase/release-procedures/gx_admin_create_replay_v1.rollback.sql","supabase/release-procedures/gx_admin_create_replay_v1.sql","supabase/release-procedures/gx_admin_deferred_iri_identity_v1.sql","supabase/release-procedures/gx_backend_release_v1.json","supabase/release-procedures/gx_followup_detail_v1.rollback.sql","supabase/release-procedures/gx_followup_detail_v1.sql","supabase/release-procedures/gx_followup_recent_v1.rollback.sql","supabase/release-procedures/gx_followup_recent_v1.sql","supabase/release-procedures/gx_followup_v1.rollback.sql","supabase/release-procedures/gx_followup_v1.sql","supabase/release-procedures/gx_goal_measurement_v1.rollback.sql","supabase/release-procedures/gx_goal_measurement_v1.sql","supabase/release-procedures/gx_onboarding_scoped_readback_v1.sql","supabase/release-procedures/gx_publication_v1.rollback.sql","supabase/release-procedures/gx_publication_v1.sql","supabase/release-procedures/gx_report_evidence_v1.rollback.sql","supabase/release-procedures/gx_report_evidence_v1.sql","supabase/release-procedures/gx_report_guards_v1.rollback.sql","supabase/release-procedures/gx_report_guards_v1.sql","supabase/release-procedures/gx_report_proof_v1.rollback.sql","supabase/release-procedures/gx_report_proof_v1.sql"];
const rows=[{"category":"functions","total":49,"digest":"485a332c10d7a5362b6b604170ae0cb481f993f5e2d77f375e51383d6197cd60"},{"category":"indexes","total":5,"digest":"76e2415cefbaee66fefc40d2d7f5a867a3022af80675708e97a3f905b8c44673"},{"category":"policies","total":4,"digest":"71d9584e10e0931fcadba59eb8bb59136acb64371b07a24dd04c4c20e55798f7"},{"category":"table","total":1,"digest":"85299e1e08e47c16a854b4c1048eafa1230b2e02f20cbfaee280c7025ee4fbf3"},{"category":"triggers","total":8,"digest":"c3b69c9f7f428d1fbdf6bc90bf6e25880d51203ff8c74a5db00b5441e446852c"}];
const edge=[{"slug":"iberfit-admin-client-invite-v1","verify_jwt":false,"ezbr_sha256":"9a5507bea364778cbd18a63963e4c44decfa4ee370b42c5088d4098cbc88efda","version":1,"status":"ACTIVE"},{"slug":"iberfit-evolution-report-emission-v1","verify_jwt":true,"ezbr_sha256":"5a3b2bbe5ce5203b4e6654526badd6cd17ea6a0b837e42373be1891a55ac7ae5","version":1,"status":"ACTIVE"},{"slug":"iberfit-iri-report-emission-v1","verify_jwt":false,"ezbr_sha256":"bb639dad35e37120704f3529a2a5ac0722818c62ee124e995e310af29ef18df1","version":1,"status":"ACTIVE"}];
const rls=[{rls_tables:4,valid_indexes:5}];
function read(delta=[],changed=paths,drift=false){return args=>{
 if(args[0]==='merge-base')return '';
 if(args[0]==='diff')return (args[2]===GX350_CANDIDATE?delta:changed).join('\n');
 if(args[0]==='rev-parse')return drift&&!args[1].startsWith(GX350_CANDIDATE)?'b'.repeat(40):'a'.repeat(40);
 throw Error('unknown');
};}
const scope={sourceSha:'f'.repeat(40),expectedPreviousLiveSha:GX350_PREVIOUS_LIVE};
test('GX350 source scope accepts only immutable approved backend and operational paths',()=>{
 assert.equal(gx350SourceScope({...scope,gitRun:read(['scripts/release/verify_frontend_only_promotion.mjs'])}).paths.length,30);
 assert.throws(()=>gx350SourceScope({...scope,gitRun:read(['src/m26/unknown.js'])}),/FUNCTIONAL_SOURCE_DRIFT/);
 assert.throws(()=>gx350SourceScope({...scope,gitRun:read([],paths.slice(1))}),/BACKEND_PATH_DRIFT/);
 assert.throws(()=>gx350SourceScope({...scope,gitRun:read([],paths,true)}),/BACKEND_BLOB_DRIFT/);
 assert.equal(gx350SourceScope({...scope,expectedPreviousLiveSha:'a'.repeat(40),gitRun:read()}),null);
});
test('GX350 catalog rejects absent or drifted objects, duplicate categories, disabled RLS and invalid indexes',()=>{
 assert.equal(verifyGx350Catalog(rows,rls).functions,49);
 assert.throws(()=>verifyGx350Catalog(rows.slice(1),rls),/CATALOG_SHAPE/);
 assert.throws(()=>verifyGx350Catalog([rows[0],...rows.slice(0,4)],rls),/CATALOG_SHAPE/);
 for(let i=0;i<rows.length;i++){
  const corrupt=structuredClone(rows);corrupt[i].digest='0'.repeat(64);
  assert.throws(()=>verifyGx350Catalog(corrupt,rls),/CATALOG_DRIFT/);
 }
 assert.throws(()=>verifyGx350Catalog(rows,[{rls_tables:3,valid_indexes:5}]),/RLS_OR_INDEX_DRIFT/);
 assert.throws(()=>verifyGx350Catalog(rows,[{rls_tables:4,valid_indexes:4}]),/RLS_OR_INDEX_DRIFT/);
});
test('GX350 Edge rejects previous or unknown bundles, JWT drift, duplicate and inactive functions',()=>{
 assert.equal(verifyGx350Edges(edge).functions,3);
 for(let i=0;i<edge.length;i++){
  const corrupt=structuredClone(edge);corrupt[i].ezbr_sha256='0'.repeat(64);
  assert.throws(()=>verifyGx350Edges(corrupt),/EDGE_DRIFT/);
  corrupt[i]=structuredClone(edge[i]);corrupt[i].verify_jwt=!corrupt[i].verify_jwt;
  assert.throws(()=>verifyGx350Edges(corrupt),/EDGE_DRIFT/);
 }
 assert.throws(()=>verifyGx350Edges([...edge,edge[0]]),/EDGE_DRIFT/);
 assert.throws(()=>verifyGx350Edges(edge.slice(1)),/EDGE_DRIFT/);
});
