import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  normalizeCheckinDraft,
  validateCheckinDraft,
} from '../src/m26/engagement/activity-drafts.js';
import {
  computeProgressSummary,
  buildProgressTimeline,
} from '../src/m26/engagement/progress-engine.js';
import {buildCheckinRegisterCommand} from '../src/m26/engagement/command-builders.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');

function checkin(overrides={}){
  return {
    energy:6,
    sleep:7,
    stress:3,
    pain:0,
    recordedAt:'2026-08-25T12:00:00.000Z',
    ...overrides,
  };
}

function state(checkins=[]){
  return {
    collections:{
      appointments:[],
      sessionExecutions:[],
      iriAssessments:[],
      wearableDailySummaries:[],
      checkins:checkins.map((body,index)=>({
        id:`c-${index+1}`,
        clientId:'client-1',
        status:'registrado',
        ...body,
      })),
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };
}

test('RC74.4S preserves the four-signal legacy check-in contract',()=>{
  const result=validateCheckinDraft(checkin());
  assert.equal(result.ok,true);
  assert.equal(Object.hasOwn(result.value,'fatigue'),false);
  assert.equal(Object.hasOwn(result.value,'motivation'),false);
  const command=buildCheckinRegisterCommand({clientId:'client-1',entityId:'checkin-legacy',checkin:checkin()});
  assert.equal(Object.hasOwn(command.payload.patch,'fatigue'),false);
  assert.equal(Object.hasOwn(command.payload.patch,'motivation'),false);
});

test('RC74.4S accepts zero and ten as real optional values',()=>{
  const result=validateCheckinDraft(checkin({fatigue:0,motivation:10}));
  assert.equal(result.ok,true);
  assert.equal(result.value.fatigue,0);
  assert.equal(result.value.motivation,10);
});

test('RC74.4S keeps blank optional values absent rather than converting them to zero',()=>{
  const value=normalizeCheckinDraft(checkin({fatigue:'',motivation:' '}));
  assert.equal(Object.hasOwn(value,'fatigue'),false);
  assert.equal(Object.hasOwn(value,'motivation'),false);
});

test('RC74.4S rejects supplied optional scores outside 0–10',()=>{
  const fatigue=validateCheckinDraft(checkin({fatigue:11}));
  const motivation=validateCheckinDraft(checkin({motivation:-1}));
  assert.equal(fatigue.ok,false);
  assert.ok(fatigue.errors.includes('FATIGUE_INVALID'));
  assert.equal(motivation.ok,false);
  assert.ok(motivation.errors.includes('MOTIVATION_INVALID'));
});

test('RC74.4S averages only optional values that actually exist',()=>{
  const summary=computeProgressSummary(
    state([
      checkin({recordedAt:'2026-08-24T12:00:00.000Z'}),
      checkin({recordedAt:'2026-08-23T12:00:00.000Z',fatigue:8,motivation:2}),
      checkin({recordedAt:'2026-08-22T12:00:00.000Z',fatigue:4,motivation:6}),
    ]),
    'client-1',
    {now:new Date('2026-08-25T12:00:00.000Z'),days:28},
  );
  assert.equal(summary.checkinAverage.fatigue,6);
  assert.equal(summary.checkinAverage.motivation,4);
  assert.equal(summary.latestCheckin.fatigue,null);
  assert.equal(summary.latestCheckin.motivation,null);
});

test('RC74.4S timeline exposes optional context only when recorded',()=>{
  const rows=buildProgressTimeline(
    state([
      checkin({recordedAt:'2026-08-24T12:00:00.000Z',fatigue:7,motivation:9}),
      checkin({recordedAt:'2026-08-23T12:00:00.000Z'}),
    ]),
    'client-1',
    {now:new Date('2026-08-25T12:00:00.000Z'),days:90},
  );
  assert.match(rows[0].detail,/Fatiga 7/);
  assert.match(rows[0].detail,/Motivación 9/);
  assert.doesNotMatch(rows[1].detail,/Fatiga/);
  assert.doesNotMatch(rows[1].detail,/Motivación/);
});

test('RC74.4S UI declares optional fields and explicit scale directions',()=>{
  const source=fs.readFileSync(path.join(root,'src/m26/modules/route-render.js'),'utf8');
  assert.match(source,/name="fatigue"/);
  assert.match(source,/name="motivation"/);
  assert.match(source,/Fatiga \(0–10\)/);
  assert.match(source,/0 ninguna · 10 máxima/);
  assert.match(source,/Motivación \(0–10\)/);
});

test('RC74.4S does not make fatigue or motivation an automatic adherence rule',()=>{
  const source=fs.readFileSync(path.join(root,'src/m26/engagement/adherence-engine.js'),'utf8');
  assert.doesNotMatch(source,/\bfatigue\b/);
  assert.doesNotMatch(source,/\bmotivation\b/);
});

test('RC74.4S migration keeps pre-RC74.4 helper stable and preserves omission semantics',()=>{
  const migration=fs.readFileSync(
    path.join(root,'supabase/migrations/20260825202200_iberfit_rc74_4s_wellbeing_context_qa.sql'),
    'utf8',
  );
  assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public\.iberfit_prepare_command_rc30_v26_pre_rc74_4/);
  assert.match(migration,/PRE_RC74_4_HELPER_MUTATED/);
  assert.match(migration,/WHEN v_safe_body \? 'fatigue' THEN excluded\.fatigue/);
  assert.match(migration,/WHEN v_safe_body \? 'motivation' THEN excluded\.motivation/);
  assert.match(migration,/LEGACY_OMISSION_NOT_PRESERVED/);
  assert.match(migration,/COMMAND_REGISTRY_DRIFT/);
  assert.match(migration,/DIRECT_CHECKIN_WRITE_POLICY_DRIFT/);
});
