import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {buildNextSessionPreparation} from '../src/m26/intelligence/next-session-prep.js';
import {renderSessionsRoute} from '../src/m26/modules/route-render.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const CLIENT='client-coach-device-evidence';
const NOW=new Date('2026-10-10T12:00:00.000Z');

function record({clientId=CLIENT,provider='health_connect',date='2026-10-10',metrics={steps:8000}}={}){
  return {
    clientId,provider,date,
    sourceUpdatedAt:null,quality:'limitada',
    ...metrics,
  };
}
function state(rows=[]){
  return {
    pendingOperations:[],conflicts:[],rejectedOperations:[],
    collections:{
      clients:[],appointments:[],sessions:[],sessionExecutions:[],
      checkins:[],iriAssessments:[],trainingCycles:[],m26Entities:[],
      wearableDailySummaries:rows,
    },
  };
}
function render(prep){
  return renderSessionsRoute({
    kind:'sesion',role:'coach',clientId:CLIENT,serviceKind:'training',
    canBuild:true,serviceActive:true,sessions:[],executions:[],
    sessionCounts:{published:0},nextSessionPreparation:prep,
  });
}

test('Coach receives permitted recent daily activity automatically without altering sessions',()=>{
  const data=state([
    record({date:'2026-10-10',metrics:{steps:6000,sleepMinutes:450,restingHeartRate:58}}),
    record({date:'2026-10-09',metrics:{steps:10000,sleepMinutes:420,restingHeartRate:62}}),
  ]);
  const before=structuredClone(data);
  const prep=buildNextSessionPreparation(data,CLIENT,{now:NOW});
  assert.equal(prep.deviceContext.status,'recent');
  assert.equal(prep.deviceContext.recentDays,2);
  assert.deepEqual(prep.deviceContext.metrics,{
    steps:8000,sleepMinutes:435,restingHeartRate:60,
  });
  const html=render(prep);
  assert.match(html,/data-next-session-device-context/u);
  assert.match(html,/Pasos diarios/u);
  assert.match(html,/8000/u);
  assert.match(html,/7 h 15 min/u);
  assert.match(html,/60 lpm/u);
  assert.match(html,/No son mediciones en directo ni acreditan una conexión automática/u);
  assert.equal(prep.safety.automaticLoadChange,false);
  assert.equal(prep.safety.automaticExerciseChange,false);
  assert.deepEqual(data,before);
});

test('historical device records remain historical and do not imply current readiness',()=>{
  const prep=buildNextSessionPreparation(state([
    record({date:'2026-10-05',metrics:{steps:12000,sleepMinutes:480}}),
  ]),CLIENT,{now:NOW});
  assert.equal(prep.deviceContext.status,'historical');
  assert.equal(prep.deviceContext.metrics,null);
  const html=render(prep);
  assert.match(html,/ninguno sirve como contexto reciente/u);
  assert.doesNotMatch(html,/12000/u);
  assert.doesNotMatch(html,/8 h 00 min/u);
});

test('multiple devices never sum or average overlapping activity',()=>{
  const prep=buildNextSessionPreparation(state([
    record({provider:'health_connect',metrics:{steps:9000}}),
    record({provider:'apple_health',metrics:{steps:11000}}),
  ]),CLIENT,{now:NOW});
  assert.equal(prep.deviceContext.status,'multiple-sources');
  assert.equal(prep.deviceContext.metrics,null);
  const html=render(prep);
  assert.match(html,/Existen fuentes recientes superpuestas/u);
  assert.doesNotMatch(html,/20000/u);
  assert.doesNotMatch(html,/9000|11000/u);
});

test('cross-client records do not surface and missing metrics never turn into zero',()=>{
  const prep=buildNextSessionPreparation(state([
    record({clientId:'someone-else',metrics:{steps:99999,sleepMinutes:750}}),
    record({metrics:{restingHeartRate:55}}),
  ]),CLIENT,{now:NOW});
  assert.equal(prep.deviceContext.status,'recent');
  assert.equal(prep.deviceContext.metrics.steps,null);
  assert.equal(prep.deviceContext.metrics.sleepMinutes,null);
  assert.equal(prep.deviceContext.metrics.restingHeartRate,55);
  const html=render(prep);
  assert.match(html,/55 lpm/u);
  assert.doesNotMatch(html,/99999|12 h 30 min|Pasos diarios/u);
});

test('without records no device element is added and the Client has no Coach prep',()=>{
  const prep=buildNextSessionPreparation(state([]),CLIENT,{now:NOW});
  assert.equal(prep.deviceContext.status,'missing');
  assert.doesNotMatch(render(prep),/data-next-session-device-context/u);
  const route=readFileSync(new URL('../src/m26/modules/route-view-model.js',import.meta.url),'utf8');
  assert.match(route,/clientId&&trainingActive&&\['admin','coach'\]\.includes\(role\)/u);
  const renderSource=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.match(renderSource,/escapeHtml\(description\)/u);
  assert.match(renderSource,/escapeHtml\(value\)/u);
});

test('Coach device context and dated evidence translate into EN, FR and PT',()=>{
  const strings=[
    'Actividad y descanso registrados',
    'FC reposo',
    'Existen fuentes recientes superpuestas. No se suman ni promedian valores de relojes diferentes.',
    'Hay registros históricos, pero ninguno sirve como contexto reciente de la próxima sesión.',
    'Datos diarios incorporados con permiso. No son mediciones en directo ni acreditan una conexión automática. No modifican el plan.',
    '2 días con registros recientes de una sola fuente. Valores medios de esos días.',
    '1 día con registros recientes de una sola fuente. Valores medios de esos días.',
  ];
  for(const language of ['en','fr','pt']){
    for(const source of strings){
      assert.notEqual(iberfitSurfaceTranslate(source,{language}),source,`${language}: ${source}`);
    }
  }
});


test('V49 candidate professional sharing is owner-decided, recipient-specific and generation-bound',()=>{
  const sql=readFileSync(new URL('../supabase/release-procedures/connected360_v49_coach_activity_consent_v1.sql',import.meta.url),'utf8');
  const rollback=readFileSync(new URL('../supabase/release-procedures/connected360_v49_coach_activity_consent_v1.rollback.sql',import.meta.url),'utf8');
  for(const term of [
    'ENABLE ROW LEVEL SECURITY','FORCE ROW LEVEL SECURITY',
    'FROM PUBLIC,anon,authenticated,service_role','private.m26_v49_live_session()',
    "p.role::text='client'",'p_expected_revision',
    'M26_V49_CONSENT_STALE','m26_v49_invalidate_legacy_assignment','m26_v49_invalidate_versioned_assignment',
    'a.active AND a.created_at=g.legacy_assignment_created_at',
    'b.revision=g.assignment_revision','g.coach_user_id=v_coach AND g.revoked_at IS NULL',
    's.grant_id=g.source_grant_id AND s.revocation_cursor=g.source_cursor',
    'iberfit_require_privileged_assurance_v65d()',
    "coalesce((v_context->'roles')?'admin',false)",
    'SELECT DISTINCT (w.observed_started_at AT TIME ZONE',
    'w.grant_id=v_g.source_grant_id AND w.revocation_cursor=v_g.source_cursor',
    'LANGUAGE sql SECURITY INVOKER','coaching-exercise-days-v1',
  ])assert.ok(sql.includes(term),term);
  assert.doesNotMatch(sql,/GRANT SELECT ON TABLE|source_record_key|source_app_key|heart_rate_avg|distance_meters/iu);
  assert.doesNotMatch(rollback,/DROP TABLE|DELETE FROM|TRUNCATE/iu);
});

test('V49 release procedure has a single transaction and unique function definitions',()=>{
  const sql=readFileSync(new URL('../supabase/release-procedures/connected360_v49_coach_activity_consent_v1.sql',import.meta.url),'utf8');
  assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);
  assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
  const names=[...sql.matchAll(/^CREATE FUNCTION ([^(]+)\(/gm)].map(m=>m[1]);
  assert.equal(new Set(names).size,names.length);
  assert.ok(sql.includes("THEN (auth.jwt()->>'session_id')::uuid ELSE NULL END"));
  assert.match(sql,/\{12\}\$'\s+THEN/u);
  assert.ok(sql.includes('private.m26_v49_eligible_assignments(v_client'));
  assert.ok(sql.includes('private.m26_v49_eligible_assignments(p_client'));
  assert.ok(sql.includes('FULL JOIN decisions'));
  assert.ok(sql.includes('LIMIT 21'));
  assert.ok(sql.includes('M26_V49_RECIPIENT_LIMIT'));
  assert.ok(sql.includes('public.m26_wearable_v49_my_coach_recipients_v1()'));
});
