import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAndroidReleaseVersion,assertAndroidReleaseUpgrade}
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
