import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildStartExecutionCommand} from '../src/m26/workflows/session-execution.js';
import {actorCanExecuteSession,clientSessionProjection,sessionRequiresConfirmedAppointment} from '../src/m26/rc39/session-policy.js';

const clientId='10000000-0000-4000-8000-000000000001';
const sessionId='20000000-0000-4000-8000-000000000002';
const executionId='30000000-0000-4000-8000-000000000003';
const running={id:sessionId,clientId,status:'disponible',title:'Carrera IBERFIT',deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',clientVisibilityLevel:'full',visibleToClient:true,
  blocks:[{id:'40000000-0000-4000-8000-000000000004',type:'exercise',exerciseId:'IBF-CARRERA-SUAVE',sets:1,plannedDistanceKm:5,plannedDurationMinutes:30}]};
const presencial={...running,deliveryModality:'presencial',deliveryOwnership:'coach_led',clientVisibilityLevel:'summary_only'};
const execution={id:executionId,sessionId,clientId,status:'ready',revision:0};

test('guided Client can start without an appointment, only after publishing and enabling',()=>{
  assert.equal(actorCanExecuteSession({role:'client',session:running}),true);
  assert.equal(sessionRequiresConfirmedAppointment({role:'client',session:running}),false);
  assert.equal(clientSessionProjection(running).canClientStart,true);
  const cmd=buildStartExecutionCommand(execution,{sessionRevision:2});
  assert.equal(cmd.type,'SESION_INICIAR');
  assert.equal(cmd.baseRevision,2);
  assert.equal(cmd.clientId,clientId);
  assert.equal(cmd.entityId,sessionId);
  assert.equal(cmd.payload.executionId,executionId);
  assert.equal(Object.hasOwn(cmd.payload,'appointmentId'),false);
  assert.equal(Object.hasOwn(cmd.payload,'deliveryModality'),false);
});

test('Coach-led presencial still requires its confirmed appointment',()=>{
  assert.equal(actorCanExecuteSession({role:'client',session:presencial}),false);
  assert.equal(sessionRequiresConfirmedAppointment({role:'coach',session:presencial}),true);
  assert.equal(sessionRequiresConfirmedAppointment({role:'client',session:presencial}),true);
  const appointmentId='50000000-0000-4000-8000-000000000005';
  assert.equal(buildStartExecutionCommand(execution,{appointmentId}).payload.appointmentId,appointmentId);
  assert.throws(()=>buildStartExecutionCommand({...execution,sessionId:null}),/M26_EXECUTION_START_CONTEXT_REQUIRED/);
  assert.throws(()=>buildStartExecutionCommand({...execution,clientId:null}),/M26_EXECUTION_START_CONTEXT_REQUIRED/);
});

test('Client remains barred from premature, hidden and contradictory sessions',()=>{
  for(const status of ['borrador','aprobada','validado']){
    assert.equal(actorCanExecuteSession({role:'client',session:{...running,status}}),false);
  }
  assert.equal(actorCanExecuteSession({role:'client',session:{...running,visibleToClient:false}}),false);
  assert.equal(actorCanExecuteSession({role:'client',session:{...running,deliveryModality:'presencial'}}),false);
  assert.equal(actorCanExecuteSession({role:'admin',session:running}),false);
});

test('M37 server migration guards publication, scope, state, replays and active lock',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261013165000_m37_guided_autonomous_atomic_lifecycle.sql',import.meta.url),'utf8');
 for(const marker of [
   'M37_RC29_SOURCE_DRIFT','M37_START_ANCHOR_DRIFT','M37_APPOINTMENT_ANCHOR_DRIFT',
   'M37_PUBLISH_ANCHOR_DRIFT','v_status=\'disponible\'',
   'v_body->>\'deliveryModality\'=\'guiada_en_app\'',
   'v_body->>\'deliveryOwnership\'',
   'v_body->>\'clientVisibilityLevel\'=\'full\'',
   'v_body->>\'visibleToClient\'=\'true\'',
   'active_execution_client:','M37_PRESCRIPTION_INCOMPLETE',
   'M37_LEGACY_ID_SCOPE_CONFLICT','M37_GUIDED_ENABLE_NOT_AUTHORIZED',
   "'related_applied','publicada','disponible'",
   'perform public.iberfit_persist_entity_v26(\'session\'',
   'EXECUTE edited;'
 ])assert.ok(sql.includes(marker),marker);
 assert.ok(!sql.includes('DROP TABLE'));
 assert.ok(!sql.includes('GRANT EXECUTE'));
});
