import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {__connected360V46ProdInternals} from '../src/m26/wearables/v46-prod-native-channel.js';
import {createConnected360ProductionSync} from '../src/m26/wearables/v46-production-sync.js';
import {CONNECTED360_PRODUCTION_SCOPES,CONNECTED360_PRODUCTION_DAILY_SCOPES,
  evaluateConnected360V46Scope} from '../src/m26/wearables/measurement-capability-contract.js';
import {formatConnected360ProductionSummary} from '../src/m26/wearables/v46-production-summary.js';

const now=Date.parse('2026-10-12T15:00:00Z');
const day={date:'2026-10-12',aggregationTimeZone:'America/Santiago',
  windowStartedAt:'2026-10-12T03:00:00Z',windowEndedAt:'2026-10-13T03:00:00Z',
  acquiredAt:'2026-10-12T15:00:00Z',steps:7821,
  sleepMinutes:455,restingHeartRate:59};
const envelope={schema:'iberfit.connected360.v46.ingest.v1',
  heartRateDaily:[],exerciseEvidence:[],dailyHealth:[day]};
const clean=(payload,grants)=>__connected360V46ProdInternals.cleanEnvelope(
  payload,grants,now);
test('V47 is explicitly gated by independent client and OS grants',()=>{
  assert.deepEqual([...CONNECTED360_PRODUCTION_DAILY_SCOPES],
    ['steps','sleepMinutes','restingHeartRate']);
  assert.equal(CONNECTED360_PRODUCTION_SCOPES.length,5);
  for(const metric of CONNECTED360_PRODUCTION_DAILY_SCOPES){
    assert.equal(evaluateConnected360V46Scope(metric,{
      explicitConsent:[metric],osPermission:[metric],releaseEnabled:true,
    }).allowed,true);
    assert.equal(evaluateConnected360V46Scope(metric,{
      explicitConsent:[],osPermission:[metric],releaseEnabled:true,
    }).allowed,false);
    assert.equal(evaluateConnected360V46Scope(metric,{
      explicitConsent:[metric],osPermission:[],releaseEnabled:true,
    }).allowed,false);
  }
});
test('native reply never accepts daily values without matching Android grant',()=>{
  const v=clean(envelope,['steps','sleepMinutes','restingHeartRate']);
  assert.equal(v.dailyHealth.length,1);
  assert.equal(v.dailyHealth[0].restingHeartRate,59);
  assert.throws(()=>clean(envelope,['steps','sleepMinutes']),/RESPONSE_INVALID/u);
  assert.throws(()=>clean({...envelope,dailyHealth:[{...day,sleepMinutes:1500}]},
    ['steps','sleepMinutes','restingHeartRate']),/RESPONSE_INVALID/u);
  assert.throws(()=>clean({...envelope,dailyHealth:[day,day]},
    ['steps','sleepMinutes','restingHeartRate']),/RESPONSE_INVALID/u);
  assert.throws(()=>clean({...envelope,dailyHealth:[{...day,deviceId:'GalaxyWatch'}]},
    ['steps','sleepMinutes','restingHeartRate']),/RESPONSE_INVALID/u);
  assert.throws(()=>clean({...envelope,dailyHealth:[{...day,restingHeartRate:20}]},
    ['steps','sleepMinutes','restingHeartRate']),/RESPONSE_INVALID/u);
});
test('old V46 heart-rate and exercise reply remains supported unchanged',()=>{
  const result=clean({schema:envelope.schema,heartRateDaily:[],exerciseEvidence:[]},
    ['generalHeartRate']);
  assert.deepEqual(result.dailyHealth,[]);
});
test('V47 daily observations upload only with an existing signed-in user grant',async()=>{
  const owner='11111111-1111-4111-8111-111111111111';
  const client='22222222-2222-4222-8222-222222222222';
  const grant='33333333-3333-4333-8333-333333333333';
  let authorized=true, imported=0, oldImport=0,reads=0,refresh=0;
  const scopes=['steps','sleepMinutes','restingHeartRate'];
  const transport={
    connected360ProductionCapabilities:async()=>({serverEnabled:true}),
    connected360ProductionAuthorizationStatus:async()=>({
      authorized,grantId:authorized?grant:null,revocationCursor:0,scopes,
    }),
    importConnected360Production:async()=>{oldImport++;throw Error('V46 import should be skipped');},
    importConnected360DailyProduction:async(_jwt,g,rows)=>{
      assert.equal(g,grant);assert.equal(rows.length,1);
      assert.equal(rows[0].restingHeartRate,59);
      imported++;return {inserted:1,updated:0,unchanged:0};
    },
  };
  const native={readLocal:async({metrics})=>{
    reads++;assert.deepEqual(metrics,scopes);
    return {ownerId:owner,clientId:client,provider:'health_connect',
      persisted:false,metrics:scopes,envelope};
  },invalidate(){}};
  const sync=createConnected360ProductionSync({
    transport,native,getIdentity:()=>({role:'client',ownerId:owner,clientId:client}),
    getToken:async()=> 'synthetic-JWT-for-unit-test',
    isOnline:()=>true,refreshState:async()=>{refresh++;},
  });
  authorized=false;
  assert.equal((await sync.sync()).skipped,'consent-required');
  assert.equal(reads,0);assert.equal(imported,0);
  authorized=true;
  const result=await sync.sync();
  assert.equal(result.ok,true);assert.equal(result.inserted,1);
  assert.equal(oldImport,0);assert.equal(imported,1);assert.equal(refresh,1);
  sync.destroy();
});
test('V47 summary uses h/min and never promotes daily resting HR to general HR',()=>{
  const base={ok:true,provider:'health_connect',heartRateDaily:[],
    exerciseEvidence:[],dailyHealth:[
      {date:'2026-10-12',steps:7821,sleepMinutes:455,restingHeartRate:59},
    ]};
  const text=formatConnected360ProductionSummary(base);
  assert.match(text,/7 h 35 min/u);
  assert.match(text,/FC en reposo 59 lpm/u);
  assert.match(text,/Sin frecuencia cardíaca general registrada/u);
  assert.match(text,/origen físico del reloj no está verificado/u);
});
test('RLS, owner/consent/revocation fences and privacy deletion are deployed as a single macro',()=>{
  const sql=readFileSync(new URL(
    '../supabase/migrations/20261012230000_connected360_v47_prod_daily_health_macro.sql',
    import.meta.url),'utf8');
  for(const fragment of ['m26_wearable_daily_health_v47',
    'm26_wearable_v47_import_daily_prod_v1',
    'm26_wearable_v47_my_daily_prod_v1',
    'm26_wearable_v46_consents_prod',
    'M26_V47_EXPLICIT_CONSENT_REQUIRED','M26_V47_GRANT_REVOKED_OR_PAUSED',
    'FORCE ROW LEVEL SECURITY','owner_user_id=v_owner AND client_id=v_client',
    'auth.uid()', 'client_id','DELETE','source_identity_verified'])
    assert.ok(sql.toLowerCase().includes(fragment.toLowerCase()),fragment);
  assert.match(sql,/REVOKE ALL ON TABLE public\.m26_wearable_daily_health_v47 FROM PUBLIC,anon,authenticated,service_role/u);
  assert.doesNotMatch(sql,/GRANT (INSERT|UPDATE|DELETE) ON TABLE public\.m26_wearable_daily_health_v47/u);
  assert.match(sql,/k=ANY\(c\.scopes\)/u);
  assert.match(sql,/cardinality\(v_union\) > 12/u);
  assert.match(sql,/CREATE TABLE public\.m26_wearable_v47_consents_prod/u);
  assert.doesNotMatch(sql,/DROP CONSTRAINT|DROP TABLE/u);
  assert.match(sql,/v_row \? 'restingHeartRate'/u);
  assert.doesNotMatch(sql,/source_identity_verified\s*=\s*true/iu);
});
test('Android Release and Client present all three official independent permission types',()=>{
  const kotlin=readFileSync(new URL(
    '../native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/Connected360V46PermissionPolicy.kt',
    import.meta.url),'utf8');
  const native=readFileSync(new URL(
    '../native/android-host/phone-app/src/main/java/cl/iberfit/m26/phone/Connected360SecureWebViewActivity.kt',
    import.meta.url),'utf8');
  const client=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  for(const k of ['StepsRecord','SleepSessionRecord','RestingHeartRateRecord'])
    assert.ok(kotlin.includes(k),k);
  assert.match(native,/IberfitHealthConnectReader\(client\)\.readDaily/u);
  assert.match(native,/windowStartedAt/u);
  assert.match(native,/if \(production\)/u);
  for(const k of ['steps','sleepMinutes','restingHeartRate'])
    assert.ok(client.includes("['"+k+"','Compartir"),k);
});
