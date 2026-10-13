import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {__applicationInternals} from '../src/m26/app/application.js';

const own='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const session=(status,clientId=own,id='20000000-0000-4000-8000-000000000001')=>({
  id,clientId,status,title:'Carrera suave',deliveryModality:'guiada_en_app',
  durationMinutes:35,blocks:[{id:'block-1',type:'running',plannedDurationMinutes:30}],
  revision:1,
});

test('autonomous Client sees canonical publicada/disponible training in guided entry',()=>{
  const select=__applicationInternals.publishedSessionForClient;
  for(const status of ['publicada','disponible','publicado','published']){
    assert.equal(select([session(status)],own)?.title,'Carrera suave',status);
  }
});

test('guided selection rejects approved/draft/cross-client/empty-block sessions',()=>{
  const select=__applicationInternals.publishedSessionForClient;
  for(const status of ['aprobada','aprobado','borrador','validado','retirada']){
    assert.equal(select([session(status)],own),null,status);
  }
  assert.equal(select([session('publicada',other)],own),null);
  assert.equal(select([{...session('publicada'),blocks:[]}],own),null);
});

test('canonical and V43 direct table RLS require publication for Cliente',()=>{
  const sql=readFileSync(new URL(
    '../supabase/migrations/20261013151216_m36_training_publication_rls.sql',
    import.meta.url),'utf8');
  for(const policy of ['domain_entities_v26_select','m26_plans_read_v43','m26_sessions_read_v43']){
    assert.ok(sql.includes('ALTER POLICY '+policy+' ON public.'),policy);
  }
  assert.ok(sql.includes('iberfit_can_access_client_v26(client_id)'));
  assert.ok(sql.includes("iberfit_current_role_v26() <> 'cliente'"));
  assert.ok(sql.includes("entity_type NOT IN ('planning','session','report')"));
  assert.ok(sql.includes("coalesce(lower(body ->> 'visibleToClient')"));
  assert.ok(sql.includes('is_assigned_coach(client_id)'));
  assert.ok(!/\b(?:GRANT|UPDATE|DELETE FROM|TRUNCATE)\b/iu.test(sql),'unexpected privilege/data mutation');
  const compatibility=readFileSync(new URL(
    '../supabase/migrations/20261013152213_m36_v43_status_visibility_compat.sql',
    import.meta.url),'utf8');
  assert.ok(compatibility.includes("status IN ('active','paused','completed')"));
  assert.ok(compatibility.includes("status IN ('confirmed','started','completed')"));
  assert.ok(compatibility.includes("is_assigned_coach(client_id)"));
  assert.ok(!compatibility.includes("status IN ('planned'"),'planned sessions must not be client-visible');
  assert.ok(!/\b(?:GRANT|UPDATE|DELETE FROM|TRUNCATE)\b/iu.test(compatibility),'unexpected V43 privilege/data mutation');
});

test('Coach plan validation deduplicates in-flight submissions before draft loading',()=>{
  const source=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  const start=source.indexOf('let planValidationPending=null;');
  const end=source.indexOf('async function performValidatePlan()',start);
  assert.ok(start>=0&&end>start,'single-flight guard missing');
  const guard=source.slice(start,end);
  assert.ok(guard.includes('if(planValidationPending)return planValidationPending'));
  assert.ok(guard.includes('planValidationPending=operation'));
  assert.ok(guard.includes('planValidationPending===operation)planValidationPending=null'));
  assert.ok(source.slice(end,end+3500).includes("await draftRepository?.load?.(clientId,'planning-cycle')"));
});
