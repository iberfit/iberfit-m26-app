import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
  assert.match(workflow,/\$GITHUB_SHA/u);
  assert.match(workflow,/releaseCandidate\\?":false/u);
  assert.match(workflow,/remoteHealthSync\\?":false/u);
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
