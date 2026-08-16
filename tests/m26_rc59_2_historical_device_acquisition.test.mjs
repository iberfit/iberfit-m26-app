import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  HEALTH_CONNECT_HISTORICAL_CAPABILITIES,
  HEALTH_CONNECT_MAX_LOOKBACK_DAYS,
  createHealthConnectHistoricalPlan,
  healthConnectHistoricalMetricKeys,
} from '../src/m26/wearables/historical-acquisition.js';

import {
  createWearableBridgeService,
} from '../src/m26/wearables/bridge-service.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC59.2 define exactamente seis capacidades Health Connect con lectura explicita',()=>{
  assert.equal(HEALTH_CONNECT_MAX_LOOKBACK_DAYS,30);
  assert.deepEqual(
    HEALTH_CONNECT_HISTORICAL_CAPABILITIES.map((item)=>item.key),
    [
      'steps',
      'sleep',
      'resting_heart_rate',
      'hrv',
      'active_energy',
      'exercise',
    ]
  );

  assert.deepEqual(
    HEALTH_CONNECT_HISTORICAL_CAPABILITIES.map((item)=>item.permission),
    [
      'android.permission.health.READ_STEPS',
      'android.permission.health.READ_SLEEP',
      'android.permission.health.READ_RESTING_HEART_RATE',
      'android.permission.health.READ_HEART_RATE_VARIABILITY',
      'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
      'android.permission.health.READ_EXERCISE',
    ]
  );

  for(const item of HEALTH_CONNECT_HISTORICAL_CAPABILITIES){
    assert.ok(item.purpose.length>20);
    assert.match(item.permission,/\.READ_/u);
    assert.doesNotMatch(item.permission,/WRITE_/u);
  }
});

test('RC59.2 plan minimiza permisos y limita ventana inicial a 30 dias',()=>{
  const plan=createHealthConnectHistoricalPlan({
    capabilities:['steps','hrv'],
    endDate:'2026-08-16',
    days:30,
  });

  assert.equal(plan.startDate,'2026-07-18');
  assert.equal(plan.endDate,'2026-08-16');
  assert.deepEqual(plan.metrics,['steps','hrvMs']);
  assert.deepEqual(
    plan.permissions,
    [
      'android.permission.health.READ_STEPS',
      'android.permission.health.READ_HEART_RATE_VARIABILITY',
    ]
  );
  assert.equal(plan.governance.rawSourceStored,false);
  assert.equal(plan.governance.backgroundReadRequested,false);
  assert.equal(plan.governance.fullHistoryPermissionRequested,false);
  assert.equal(plan.governance.writePermissionRequested,false);
  assert.equal(plan.governance.clinicalDecisionEngine,false);

  assert.throws(
    ()=>createHealthConnectHistoricalPlan({
      days:31,
      endDate:'2026-08-16',
    }),
    /M26_HEALTH_CONNECT_LOOKBACK_INVALID/u
  );
});

test('RC59.2 bridge transmite solo metricas seleccionadas y concedidas',async()=>{
  const authorizationCalls=[];
  const readCalls=[];

  const scope={
    IBERFIT_HEALTH_BRIDGE:{
      healthConnect:{
        async requestAuthorization(payload){
          authorizationCalls.push(structuredClone(payload));
          return {
            granted:['steps','hrvMs'],
          };
        },
        async readDailySummaries(payload){
          readCalls.push(structuredClone(payload));
          return [{
            clientId:payload.clientId,
            provider:'health_connect',
            date:'2026-08-16',
            steps:8123,
            hrvMs:47.2,
            vfcMethod:'rmssd',
            quality:'media',
          }];
        },
        async setSyncEnabled({enabled}){
          return {enabled};
        },
      },
    },
  };

  const bridge=createWearableBridgeService({scope});
  const auth=await bridge.requestAuthorization({
    provider:'health_connect',
    clientId:'CLIENT-RC592',
    scopes:['steps','hrvMs'],
  });

  assert.deepEqual(auth.requested,['steps','hrvMs']);
  assert.deepEqual(auth.granted,['steps','hrvMs']);

  const rows=await bridge.readDailySummaries({
    provider:'health_connect',
    clientId:'CLIENT-RC592',
    startDate:'2026-07-18',
    endDate:'2026-08-16',
    metrics:auth.granted,
  });

  assert.deepEqual(
    authorizationCalls[0].scopes,
    ['steps','hrvMs']
  );
  assert.deepEqual(
    readCalls[0].metrics,
    ['steps','hrvMs']
  );
  assert.equal(rows.length,1);
  assert.equal(rows[0].metrics.steps,8123);
  assert.equal(rows[0].metrics.hrvMs,47.2);
  assert.equal(rows[0].metrics.sleepMinutes,null);
});

test('RC59.2 controller expone consentimiento por capacidad y lectura acotada',()=>{
  const controller=read('src/m26/wearables/controller.js');

  assert.match(controller,/HEALTH_CONNECT_HISTORICAL_CAPABILITIES/u);
  assert.match(controller,/createHealthConnectHistoricalPlan/u);
  assert.match(controller,/data-health-connect-capability/u);
  assert.match(controller,/Solicitando únicamente los permisos seleccionados/u);
  assert.match(controller,/metrics:plan\.metrics/u);
  assert.match(controller,/startDate:plan\.startDate/u);
  assert.match(controller,/endDate:plan\.endDate/u);
  assert.match(controller,/metrics:readable/u);
  assert.doesNotMatch(
    controller,
    /targetRpe|targetRir|automaticProgression/u
  );
});

test('RC59.2 lector Android usa HealthConnectClient estable y solo lectura',()=>{
  const kotlin=read(
    'native/android/health-connect/IBERFITHealthConnectHistoricalReader.kt'
  );

  assert.match(kotlin,/HealthConnectClient/u);
  assert.match(kotlin,/MAX_LOOKBACK_DAYS = 30/u);
  assert.match(kotlin,/HealthPermission\.getReadPermission/u);
  assert.match(kotlin,/StepsRecord\.COUNT_TOTAL/u);
  assert.match(kotlin,/SleepSessionRecord\.SLEEP_DURATION_TOTAL/u);
  assert.match(kotlin,/RestingHeartRateRecord\.BPM_AVG/u);
  assert.match(kotlin,/HeartRateVariabilityRmssdRecord/u);
  assert.match(kotlin,/ACTIVE_CALORIES_TOTAL/u);
  assert.match(kotlin,/EXERCISE_DURATION_TOTAL/u);
  assert.match(
    kotlin,
    /recordType\s*=\s*HeartRateVariabilityRmssdRecord::class/u
  );
  assert.match(
    kotlin,
    /M26_HEALTH_CONNECT_LOOKBACK_EXCEEDS_30_DAYS/u
  );

  assert.doesNotMatch(kotlin,/insertRecords|updateRecords|deleteRecords/u);
  assert.doesNotMatch(
    kotlin,
    /READ_HEALTH_DATA_HISTORY|READ_HEALTH_DATA_IN_BACKGROUND/u
  );
});

test('RC59.2 Android host compila lector con Health Connect 1.1.0 estable',()=>{
  const gradle=read(
    'native/android-host/phone-app/build.gradle.kts'
  );

  assert.match(
    gradle,
    /androidx\.health\.connect:connect-client:1\.1\.0/u
  );
  assert.match(
    gradle,
    /\.\.\/\.\.\/android\/health-connect/u
  );
  assert.match(gradle,/versionCode = 265902/u);
  assert.match(gradle,/versionName = "26\.59\.2-phone"/u);
  assert.doesNotMatch(
    gradle,
    /connect-client:1\.2\.0-alpha/u
  );
});

test('RC59.2 manifiestos piden seis lecturas y ninguna escritura historia o background',()=>{
  const manifests=[
    read('native/android/AndroidManifest.xml.fragment'),
    read('native/android-host/phone-app/src/main/AndroidManifest.xml'),
  ];

  const permissions=[
    'READ_STEPS',
    'READ_SLEEP',
    'READ_RESTING_HEART_RATE',
    'READ_HEART_RATE_VARIABILITY',
    'READ_ACTIVE_CALORIES_BURNED',
    'READ_EXERCISE',
  ];

  for(const manifest of manifests){
    for(const permission of permissions){
      assert.ok(
        manifest.includes(
          `android.permission.health.${permission}`
        )
      );
    }
    assert.doesNotMatch(manifest,/READ_HEALTH_DATA_HISTORY/u);
    assert.doesNotMatch(manifest,/READ_HEALTH_DATA_IN_BACKGROUND/u);
    assert.doesNotMatch(manifest,/android\.permission\.health\.WRITE_/u);
  }
});

test('RC59.2 PWA versiona adquisicion historica y conserva lineage RC59.1',()=>{
  const sw=read('public/m26/sw.js');
  const index=read('src/m26/wearables/index.js');

  assert.match(sw,/VERSION='m26-rc59-2'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc59-1'/u);
  assert.match(
    sw,
    /Historical compatibility markers retained[^\n]*m26-rc59-1/u
  );
  assert.match(
    sw,
    /"\/src\/m26\/wearables\/historical-acquisition\.js"/u
  );
  assert.match(index,/historical-acquisition\.js/u);
});

test('RC59.2 cierra software, deja E2E fisico explicito y abre RC59.3',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');

  assert.match(
    roadmap,
    /RC59_2=SOFTWARE_CLOSED_HISTORICAL_DEVICE_ACQUISITION/u
  );
  assert.match(
    roadmap,
    /RC59_2_HEALTH_CONNECT_PHYSICAL_E2E=PENDING_ANDROID_DEVICE/u
  );
  assert.match(
    roadmap,
    /RC59_3=IN_PROGRESS_LONGITUDINAL_AGGREGATION_LAYER/u
  );
});

test('RC59.2 gobierna finalidad procedencia permisos retencion export y auditoria',()=>{
  const plan=createHealthConnectHistoricalPlan({
    capabilities:['steps'],
    endDate:'2026-08-16',
  });

  for(const key of [
    'consent',
    'purpose',
    'provenance',
    'timestamps',
    'quality',
    'ownership',
    'permissionModel',
    'retention',
    'exportDelete',
    'auditability',
  ]){
    assert.ok(plan.governance[key]);
  }

  assert.deepEqual(
    healthConnectHistoricalMetricKeys(['steps','sleep']),
    ['steps','sleepMinutes']
  );
});