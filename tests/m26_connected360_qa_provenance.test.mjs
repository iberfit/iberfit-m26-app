import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createQaNativeDailyRecord,
  projectQaNativeRecordToV44,
  CONNECTED360_QA_PROVENANCE_SCHEMA,
} from '../src/m26/wearables/qa-native-provenance.js';

const CLIENT='11111111-1111-4111-8111-111111111111';
const input={
  clientId:CLIENT,date:'2026-10-09',
  acquiredAt:'2026-10-09T15:00:00Z',
  metrics:{steps:5321,sleepMinutes:412,restingHeartRate:57},
};

test('v45 QA preview separates acquisition from unknown measurement and source update',()=>{
  const record=createQaNativeDailyRecord(input);
  assert.equal(record.provenance.schema,CONNECTED360_QA_PROVENANCE_SCHEMA);
  assert.equal(record.provenance.acquiredAt,'2026-10-09T15:00:00.000Z');
  for(const key of ['measuredAt','sourceUpdatedAt','sourceIdentity','timeZone']){
    assert.equal(record.provenance[key],null);
  }
  assert.equal(record.provenance.sourceTimestampVerified,false);
  assert.equal(record.provenance.automaticSyncCertified,false);
  assert.equal(record.sourceRecordCount,1);
  assert.equal(record.quality,'limitada');
  assert.equal(record.sourceUpdatedAt,undefined);
  assert.equal(Object.isFrozen(record),true);
  assert.equal(Object.isFrozen(record.provenance),true);
  assert.equal(Object.isFrozen(record.metrics),true);
});

test('only an explicit legacy RPC projection aliases acquisition to sourceUpdatedAt',()=>{
  const record=createQaNativeDailyRecord(input);
  const legacy=projectQaNativeRecordToV44(record);
  assert.deepEqual(Object.keys(legacy).sort(),[
    'clientId','date','metrics','provider','quality','sourceRecordCount','sourceUpdatedAt',
  ]);
  assert.equal(legacy.sourceUpdatedAt,record.provenance.acquiredAt);
  assert.equal(legacy.provider,'health_connect');
  assert.deepEqual(legacy.metrics,input.metrics);
  assert.equal(record.provenance.sourceUpdatedAt,null);
});

test('reacquisition never becomes a verifiable watch measurement timestamp',()=>{
  const earlier=createQaNativeDailyRecord(input);
  const later=createQaNativeDailyRecord({...input,acquiredAt:'2026-10-09T16:00:00Z'});
  assert.equal(earlier.provenance.measuredAt,null);
  assert.equal(later.provenance.measuredAt,null);
  assert.equal(later.provenance.sourceTimestampVerified,false);
  assert.notEqual(projectQaNativeRecordToV44(earlier).sourceUpdatedAt,
    projectQaNativeRecordToV44(later).sourceUpdatedAt);
});

test('rejects invalid dates and metrics; absence remains absent rather than zero',()=>{
  for(const candidate of [
    {...input,date:'2026-02-31'},
    {...input,metrics:{steps:-1}},
    {...input,metrics:{sleepMinutes:1441}},
    {...input,metrics:{restingHeartRate:241}},
    {...input,metrics:{steps:25.5}},
    {...input,acquiredAt:'not a timestamp'},
  ])assert.throws(()=>createQaNativeDailyRecord(candidate),/PROVENANCE_INVALID/);
  const onlySteps=createQaNativeDailyRecord({...input,metrics:{steps:0}});
  assert.deepEqual(onlySteps.metrics,{steps:0});
  assert.equal(onlySteps.metrics.sleepMinutes,undefined);
});

test('no elevation to certified device/source, nor timestamp assertion, is accepted for legacy projection',()=>{
  const record=createQaNativeDailyRecord(input);
  const variants=[
    {measuredAt:'2026-10-09T12:00:00Z'},
    {sourceUpdatedAt:'2026-10-09T15:00:00Z'},
    {sourceIdentity:'watch-123'},
    {timeZone:'America/Santiago'},
    {sourceTimestampVerified:true},
    {automaticSyncCertified:true},
    {schema:'fake'},
  ];
  for(const fields of variants){
    assert.throws(
      ()=>projectQaNativeRecordToV44({...record,provenance:{...record.provenance,...fields}}),
      /PROVENANCE_UNVERIFIED/,
    );
  }
});

test('native civil-day aggregation zone is retained without pretending source time or identity',()=>{
  const zoned=createQaNativeDailyRecord({...input,aggregationTimeZone:'America/Santiago'});
  assert.equal(zoned.provenance.aggregationTimeZone,'America/Santiago');
  assert.equal(zoned.provenance.timeZone,null,'sensor time zone remains unknown');
  assert.equal(zoned.provenance.measuredAt,null);
  assert.equal(zoned.provenance.sourceUpdatedAt,null);
  assert.equal(zoned.provenance.sourceIdentity,null);
  assert.equal(zoned.provenance.sourceTimestampVerified,false);
  assert.equal(zoned.provenance.automaticSyncCertified,false);
  const legacy=projectQaNativeRecordToV44(zoned);
  assert.equal(legacy.aggregationTimeZone,undefined,'V44 transport discards unmodelled metadata');
  assert.equal(legacy.sourceUpdatedAt,zoned.provenance.acquiredAt);
  for(const aggregationTimeZone of ['bad<script>', 'America/ Santiago', '', 'x'.repeat(81)]){
    assert.throws(()=>createQaNativeDailyRecord({...input,aggregationTimeZone}),/PROVENANCE_INVALID/);
    assert.throws(()=>projectQaNativeRecordToV44({
      ...zoned,provenance:{...zoned.provenance,aggregationTimeZone},
    }),/PROVENANCE_UNVERIFIED/);
  }
});

test('native QA Android transport carries verified aggregation zone across the secure boundary',()=>{
  const reader=readFileSync('native/android-health-connect/healthconnect/src/main/java/cl/iberfit/healthconnect/IberfitHealthConnectReader.kt','utf8');
  const bridge=readFileSync('native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/Connected360SecureWebViewActivity.kt','utf8');
  const channel=readFileSync('src/m26/wearables/qa-native-channel.js','utf8');
  const importer=readFileSync('src/m26/wearables/qa-native-import.js','utf8');
  assert.match(reader,/aggregationTimeZone = zone\.id/u);
  assert.match(bridge,/\.put\("aggregationTimeZone", record\.aggregationTimeZone\)/u);
  assert.match(channel,/aggregationTimeZone:row\.aggregationTimeZone\?\?null/u);
  assert.match(importer,/aggregationTimeZone:row\.aggregationTimeZone\?\?null/u);
  assert.doesNotMatch(bridge,/\.put\("sourceUpdatedAt", record\./u);
});

test('Canary native importer uses typed V45 preview and strips it at RPC boundary',()=>{
  const importer=readFileSync(new URL('../src/m26/wearables/qa-native-import.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  assert.match(importer,/createQaNativeDailyRecord\(/u);
  assert.match(importer,/pending\.records\.map\(projectQaNativeRecordToV44\)/u);
  assert.match(importer,/row\.provenance\.acquiredAt/u);
  assert.doesNotMatch(importer,/sourceUpdatedAt:new Date\(acquired\)/u);
  assert.match(ui,/La hora de lectura no acredita cuándo lo actualizó el reloj/u);
  assert.match(ui,/La hora de lectura no certifica la fecha de medición/u);
});
