import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldLoadFullApplicationImmediately as full} from '../src/m26/app/preauth-start-policy.js';
const loc=(search='',hash='',pathname='/')=>({search,hash,pathname});

test('U44 logged-out home is interactive immediately without eager privileged modules',()=>{
  assert.equal(full({session:null,locationLike:loc()}),false);
  assert.equal(full({locationLike:loc('?prelaunch=1793185216202')}),false);
  assert.equal(full({session:null,locationLike:loc('', '', '/index.html')}),false);
});
test('U44 persisted sessions and refresh still enter full authorized hydration',()=>{
  for(const session of [{token:'synthetic',user:{id:'test'}},{expiresAt:1},{}]){
    assert.equal(full({session,locationLike:loc()}),true);
  }
});
test('U44 recovery, callbacks and deep links never get trapped in lightweight sign-in',()=>{
  for(const url of [loc('','#access_token=synthetic'),loc('?code=synthetic'),loc('?type=recovery'),loc('?utm_source=campaign'),loc('','', '/m26'),loc('?prelaunch=bad')]){
    assert.equal(full({session:null,locationLike:url}),true);
  }
});
test('U44 bootstrap retains secure first-factor, session vault, retry and full mount',()=>{
  const app=readFileSync('public/m26/app.js','utf8');
  assert.match(app,/import\('\/src\/m26\/app\/preauth-start-policy\.js'\)/u);
  assert.match(app,/createSessionVault\(\)\.load\(\)/u);
  assert.match(app,/shouldLoadFullApplicationImmediately\(/u);
  assert.match(app,/enableMinimalAuthShell\(\{reveal:true\}\)/u);
  assert.match(app,/createSessionVault\(\)\.save\(session\)/u);
  assert.match(app,/const loadedApp=await loadFullApplication\(\)/u);
  assert.match(app,/bootstrapDeadline\(\s*app\.mount\(\)/u);
  assert.match(app,/M26_BOOTSTRAP_MODULE_TIMEOUT/u);
  assert.doesNotMatch(app,/localStorage\.clear\(|indexedDB\.deleteDatabase\(/u);
});
