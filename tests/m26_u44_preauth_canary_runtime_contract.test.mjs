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
  for(const url of [loc('','#access_token=synthetic'),loc('?code=synthetic'),loc('?type=recovery'),loc('','', '/m26'),loc('?prelaunch=bad')]){
    assert.equal(full({session:null,locationLike:url}),true);
  }
});
test('U45 campaign landing stays in fast sign-in without loading the entire three-role application',()=>{
  for(const url of [
    loc('?utm_source=instagram'),
    loc('?utm_medium=social&utm_campaign=autumn&utm_content=story'),
    loc('?gclid=synthetic&gbraid=synthetic'),
    loc('?fbclid=synthetic&igshid=synthetic'),
    loc('?prelaunch=1793185216202&utm_source=campaign'),
    loc('?UTM_SOURCE=referral'),
  ])assert.equal(full({session:null,locationLike:url}),false,JSON.stringify(url));
});
test('U45 callback, recovery, deep links and unknown queries retain secure full bootstrap',()=>{
  for(const url of [
    loc('?utm_source=campaign&code=synthetic'),
    loc('?utm_campaign=launch&type=recovery'),
    loc('?utm_campaign=launch&token_hash=synthetic'),
    loc('?utm_source=instagram&state=synthetic'),
    loc('?error=access_denied&utm_medium=social'),
    loc('?redirect_to=%2Fsesion&utm_source=email'),
    loc('?prelaunch=bad&utm_source=campaign'),
    loc('?prelaunch=1&prelaunch=2'),
    loc('?unknown_key=unknown'),
    loc('','#access_token=synthetic'),
    loc('?utm_source=campaign','','/m26'),
  ])assert.equal(full({session:null,locationLike:url}),true,JSON.stringify(url));
});
test('U45 an existing session still hydrates completely even with marketing attribution',()=>{
  assert.equal(full({session:{user:{id:'synthetic'}},locationLike:loc('?utm_source=instagram')}),true);
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
