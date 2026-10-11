import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const project=readFileSync(new URL('../native/apple/project.yml',import.meta.url),'utf8');
const app=readFileSync(new URL('../native/apple/QAApp/IBERFITConnected360QAApp.swift',import.meta.url),'utf8');
const reader=readFileSync(new URL('../native/apple/IBERFITIOSHealthKitDailyReader.swift',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/connected360-apple-native-qa.yml',import.meta.url),'utf8');

test('isolated iPhone QA target cannot silently become a production-signed app',()=>{
  assert.match(project,/PRODUCT_BUNDLE_IDENTIFIER: cl\.iberfit\.m26\.connected360qa/u);
  assert.match(project,/CODE_SIGN_ENTITLEMENTS: IBERFITHealthKit\.entitlements/u);
  assert.match(project,/INFOPLIST_KEY_NSHealthShareUsageDescription:/u);
  assert.match(project,/path: QAApp/u);
  assert.match(project,/package: IBERFITNativeApple/u);
  assert.match(app,/#if !DEBUG\s+#error\("IBERFIT Connected360 QA cannot be built for distribution\."\)/u);
  assert.match(app,/@main/u);
  assert.doesNotMatch(app,/app\.iberfit\.cl|m26-canary\.iberfit\.cl|supabase\.co|service_role|SUPABASE_/u);
});

test('native iPhone QA harness is an explicit one-tap local read, never an upload or background sync',()=>{
  assert.match(app,/reader\.requestExplicitDailyAccess/u);
  assert.match(app,/reader\.readDailyOnce\(days: 7\)/u);
  assert.match(app,/reader\.revokeLocalReadApproval/u);
  assert.match(app,/IBERFITIOSHealthKitDailyVitalsReader/u);
  assert.match(app,/FC en reposo: sin dato/u);
  assert.match(app,/case \.success\(let newRows\)/u);
  assert.match(app,/\.onChange\(of: phase\)/u);
  assert.match(app,/if newPhase == \.background \{ model\.invalidate\(\) \}/u);
  assert.doesNotMatch(app,/if newPhase != \.active \{ model\.invalidate\(\) \}/u);
  assert.match(app,/guard let self, self\.generation == lease else \{ return \}/u);
  assert.match(reader,/public func readStepsOnce/u);
  assert.match(reader,/public func requestExplicitStepsAccess/u);
  assert.doesNotMatch(app,/URLSession|WKWebView|WKScriptMessage|postMessage|serviceRole|fetch\(/u);
  assert.match(app,/ni envía registros/u);
});

test('Xcode simulator gate compiles exact QA app target and disallows distribution signing',()=>{
  assert.match(workflow,/Compile isolated iPhone QA container/u);
  assert.match(workflow,/xcodegen generate --spec project\.yml/u);
  assert.match(workflow,/IBERFITConnected360QA\.xcodeproj/u);
  assert.match(workflow,/CODE_SIGNING_ALLOWED=NO build/u);
  assert.match(workflow,/m26_connected360_ios_qa_app_isolation\.test\.mjs/u);
});
