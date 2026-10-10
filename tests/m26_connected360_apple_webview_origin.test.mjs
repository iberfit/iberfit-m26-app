import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const bridge=readFileSync(new URL('../native/apple/IBERFITWebTelemetryBridge.swift',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../native/apple/IBERFITIOSNativeTelemetryRuntime.swift',import.meta.url),'utf8');

test('HealthKit/BLE telemetry never dispatches into an untrusted or navigated WKWebView',()=>{
  assert.match(bridge,/private let allowedHosts: Set<String>/u);
  assert.match(bridge,/init\(webView: WKWebView, allowedHosts: Set<String>\)/u);
  assert.match(runtime,/IBERFITWebTelemetryEmitter\(webView: webView, allowedHosts: allowedHosts\)/u);
  assert.match(bridge,/DispatchQueue\.main\.async \{ \[weak self\] in[\s\S]*?let webView = self\.webView,[\s\S]*?let url = webView\.url,[\s\S]*?url\.scheme\?\.lowercased\(\) == "https"/u);
  assert.match(bridge,/let host = url\.host\?\.lowercased\(\),[\s\S]*?self\.allowedHosts\.contains\(host\)/u);
  assert.match(bridge,/window\.location\.protocol!=='https:'/u);
  assert.match(bridge,/window\.location\.hostname\.toLowerCase\(\)/u);
  assert.match(bridge,/withJSONObject: Array\(allowedHosts\)\.sorted\(\)/u);
  assert.doesNotMatch(bridge,/self\?\.webView\?\.evaluateJavaScript/u);
});

test('native health commands require HTTPS main document and matching active host',()=>{
  assert.match(bridge,/message\.frameInfo\.isMainFrame/u);
  assert.match(bridge,/message\.frameInfo\.securityOrigin\.protocol\.lowercased\(\) == "https"/u);
  assert.match(bridge,/let webView = message\.webView,[\s\S]*?let activeURL = webView\.url,[\s\S]*?activeURL\.scheme\?\.lowercased\(\) == "https"/u);
  assert.match(bridge,/activeHost == message\.frameInfo\.securityOrigin\.host\.lowercased\(\)/u);
  assert.match(bridge,/allowedHosts\.contains\(activeHost\)/u);
  assert.match(bridge,/precondition\(!allowedHosts\.contains\("\*"\)\)/u);
  assert.match(bridge,/onCommand\?\(action, body\)/u);
});
