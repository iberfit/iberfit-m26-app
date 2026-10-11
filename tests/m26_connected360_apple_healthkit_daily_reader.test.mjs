import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const swift=readFileSync(new URL('../native/apple/IBERFITIOSHealthKitDailyReader.swift',import.meta.url),'utf8');
const pkg=readFileSync(new URL('../native/apple/Package.swift',import.meta.url),'utf8');
const policy=readFileSync(new URL('../src/m26/wearables/free-policy.js',import.meta.url),'utf8');

test('iOS HealthKit historical source exists in compiled web bridge target but does not assert auto certification',()=>{
  assert.match(pkg,/IBERFITIOSHealthKitDailyReader\.swift/u);
  assert.match(swift,/#if canImport\(HealthKit\) && os\(iOS\)/u);
  assert.match(swift,/HKHealthStore\(\)/u);
  assert.match(swift,/HKObjectType\.quantityType\(forIdentifier: \.stepCount\)/u);
  assert.match(swift,/provider: "apple_health"/u);
  assert.match(swift,/sourceTimestampVerified: false/u);
  assert.match(swift,/automaticSyncCertified: false/u);
  assert.match(policy,/apple_health:policy\(\{[^]*?productionAllowed:false/u);
  assert.doesNotMatch(swift,/service_role|supabase\.co|fetch\(|URLSession|postMessage|addJavascriptInterface/u);
});

test('iOS HealthKit permission is user-initiated, scoped read-only and consumable only once',()=>{
  assert.match(swift,/func requestExplicitStepsAccess\(/u);
  assert.match(swift,/toShare: Set<HKSampleType>\(\)/u);
  assert.match(swift,/read: Set<HKObjectType>\(\[stepsType\]\)/u);
  assert.match(swift,/let permitted = oneReadApproved\s+oneReadApproved = false/u);
  assert.match(swift,/guard permitted else/u);
  assert.match(swift,/case explicitApprovalRequired/u);
  assert.match(swift,/func revokeLocalReadApproval\(/u);
  assert.doesNotMatch(swift,/requestAuthorization\(toShare: \[.*workout/gu);
});

test('late HealthKit authorization and read result are invalidated after logout or account change',()=>{
  assert.match(swift,/private var generation: UInt64 = 0/u);
  assert.match(swift,/generation &\\+= 1/u);
  assert.match(swift,/let lease = generation/u);
  assert.match(swift,/self\\.generation == lease/u);
  assert.match(swift,/if current && success && error == nil/u);
  assert.match(swift,/guard let self, self\\.isCurrent\\(lease\\) else/u);
  assert.match(swift,/guard self\\.isCurrent\\(lease\\) else/u);
  assert.match(swift,/case invalidated/u);
  assert.match(swift,/func revokeLocalReadApproval\\(\\)/u);
});

test('iOS daily steps are bounded to seven local civil days, do not invent watch source or denied data',()=>{
  assert.match(swift,/\(1\.\.\.7\)\.contains\(days\)/u);
  assert.match(swift,/calendar\.timeZone/u);
  assert.match(swift,/calendar\.startOfDay\(for: now\)/u);
  assert.match(swift,/Calendar\(identifier: \.gregorian\)/u);
  assert.match(swift,/HKStatisticsCollectionQuery\(/u);
  assert.match(swift,/options: \.cumulativeSum/u);
  assert.match(swift,/intervalComponents: DateComponents\(day: 1\)/u);
  assert.match(swift,/guard value\.isFinite, value >= 0, value <= 200_000/u);
  assert.match(swift,/guard stats\.startDate >= from, stats\.startDate < until/u);
  assert.doesNotMatch(swift,/sourceUpdatedAt|sourceIdentity:|watchSerial|physicalWatchId/u);
});
