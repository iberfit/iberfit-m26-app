import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {checkIsolatedReauthSignatureBoundary} from '../scripts/ops/m44_disaster_jwt_reissue_drill.mjs';
test('synthetic ES256 disaster key reissue rejects old tokens without touching production keys',()=>{
 const x=checkIsolatedReauthSignatureBoundary();
 assert.deepEqual(x,{
  syntheticSignatureBoundaryVerified:true,
  previousTokenDeniedByReplacementKey:true,
  recoveredTokenAcceptedByReplacementKey:true,
  refreshSessionsInvalidated:false,
  hostedAuthRestoreVerified:false,edgeRuntimeVerified:false,
  productionKeysRotated:false,platformRecoveryVerified:false
 });
 assert.equal(Object.isFrozen(x),true);
});
test('CLI prints no keys, tokens or false platform certification',()=>{
 const x=spawnSync('node',['scripts/ops/m44_disaster_jwt_reissue_drill.mjs'],{
  encoding:'utf8',timeout:5000
 });
 assert.equal(x.status,0,x.stderr);
 assert.match(x.stdout,/M44_ISOLATED_SYNTHETIC_ES256_REISSUE_BOUNDARY_VERIFIED_ONLY/u);
 assert.match(x.stdout,/M44_HOSTED_AUTH_JWT_KEY_RESTORATION_NOT_CERTIFIED/u);
 assert.doesNotMatch(x.stdout,/eyJ|PRIVATE KEY|platformRecoveryVerified=true/u);
});
