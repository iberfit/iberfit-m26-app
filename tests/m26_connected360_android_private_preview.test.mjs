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


test('Health Connect local permission screen protects displayed steps, sleep and heart rate',()=>{
  const local=readFileSync(new URL('../native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/Connected360HealthPermissionsActivity.kt',import.meta.url),'utf8');
  assert.match(local,/import android\.view\.WindowManager/u);
  assert.ok(local.includes('import android.content.pm.ApplicationInfo'));
  assert.ok(local.includes('ApplicationInfo.FLAG_DEBUGGABLE'));
  const guard=local.indexOf('if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) == 0)');
  const finish=local.indexOf('finish()',guard);
  const earlyReturn=local.indexOf('return',finish);
  const permissionUi=local.indexOf('val column = LinearLayout(this)');
  assert.ok(guard>0&&finish>guard&&earlyReturn>finish&&permissionUi>earlyReturn,
    'release build must finish before constructing the local Health Connect UI');

  const flag=local.indexOf('window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)');
  const content=local.indexOf('val column = LinearLayout(this)');
  assert.ok(flag>0&&content>flag,'privacy flag must precede the local health UI');
  const formatter=readFileSync(new URL('../native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/Connected360LocalSummaryFormatter.kt',import.meta.url),'utf8');
  const nativeSpecs=readFileSync(new URL('../native/android-host/phone-app/src/test/java/cl/iberfit/m26/phone/Connected360LocalSummaryFormatterTest.kt',import.meta.url),'utf8');
  assert.match(local,/Connected360LocalSummaryFormatter\.render\(records, metrics\)/u);
  assert.match(formatter,/val stepsDays = records\.count \{ it\.steps != null \}/u);
  assert.match(formatter,/records\.lastOrNull \{ it\.sleepMinutes != null \}/u);
  assert.match(formatter,/records\.lastOrNull \{ it\.restingHeartRate != null \}/u);
  assert.match(formatter,/sin permiso de lectura/u);
  assert.match(formatter,/sin registros accesibles/u);
  assert.match(nativeSpecs,/olderSleepAndHeartRateAreVisibleWhenNewestDayHasStepsOnly/u);
  assert.match(nativeSpecs,/actualZeroStepsCountAsRecordRatherThanAbsentData/u);
  assert.doesNotMatch(formatter,/URLSession|HttpClient|Supabase|service_role|addJavascriptInterface/u);
  assert.match(local,/permissionLauncher\.launch\(missing\)/u);
  assert.doesNotMatch(local,/addJavascriptInterface|service_role|SUPABASE_SERVICE_KEY/u);
});
