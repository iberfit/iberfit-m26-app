import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const activity=readFileSync(new URL('../native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/Connected360SecureWebViewActivity.kt',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../native/android-host/phone-app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
const host=readFileSync(new URL('../.github/workflows/connected360-android-native-qa.yml',import.meta.url),'utf8');

test('health preview is OS screenshot and recents protected before any WebView content loads',()=>{
  assert.match(activity,/import android\.view\.WindowManager/u);
  const flag=activity.indexOf('window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)');
  const web=activity.indexOf('val view = WebView(this)');
  const load=activity.indexOf('view.loadUrl(Connected360OriginGate.QA_ORIGIN');
  assert.ok(flag>0&&flag<web&&web<load);
});
test('secure display retains debug-only, exact-origin and single-read consent protections',()=>{
  assert.match(activity,/ApplicationInfo\.FLAG_DEBUGGABLE/u);
  assert.match(activity,/oneReadApproved = false/u);
  assert.match(activity,/WebViewCompat\.addWebMessageListener/u);
  assert.match(activity,/Connected360OriginGate\.trusted/u);
  assert.match(activity,/readFence\.retire\(\)/u);
  assert.match(manifest,/Connected360SecureWebViewActivity" android:exported="false"/u);
  assert.doesNotMatch(activity,/addJavascriptInterface|service_role|SUPABASE_SERVICE_KEY/u);
  assert.match(host,/phone-app:testDebugUnitTest :phone-app:assembleDebug :phone-app:assembleRelease/u);
});
