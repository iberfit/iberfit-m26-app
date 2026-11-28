import test from 'node:test';import assert from 'node:assert/strict';
import {authorizedArtifactIdentity,verifyFreshArtifactAuthorization,verifyFreshReportPreparation} from '../supabase/functions/iberfit-evolution-report-emission-v1/artifact-authorization.js';
const id='00000000-0000-4000-8000-000000000001',rid='00000000-0000-4000-8000-000000000002',cid='00000000-0000-4000-8000-000000000003';
const row={ok:true,withdrawn:false,issuanceId:id,reportId:rid,version:2,artifactBucket:'iberfit-evolution-issued-reports',artifactPath:'private/report.pdf',artifactSha256:'a'.repeat(64),artifactSizeBytes:1200};
test('M44 second authorization preserves exact private artifact identity',()=>{const a=authorizedArtifactIdentity(row,id);assert.deepEqual(verifyFreshArtifactAuthorization(a,{...row},id),a);assert.ok(Object.isFrozen(a));});
test('M44 second authorization rejects withdrawal, revocation, substitution and changed size',()=>{const a=authorizedArtifactIdentity(row,id);for(const bad of [null,{...row,ok:false},{...row,withdrawn:true},{...row,withdrawn:undefined},{...row,issuanceId:rid},{...row,reportId:cid},{...row,version:3},{...row,artifactBucket:'other'},{...row,artifactPath:'other'},{...row,artifactSha256:'b'.repeat(64)},{...row,artifactSizeBytes:1201}])assert.throws(()=>verifyFreshArtifactAuthorization(a,bad,id),/M44_PDF_/);});
test('M44 report preparation rejects changed scope, source and revision before finalization',()=>{const p={ok:true,reportId:rid,clientId:cid,sourceRevision:2,sourceSha256:'a'.repeat(64),artifactBucket:row.artifactBucket};assert.equal(verifyFreshReportPreparation(p,{...p}),true);for(const x of [null,{...p,ok:false},{...p,clientId:id},{...p,reportId:id},{...p,sourceRevision:3},{...p,sourceSha256:'b'.repeat(64)},{...p,artifactBucket:'other'}])assert.throws(()=>verifyFreshReportPreparation(p,x),/STALE_SOURCE/);});

test('M44 open/latest route reuses strict artifact identity and checks report scope before response',async()=>{
 const {readFileSync}=await import('node:fs');
 const edge=readFileSync(new URL('../supabase/functions/iberfit-evolution-report-emission-v1/index.ts',import.meta.url),'utf8');
 const open=edge.slice(edge.indexOf('async function open('),edge.indexOf('async function latest('));
 const latest=edge.slice(edge.indexOf('async function latest('),edge.indexOf('async function downloadVerified('));
 assert.match(open,/authorizedArtifactIdentity\(row,id\)/u);
 assert.match(latest,/authorizedArtifactIdentity\(row,found\.data\.id\)/u);
 assert.match(latest,/if\(artifact\.reportId!==id\)throw Error\('M44_PDF_AUTHORIZATION_CHANGED'\)/u);
});
