import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_CANARY_EDGE_ATTEMPTS,isRetryableCanaryStaticFailure} from '../scripts/prelaunch/m43-canary-edge-policy.mjs';
const correct={status:520,origin:'https://m26-canary.iberfit.cl',path:'/src/m26/wearables/contracts.js'};
test('Canary transient 520 on a static JS module permits bounded fresh-context retry',()=>{
  assert.equal(MAX_CANARY_EDGE_ATTEMPTS,3);
  for(const status of [502,503,504,520,522,524]){
    assert.equal(isRetryableCanaryStaticFailure({badResponses:[{...correct,status}]}),true);
  }
});
test('Canary retry is never allowed for wrong environment, auth, mutation, external origin or application exceptions',()=>{
  for(const status of [200,401,403,404,429,500,530])
    assert.equal(isRetryableCanaryStaticFailure({badResponses:[{...correct,status}]}),false);
  for(const path of ['/functions/v1/action','/rest/v1/anything','/m26/index.html','/api/secrets'])
    assert.equal(isRetryableCanaryStaticFailure({badResponses:[{...correct,path}]}),false);
  assert.equal(isRetryableCanaryStaticFailure({badResponses:[{...correct,origin:'https://app.iberfit.cl'}]}),false);
  assert.equal(isRetryableCanaryStaticFailure({badResponses:[correct],pageErrors:[{message:'crash'}]}),false);
  assert.equal(isRetryableCanaryStaticFailure({badResponses:[correct],forbiddenOrigins:['https://unknown.example']}),false);
  assert.equal(isRetryableCanaryStaticFailure({badResponses:[correct],blockedMutations:[{method:'POST'}]}),false);
  assert.equal(isRetryableCanaryStaticFailure({badResponses:[]}),false);
  assert.equal(isRetryableCanaryStaticFailure({badResponses:[correct,{...correct,status:403}]}),false);
});
