import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {spawnSync} from 'node:child_process';

const workflow=readFileSync(new URL('../.github/workflows/connected360-android-native-qa.yml',import.meta.url),'utf8');
const hostManifest=readFileSync(new URL('../native/android-host/phone-app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
const view=readFileSync(new URL('../native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/Connected360SecureWebViewActivity.kt',import.meta.url),'utf8');

test('Android QA builds are triggered by matching merged Canary source, not only PRs',()=>{
  assert.match(workflow,/on:\s*\n\s*pull_request:/u);
  assert.match(workflow,/push:\s*\n\s*branches: \["canary\/rc74-4"\]/u);
  const push=workflow.slice(workflow.indexOf('\n  push:\n'),workflow.indexOf('\n  workflow_dispatch:',workflow.indexOf('\n  push:\n')));
  assert.match(push,/native\/android-health-connect\/\*\*/u);
  assert.match(push,/native\/android-host\/phone-app\/\*\*/u);
  assert.match(push,/connected360-android-native-qa\.yml/u);
  assert.doesNotMatch(push,/release\/|app\.iberfit\.cl|production-promote/u);
});
test('PR-only superseded builds can be canceled but merged Canary builds stay exact',()=>{
  assert.match(workflow,/group: connected360-native-qa-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/u);
  assert.match(workflow,/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/u);
  assert.match(workflow,/sha256sum "\$APK" > "\$\{APK\}\.sha256"/u);
  assert.match(workflow,/sourceSha/g);
  assert.match(workflow,/sourceSha:process\.env\.GITHUB_SHA/u);
  assert.match(workflow,/releaseCandidate:false/u);
  assert.match(workflow,/remoteHealthSync:false/u);
  assert.match(workflow,/phone-app-debug\.apk\.provenance\.json/u);
  assert.match(workflow,/retention-days: 3/u);
  assert.match(workflow,/if-no-files-found: error/u);
});
test('distributed debug proof cannot be represented as a production native health bridge',()=>{
  assert.match(view,/ApplicationInfo\.FLAG_DEBUGGABLE/u);
  assert.match(view,/window\.addFlags\(WindowManager\.LayoutParams\.FLAG_SECURE\)/u);
  assert.match(view,/"available", false/u);
  assert.match(view,/"connected", false/u);
  assert.match(view,/oneReadApproved = false/u);
  assert.match(hostManifest,/Connected360SecureWebViewActivity" android:exported="false"/u);
});


test('actual Canary artifact stamp script runs in a clean temp directory and produces verifiable JSON and APK hash',()=>{
  const section=workflow.match(/- name: Stamp isolated Canary Android QA APK\n\s+shell: bash\n\s+run: \|\n([\s\S]*?)\n\s+- name: Preserve short-lived Canary DEBUG APK/u)?.[1];
  assert.ok(section,'exact artifact stamp step must exist');
  const script=section.split('\n').map(line=>line.replace(/^          /u,'')).join('\n');
  const directory=mkdtempSync(join(tmpdir(),'iberfit-canary-apk-proof-'));
  try{
    const apk='native/android-host/phone-app/build/outputs/apk/debug/phone-app-debug.apk';
    const abs=join(directory,apk);
    mkdirSync(dirname(abs),{recursive:true});
    writeFileSync(abs,Buffer.from('synthetic test APK bytes; no device or health data'));
    const sha='a'.repeat(40);
    const run=spawnSync('bash',['-euo','pipefail','-c',script],{
      cwd:directory,encoding:'utf8',
      env:{...process.env,GITHUB_SHA:sha,GITHUB_REF_NAME:'canary/rc74-4',GITHUB_EVENT_NAME:'push'},
    });
    assert.equal(run.status,0,[run.stdout,run.stderr].join('\n'));
    const provenance=JSON.parse(readFileSync(abs+'.provenance.json','utf8'));
    assert.deepEqual(provenance,{
      schema:'iberfit.connected360.qa-apk.v1',
      sourceSha:sha,sourceRef:'canary/rc74-4',event:'push',
      applicationId:'cl.iberfit.m26.qa',
      qaOnly:true,releaseCandidate:false,remoteHealthSync:false,
      canaryOrigin:'https://m26-canary.iberfit.cl',
    });
    assert.match(readFileSync(abs+'.sha256','utf8'),/^[0-9a-f]{64} /u);
  }finally{
    rmSync(directory,{recursive:true,force:true});
  }
});
