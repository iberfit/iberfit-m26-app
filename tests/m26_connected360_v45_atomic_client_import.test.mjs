import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConnected360QaImporter} from '../src/m26/wearables/qa-native-import.js';

const CLIENT='11111111-1111-4111-8111-111111111111';
const GRANT='33333333-3333-4333-8333-333333333333';
const ACQUIRED='2026-10-11T15:00:00Z';
const preview={
  provider:'health_connect',linked:false,persisted:false,
  userConfirmedLocalRead:true,grantedMetrics:['steps'],
  rows:[{provider:'health_connect',date:'2026-10-11',
    acquiredAt:ACQUIRED,aggregationTimeZone:'America/Santiago',
    metrics:{steps:7319}}],
};
const result={
  ok:true,persisted:true,automatic:false,provider:'health_connect',
  inserted:1,updated:0,unchanged:0,count:1,
  legacyAccepted:1,legacyStale:0,
  sourceTimeVerified:false,sourceIdentityVerified:false,
};

function setup({ack=result,afterPersist=()=>{}}={}){
  const state={identity:{ownerId:'client-user-A',clientId:CLIENT,role:'client'},
    requests:[],authorizations:[],legacy:[],reloads:0};
  const scope={location:{origin:'https://m26-canary.iberfit.cl'},
    IBERFIT_CONNECTED360_QA:{postMessage(){},addEventListener(){}}};
  const importer=createConnected360QaImporter({
    scope,now:()=>Date.parse(ACQUIRED)+120000,
    isOnline:()=>true,
    getIdentity:()=>state.identity,
    getToken:async()=> 'synthetic-test-token-not-a-secret',
    transport:{
      validateConnected360QaNativePreview:async(_,id,body)=>{
        assert.equal(id,GRANT);
        assert.equal(body.records.length,1);
        return {ok:true,validated:1,persisted:false,automatic:false,
          sourceTimeVerified:false,sourceIdentityVerified:false,
          provider:'health_connect'};
      },
      importConnected360QaV45:async (...args)=>{
        state.requests.push(args);
        await afterPersist(state);
        return ack;
      },
      importWearableAuthorized:async (...args)=>{
        state.legacy.push(args);
        throw new Error('M26_QA_UNEXPECTED_SECOND_REMOTE_WRITE');
      },
    },
    remoteSync:{
      reauthorize:async args=>{state.authorizations.push(args);return {grantId:GRANT};},
      currentAuthorization:async args=>{
        state.authorizations.push(args);
        return {grantId:GRANT};
      },
    },
    refreshState:async()=>{state.reloads++;},
  });
  return {state,importer};
}

test('single confirmed V45 endpoint carries honest native data, with no duplicate V44 HTTP request',async()=>{
  const x=setup();
  x.importer.capture(preview);
  await assert.rejects(x.importer.commit(),/EXPLICIT_CONSENT_REQUIRED/u);
  assert.equal(x.state.requests.length,0);
  const answer=await x.importer.commit({confirmed:true});
  assert.equal(answer.persisted,true);
  assert.equal(answer.automatic,false);
  assert.equal(answer.imported,1);
  assert.equal(x.state.reloads,1);
  assert.equal(x.state.requests.length,1);
  assert.equal(x.state.legacy.length,0);
  const [token,grant,body]=x.state.requests[0];
  assert.equal(token,'synthetic-test-token-not-a-secret');
  assert.equal(grant,GRANT);
  assert.equal(body.records[0].metrics.steps,7319);
  assert.equal(body.records[0].provenance.sourceUpdatedAt,null);
  assert.equal(body.records[0].provenance.measuredAt,null);
  assert.equal(body.records[0].provenance.automaticSyncCertified,false);
  assert.equal(body.records[0].provenance.aggregationTimeZone,'America/Santiago');
  assert.equal(x.state.authorizations.length,3);
  assert.equal(x.importer.hasPreview(),false);
});

test('false automatic certification or incomplete legacy acknowledgment never clears preview',async()=>{
  for(const ack of [
    {...result,automatic:true},
    {...result,legacyAccepted:0,legacyStale:0},
    {...result,legacyAccepted:1,legacyStale:-1},
    {...result,persisted:false},
  ]){
    const x=setup({ack});
    x.importer.capture(preview);
    await assert.rejects(x.importer.commit({confirmed:true}),
      /REMOTE_IMPORT_UNVERIFIED/u);
    assert.equal(x.state.reloads,0);
    assert.equal(x.importer.hasPreview(),true);
  }
});

test('V45 unchanged replay is never presented as a newly imported health measurement',async()=>{
  const x=setup({ack:{...result,inserted:0,updated:0,unchanged:1,
    legacyAccepted:1,legacyStale:0}});
  x.importer.capture(preview);
  const outcome=await x.importer.commit({confirmed:true});
  assert.equal(outcome.imported,0,'V44 accepted an idempotent replay, not new V45 data');
  assert.equal(outcome.unchanged,1);
  assert.equal(outcome.recordCount,1);
  assert.equal(outcome.persisted,true);
  assert.equal(outcome.automatic,false);
  assert.equal(x.state.requests.length,1);
  assert.equal(x.state.legacy.length,0);
});

test('V44 mirror ack distinguishes truly unchanged V45 replay without incrementing revision',async()=>{
  const x=setup({ack:{...result,inserted:0,updated:0,unchanged:1,
    legacyAccepted:0,legacyStale:1}});
  x.importer.capture(preview);
  const outcome=await x.importer.commit({confirmed:true});
  assert.equal(outcome.imported,0);
  assert.equal(outcome.unchanged,1);
  assert.equal(x.state.requests.length,1);
  assert.equal(x.state.legacy.length,0);
});

test('account switch during a delayed V45 response cannot update new client state',async()=>{
  const x=setup({afterPersist:state=>{
    state.identity={...state.identity,clientId:'22222222-2222-4222-8222-222222222222'};
  }});
  x.importer.capture(preview);
  await assert.rejects(x.importer.commit({confirmed:true}),
    /SESSION_CHANGED/u);
  assert.equal(x.state.reloads,0);
  assert.equal(x.state.legacy.length,0);
});

test('V45 mirrors V44 atomically in one QA transaction, without a second browser upload',()=>{
  const sql=readFileSync(new URL('../supabase/qa-migrations/20261011165500_connected360_v45_atomic_legacy_mirror_qa.sql',import.meta.url),'utf8');
  const lock=sql.indexOf('pg_advisory_xact_lock(');
  const check=sql.indexOf('m26_wearable_v45_validate_native_preview_qa_v1(');
  const v45=sql.indexOf('insert into public.m26_wearable_source_daily_v45');
  const v44=sql.indexOf('v_legacy_ack := public.m26_wearable_import_authorized_v2(');
  assert.ok(lock>=0&&check>lock&&v45>check&&v44>v45);
  assert.match(sql,/M26_CONNECTED360_V45_LEGACY_ATOMIC_FAIL/u);
  assert.match(sql,/coalesce\(\(v_legacy_ack->>'rejected'\)::integer,-1\)<>0/u);
  assert.match(sql,/'sourceUpdatedAt',v_provenance->>'acquiredAt'/u);
  assert.match(sql,/'legacyAccepted',v_legacy_ack->'accepted'/u);
  assert.match(sql,/'legacyStale',v_legacy_ack->'stale'/u);
  const safe=readFileSync(new URL('../supabase/qa-migrations/20261011183000_connected360_v45_idempotent_legacy_revision_qa.sql',import.meta.url),'utf8');
  assert.match(safe,/v_changed:=false/u);
  assert.match(safe,/if v_changed then[\\s\\S]*?v_legacy_records :=/u);
  assert.match(safe,/if pg_catalog\\.jsonb_array_length\\(v_legacy_records\\)>0 then/u);
  assert.match(safe,/'legacyStale',coalesce\\(\\(v_legacy_ack->>'stale'\\)::integer,0\\)\\+v_unchanged/u);

  assert.match(sql,/security definer set search_path=''/iu);
});
