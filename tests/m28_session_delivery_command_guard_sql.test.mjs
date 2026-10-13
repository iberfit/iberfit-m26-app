import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../supabase/migrations/20261013034500_m28_session_delivery_command_guard_v1.sql',import.meta.url),'utf8');
test('server authorization validates role, canonical session, appointment, ownership and visibility',()=>{
 for(const fragment of ['SESION_INICIAR','SESION_PUBLICAR','iberfit_base_entity_v26','deliveryModality',
   'deliveryOwnership','clientVisibilityLevel','iberfit_can_access_client_v26',
   'M28_COACH_LED_CLIENT_START_FORBIDDEN','M28_SESSION_DELIVERY_INCONSISTENT',
   'SECURITY INVOKER','REVOKE ALL'])assert.ok(sql.includes(fragment),fragment);
 assert.match(sql,/v_modality <> 'guiada_en_app'/u);
 assert.match(sql,/v_ownership NOT IN \('guided_in_app','client_autonomous'\)/u);
 assert.match(sql,/v_visibility <> 'full'/u);
});
test('server preserves canonical receipts, service checks and preflight/execute delegation',()=>{
 assert.match(sql,/from public\.command_receipts_v26/u);
 assert.match(sql,/private\.iberfit_training_command_guard_v1\(p_command\)/u);
 assert.match(sql,/public\.iberfit_command_preflight_v26_pre_training_service_guard_v1\(p_command\)/u);
 assert.match(sql,/public\.iberfit_execute_command_v26_pre_training_service_guard_v1\(p_command\)/u);
 assert.equal((sql.match(/private\.iberfit_session_delivery_guard_m28\(p_command\)/gu)||[]).length,2);
 const executor=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.iberfit_execute_command_v26('));
 const replay=executor.indexOf('from public.command_receipts_v26');
 const service=executor.indexOf('v_guard := private.iberfit_training_command_guard_v1(p_command)');
 const delivery=executor.indexOf('v_delivery_guard := private.iberfit_session_delivery_guard_m28(p_command)');
 const canonical=executor.lastIndexOf('return public.iberfit_execute_command_v26_pre_training_service_guard_v1(p_command)');
 assert.ok(replay>0&&service>replay&&delivery>service&&canonical>delivery);
 assert.match(executor.slice(replay,service),/return public\.iberfit_execute_command_v26_pre_training_service_guard_v1\(p_command\)/u);
 assert.doesNotMatch(sql,/delete from public\.domain_entities_v26|truncate public\./iu);
});


test('M28 V2 drift repair guards fresh writes and keeps original receipts canonical',()=>{
 const v2=fs.readFileSync(new URL('../supabase/migrations/20261013060000_m28_session_delivery_fresh_write_guard_v2.sql',import.meta.url),'utf8');
 const replay=v2.indexOf('from public.command_receipts_v26');
 const service=v2.indexOf('v_guard := private.iberfit_training_command_guard_v1(p_command)');
 const delivery=v2.indexOf('v_delivery_guard := private.iberfit_session_delivery_guard_m28(p_command)');
 const canonical=v2.lastIndexOf('return public.iberfit_execute_command_v26_pre_training_service_guard_v1(p_command)');
 assert.ok(replay>0 && service>replay && delivery>service && canonical>delivery);
 assert.match(v2.slice(replay,service),/return public\.iberfit_execute_command_v26_pre_training_service_guard_v1\(p_command\)/u);
 assert.equal((v2.match(/private\.iberfit_session_delivery_guard_m28\(p_command\)/gu)||[]).length,1);
 assert.doesNotMatch(v2,/delete from|update public\.domain_entities_v26|truncate public\./iu);
});
