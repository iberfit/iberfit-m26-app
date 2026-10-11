import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Connected360 Android QA builds an exact merged Canary APK after sync and native transport changes',()=>{
  const yaml=readFileSync(new URL('../.github/workflows/connected360-android-native-qa.yml',import.meta.url),'utf8');
  const prStart=yaml.indexOf('  pull_request:');
  const pushStart=yaml.indexOf('  push:');
  const dispatchStart=yaml.indexOf('  workflow_dispatch:');
  assert.ok(prStart>=0 && pushStart>prStart && dispatchStart>pushStart);
  const pr=yaml.slice(prStart,pushStart);
  const push=yaml.slice(pushStart,dispatchStart);
  const sensitivePaths=[
    'src/m26/wearables/controller.js',
    'src/m26/wearables/foreground-sync.js',
    'src/m26/wearables/remote-sync.js',
    'src/m26/wearables/bridge-service.js',
    'src/m26/wearables/free-policy.js',
    'src/m26/wearables/native-transport.js',
    'src/m26/wearables/contracts.js',
    'src/m26/wearables/historical-acquisition.js',
    'tests/m26_connected360_foreground_autosync.test.mjs',
  ];
  for(const path of sensitivePaths){
    const line='- "'+path+'"';
    assert.ok(pr.includes(line),'PR Android QA missing '+path);
    assert.ok(push.includes(line),'Canary SHA APK rebuild missing '+path);
  }
  assert.match(push,/branches:\\s*\\["canary\\/rc74-4"\\]/u);
  assert.match(yaml,/applicationId|cl\\.iberfit\\.m26\\.qa/u);
  assert.match(yaml,/remoteHealthSync|releaseCandidate/u);
});
