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
 assert.doesNotMatch(sql,/delete from public\.domain_entities_v26|truncate public\./iu);
});
