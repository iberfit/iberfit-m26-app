import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const path=new URL('../native/apple/IBERFITIOSHealthKitDailyVitalsReader.swift',import.meta.url);
const swift=readFileSync(path,'utf8');
const pkg=readFileSync(new URL('../native/apple/Package.swift',import.meta.url),'utf8');
const app=readFileSync(new URL('../native/apple/QAApp/IBERFITConnected360QAApp.swift',import.meta.url),'utf8');
const policy=readFileSync(new URL('../src/m26/wearables/free-policy.js',import.meta.url),'utf8');

test('one HealthKit permission sheet explicitly reads steps and resting HR, not exercise HR',()=>{
  assert.ok(pkg.includes('IBERFITIOSHealthKitDailyVitalsReader.swift'));
  assert.ok(swift.includes('public init() {}'), 'QA iPhone app must be able to instantiate Swift package reader');
  for(const fragment of [
    'quantityType(forIdentifier: .stepCount)',
    'quantityType(forIdentifier: .restingHeartRate)',
    'toShare: Set<HKSampleType>()',
    'read: Set<HKObjectType>([steps, resting, sleep])',
    'categoryType(forIdentifier: .sleepAnalysis)',
    'public func requestExplicitDailyAccess(',
    'public func readDailyOnce(',
    'guard (1...7).contains(days)',
  ])assert.ok(swift.includes(fragment),fragment);
  assert.doesNotMatch(swift,/heartRate\)|\.heartRate\b|HKWorkoutSession/u);
  assert.match(policy,/apple_health:policy\(\{[^]*?productionAllowed:false/u);
});

test('daily HealthKit statistics have correct units, no fabricated absent data or physical watch claims',()=>{
  for(const fragment of [
    'options: options',
    'let options: HKStatisticsOptions = isSteps ? .cumulativeSum : .discreteAverage',
    'statistics.sumQuantity()',
    'statistics.averageQuantity()',
    'HKUnit.count().unitDivided(by: HKUnit.minute())',
    'let dates = Set(stepsRows.keys)',
    '.union(hrRows.keys).union(sleepRows.keys).sorted()',
    'steps: stepsRows[date]',
    'restingHeartRate: hrRows[date]',
    'stepsReadFailed: stepsFailed',
    'restingHeartRateReadFailed: hrFailed',
    'sleepMinutes: sleepRows[date]',
    'sleepReadFailed: sleepFailed',
    'number.isFinite',
    'sourceTimestampVerified: false',
    'automaticSyncCertified: false',
    'local.timeZone = .current',
    'calendar.startOfDay(for: now)',
    'calendar.timeZone.identifier',
  ])assert.ok(swift.includes(fragment),fragment);
  assert.doesNotMatch(swift,/sourceUpdatedAt|watchSerial|deviceId:|AppleWatchId|service_role|URLSession|fetch\(|postMessage/u);
});

test('one-shot read, Swift6 Sendable, and account replacement reject delayed HealthKit data',()=>{
  for(const fragment of [
    '@escaping @Sendable (Result<Void, Error>) -> Void',
    '@escaping @Sendable (Result<[DailyVitals], Error>) -> Void',
    'private var generation: UInt64 = 0',
    'generation &+= 1',
    'let lease = generation',
    'oneReadApproved = false',
    'guard let self, self.isCurrent(lease) else',
    'func revokeLocalReadApproval()',
  ])assert.ok(swift.includes(fragment),fragment);
  assert.match(app,/reader\.requestExplicitDailyAccess/u);
  assert.match(app,/reader\.readDailyOnce\(days: 7\)/u);
  assert.match(app,/row\.restingHeartRate/u);
  assert.match(app,/row\.sleepMinutes/u);
  assert.match(app,/Sueño: sin dato/u);
  assert.match(app,/row\.stepsReadFailed/u);
  assert.match(app,/row\.restingHeartRateReadFailed/u);
  assert.match(app,/FC en reposo: sin dato/u);
  assert.match(app,/if newPhase == \.background \{ model\.invalidate\(\) \}/u);
  assert.doesNotMatch(app,/if newPhase != \.active \{ model\.invalidate\(\) \}/u);
  assert.match(app,/#if !DEBUG/u);
  assert.doesNotMatch(app,/supabase\.co|app\.iberfit\.cl|URLSession|WKWebView|postMessage/u);
  assert.doesNotMatch(app,/\\n\s+(?:Text|VStack)\(/u,'literal escaped line breaks break Xcode SwiftUI');
});

test('three local metrics remain independent and a HealthKit stall terminates once',()=>{
  const reply=readFileSync(new URL('../native/apple/IBERFITHealthKitSingleReply.swift',import.meta.url),'utf8');
  assert.match(pkg,/IBERFITHealthKitSingleReply.swift/u);
  assert.match(swift,/let stepsFailed = stepsResult.isFailure/u);
  assert.match(swift,/let hrFailed = restingResult.isFailure/u);
  assert.match(swift,/let sleepFailed = sleepResult.isFailure/u);
  assert.match(swift,/let reply = IBERFITHealthKitSingleReply/u);
  assert.match(swift,/DispatchQueue.global\(qos: \.utility\).asyncAfter\(deadline: \.now\(\) \+ 18\)/u);
  assert.match(swift,/self.revokeLocalReadApproval\(\)/u);
  assert.match(swift,/reply.finish\(\.failure\(ReaderError.timedOut\)\)/u);
  assert.match(swift,/case allMetricsFailed/u);
  assert.match(reply,/private let lock = NSLock\(\)/u);
  assert.match(reply,/if shouldDeliver \{ callback\(result\) \}/u);
  assert.match(swift,/sleepMinutes: sleepRows\[date\]/u);
  assert.doesNotMatch(swift,/completion\(\.failure\(error\)\)\s*case \.success\(let stepRows/u);
});
