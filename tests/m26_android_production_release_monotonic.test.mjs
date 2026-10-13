import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAndroidReleaseVersion,assertAndroidReleaseUpgrade,shouldSignAndroidRelease}
  from '../scripts/ci/android_release_version_guard.mjs';

const prior={code:265903,name:'26.59.3-phone'};
test('Android production version must increase over the previous signed release',()=>{
  const current=parseAndroidReleaseVersion(readFileSync(
    new URL('../native/android-host/phone-app/build.gradle.kts',import.meta.url),'utf8'));
  assert.deepEqual(current,{code:265904,name:'26.59.4-phone'});
  assertAndroidReleaseUpgrade(current,prior,false);
  assert.throws(()=>assertAndroidReleaseUpgrade(prior,prior,false),
    /IBERFIT_ANDROID_VERSION_CODE_NOT_MONOTONIC/u);
  assert.throws(()=>assertAndroidReleaseUpgrade({code:265901,name:'26.59.0-phone'},prior,false),
    /IBERFIT_ANDROID_VERSION_CODE_NOT_MONOTONIC/u);
  assert.throws(()=>assertAndroidReleaseUpgrade({code:265903,name:'26.59.4-phone'},prior,false),
    /IBERFIT_ANDROID_VERSION_CODE_NOT_MONOTONIC/u);
});
test('repeat build of exact same immutable source remains reproducible',()=>{
  assert.doesNotThrow(()=>assertAndroidReleaseUpgrade(prior,prior,true));
  assert.throws(()=>assertAndroidReleaseUpgrade(
    {code:265904,name:'26.59.4-phone'},prior,true),
    /IBERFIT_ANDROID_SAME_SOURCE_VERSION_DRIFT/u);
});
test('parser fails closed on missing ambiguous or malformed Android version fields',()=>{
  for(const source of ['','versionCode = -1','versionCode = 0',
    'versionCode = 265903\nversionName = "bad"','versionName = "26.59.3-phone"',
    'versionCode = 2100000001\nversionName = "26.59.3-phone"']){
    assert.throws(()=>parseAndroidReleaseVersion(source),
      /IBERFIT_ANDROID_RELEASE_VERSION_INVALID/u);
  }
});
test('official Android signing workflow gates releases on GitHub successful history',()=>{
  const yaml=readFileSync(new URL('../.github/workflows/connected360-android-production-release.yml',import.meta.url),'utf8');
  assert.match(yaml,/actions: read/u);
  assert.match(yaml,/node scripts\/ci\/android_release_version_guard\.mjs/u);
  assert.match(yaml,/GITHUB_TOKEN/u);
  const guard=readFileSync(new URL('../scripts/ci/android_release_version_guard.mjs',import.meta.url),'utf8');
  assert.match(guard,/actions\/workflows\/connected360-android-production-release\.yml\/runs\?status=success/u);
  assert.match(guard,/assertAndroidReleaseUpgrade\(current,previousVersion/u);
  assert.match(guard,/IBERFIT_ANDROID_VERSION_HISTORY_UNAVAILABLE_/u);
});

test('frontend-only releases reuse the already signed APK, native changes require a version bump',()=>{
  const webOnly={status:'ahead',files:[
    {filename:'src/m26/wearables/controller.js'},
    {filename:'src/m26/onboarding/client-wearable-invitation.js'},
  ]};
  assert.equal(shouldSignAndroidRelease({comparison:webOnly}),false);
  assert.equal(shouldSignAndroidRelease({sameSource:true}),true);
  assert.equal(shouldSignAndroidRelease({comparison:{status:'ahead',files:[
    ...webOnly.files,{filename:'native/android-host/phone-app/src/main/java/cl/iberfit/m26/PhoneMainActivity.kt'},
  ]}}),true);
  for(const comparison of [null,{status:'diverged',files:[]},
    {status:'ahead'},{status:'ahead',files:Array.from({length:300},(_,i)=>({filename:'src/a'+i+'.js'}))},
  ])assert.throws(()=>shouldSignAndroidRelease({comparison}),
    /IBERFIT_ANDROID_NATIVE_COMPARISON_INCOMPLETE/u);
});
test('signed artifact is skipped only on certified web-only deployments; signing gates are unchanged',()=>{
  const yaml=readFileSync(new URL('../.github/workflows/connected360-android-production-release.yml',import.meta.url),'utf8');
  assert.match(yaml,/id: android_release_gate/u);
  assert.match(yaml,/outputs.sign_required == 'false'/u);
  assert.match(yaml,/outputs.sign_required == 'true'/u);
  for(const step of ['actions/setup-java@v4','gradle/actions/setup-gradle@v4',
    'Prepare Android SDK 36','Require stable production signing credentials',
    'Test release and build signed production APK / bundle',
    'Verify signed identity, certificate and no QA package','Upload signed artifacts']){
    const start=yaml.indexOf(step);
    assert.ok(start>0,step);
    assert.match(yaml.slice(start,start+230),/outputs.sign_required == 'true'/u,step);
  }
  const source=readFileSync(new URL('../scripts/ci/android_release_version_guard.mjs',import.meta.url),'utf8');
  assert.match(source,/previousManifest.sourceSha===manifest.sourceSha/u);
  assert.match(source,/shouldSignAndroidRelease\(\{sameSource,comparison\}\)/u);
  assert.match(source,/IBERFIT_ANDROID_REUSE_SIGNED_APK/u);
  assert.match(source,/appendFileSync\(process.env.GITHUB_OUTPUT,'sign_required=false\\n'\)/u);
});
