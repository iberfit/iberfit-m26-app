import test from 'node:test';
import assert from 'node:assert/strict';
import {createExecution} from '../src/m26/workflows/session-execution.js';
import {createSessionController} from '../src/m26/workflows/session-controller.js';
import {createActionState} from '../src/m26/ui/action-state.js';

const clientId='10000000-0000-4000-8000-000000000271';
const session={
  id:'10000000-0000-4000-8000-000000000272',clientId,title:'Carrera',status:'disponible',
  visibleToClient:true,deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
  clientVisibilityLevel:'full',durationMinutes:45,
  blocks:[{id:'run-block',type:'exercise',exerciseId:'IBF-CARRERA-SUAVE',sets:1,
    restSeconds:0,targetRpe:5,targetRir:0,plannedDurationMinutes:48}],
};
function fixture({throwPersist=true,remoteAck=true}={}){
  const handlers=new Map(),calls=[],errors=[];
  const button={disabled:false,
    attrs:new Map([['data-session-action','start']]),
    getAttribute(name){return this.attrs.get(name)||null;},
    setAttribute(name,val){this.attrs.set(name,val);},
    removeAttribute(name){this.attrs.delete(name);},
  };
  const root={
    addEventListener(name,fn,capture){handlers.set(name+(capture?'!':''),fn);},
    removeEventListener(){},
    querySelectorAll(){return [];},
    querySelector(){return null;},
  };
  const event={target:{closest(selector){return selector==='[data-session-action]'?button:null;}},preventDefault(){}};
  const execution=createExecution({session,clientId});
  const state=createActionState();
  const bus={execute:async(cmd)=>{
    calls.push(cmd);
    return remoteAck
      ?{ok:true,kind:'ack',command:{operationId:'op-start'},response:{executionRevision:1,remoteRevision:3}}
      :{ok:false,kind:'rejected',command:{operationId:'op-start'},response:{reason:'REVISION_MISMATCH'}};
  }};
  const recovery={
    persist:async()=>{if(throwPersist)throw new Error('local quota error');},
    settle:async()=>{},
    synchronize:async()=>{},
  };
  const context={execution,session,actionState:state,actor:{role:'client',clientId,id:'client-user'},
    commandBus:bus,recoveryCoordinator:recovery,catalog:{get(){return null;}},
    online:true,sessionRevision:2,appointmentId:null};
  const inert={addEventListener(){},removeEventListener(){}};
  const controller=createSessionController({root,getContext:()=>context,render(){},onError:e=>errors.push(e),
    liveTelemetryController:{start(){},pause(){},resume(){},stop(){}},
    lifecycleTarget:inert,visibilityTarget:{...inert,visibilityState:'visible'},
    clockTarget:{setInterval:()=>1,clearInterval(){}},
  });
  return {controller,handlers,calls,errors,state,execution,event,button};
}
test('M42 real Client start button sends one authorized remote command despite local recovery quota error',async()=>{
  const f=fixture();
  f.controller.mount();
  const click=f.handlers.get('click');
  assert.equal(typeof click,'function');
  await click(f.event);
  assert.equal(f.calls.length,1,'no local checkpoint may block authorized remote start');
  assert.equal(f.calls[0].type,'SESION_INICIAR');
  assert.equal(f.calls[0].baseRevision,2);
  assert.equal(f.execution.status,'active');
  assert.equal(f.execution.events.filter(x=>x.type==='SESSION_STARTED').length,1);
  assert.match(f.state.message,/iniciado y confirmado/i,'post-ACK local quota error is a warning');
  await click(f.event);
  assert.equal(f.calls.length,1,'double tap or repeated tap never repeats a started workout');
  f.controller.destroy();
});
test('M42 rejected remote start is not treated as success or locally active',async()=>{
  const f=fixture({throwPersist:false,remoteAck:false});
  f.controller.mount();
  await f.handlers.get('click')(f.event);
  assert.equal(f.calls.length,1);
  assert.equal(f.execution.status,'ready');
  assert.equal(f.execution.events.length,0);
  assert.match(f.state.message,/última revisión/i);
  f.controller.destroy();
});
