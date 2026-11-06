import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSessionExecutionActionBoundary,dispatchSessionAction,
} from '../src/m26/workflows/session-controller.js';

const clientId='client-universal',sessionId='session-universal';
const guided={id:sessionId,clientId,status:'disponible',visibleToClient:true,
  clientVisibilityLevel:'full',deliveryModality:'guiada_en_app',
  deliveryOwnership:'guided_in_app'};
const execution={id:'execution-universal',clientId,sessionId,status:'active',revision:1};
const actor={role:'client',clientId};
const actions=['complete-set','repeat-previous-set','correct-set','add-set',
  'add-group-round','extra-group-round-now','undo-structure-add',
  'extra-set-now','skip-set','skip-exercise','add-live-exercise','previous','next',
  'rest-expired-auto','rest-minus','rest-plus','substitute','pause','resume',
  'cancel','finish'];

test('UNIVERSAL el Cliente nunca altera una sesion presencial de Coach: ni series, pausa, cancelacion o fin',()=>{
  for(const action of actions){
    const supervised={...guided,deliveryModality:'presencial',deliveryOwnership:'coach_led'};
    const current=structuredClone(execution);
    assert.throws(()=>dispatchSessionAction({action,session:supervised,execution:current,actor}),
      /M28_SESSION_COACH_LED_CLIENT_ACTION_FORBIDDEN/u,action);
    assert.deepEqual(current,execution,'no optimistic write on forbidden '+action);
  }
});
test('UNIVERSAL el Cliente no muta una sesion retirada, oculta ni con ownership contradictorio',()=>{
  for(const session of [
    {...guided,status:'retirado'},
    {...guided,visibleToClient:false},
    {...guided,clientVisibilityLevel:'hidden'},
    {...guided,deliveryOwnership:'live_online'},
    {...guided,deliveryModality:'online'},
  ])assert.throws(()=>assertSessionExecutionActionBoundary({
    action:'finish',session,execution,actor,
  }),/M28_SESSION_COACH_LED_CLIENT_ACTION_FORBIDDEN/u);
});
test('UNIVERSAL cada escritura verifica usuario, cliente, sesion y ejecucion, incluso offline',()=>{
  const invalid=[
    {actor:{role:'client',clientId:'different'}},
    {execution:{...execution,clientId:'different'}},
    {execution:{...execution,sessionId:'different'}},
    {session:{...guided,clientId:'different'}},
    {session:{...guided,id:'different'}},
    {execution:{...execution,sessionId:null}},
  ];
  for(const change of invalid){
    assert.throws(()=>assertSessionExecutionActionBoundary({
      action:'pause',session:guided,execution,actor,...change,
    }),/M43_CLIENT_EXECUTION_SCOPE_CONFLICT/u);
  }
});
test('UNIVERSAL Coach puede ejecutar la sesion supervisada; Admin no puede manipular ejecuciones',()=>{
  const supervised={...guided,deliveryModality:'presencial',deliveryOwnership:'coach_led'};
  assert.equal(assertSessionExecutionActionBoundary({action:'pause',session:supervised,
    execution,actor:{role:'coach'}}),true);
  assert.throws(()=>assertSessionExecutionActionBoundary({action:'pause',session:guided,
    execution,actor:{role:'admin'}}),/M26_ADMIN_SESSION_EXECUTION_FORBIDDEN/u);
});
test('UNIVERSAL acciones del constructor y Client autonomo conservan su recorrido legitimo',()=>{
  assert.equal(assertSessionExecutionActionBoundary({action:'publish',actor:{role:'coach'}}),true);
  for(const action of actions)
    assert.equal(assertSessionExecutionActionBoundary({action,session:guided,execution,actor}),true);
});
