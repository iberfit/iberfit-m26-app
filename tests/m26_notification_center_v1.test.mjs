import test from 'node:test';
import assert from 'node:assert/strict';

import {buildNotificationCenter} from '../src/m26/communication/notification-center.js';
import {renderCommunicationRoute} from '../src/m26/communication/route-render.js';

function coachItem(overrides={}){
  return {
    clientId:'client-1',
    kind:'critical',
    reason:'Dato clínico que no debe salir en la vista previa',
    detail:'Detalle sensible embarazo medicación lesión',
    actionType:'feedback-review',
    actionTypeLabel:'Feedback por revisar',
    attentionWhy:'Revisión profesional',
    actionCtaLabel:'Revisar feedback',
    nextAction:{area:'planificacion',label:'Revisar feedback'},
    ...overrides,
  };
}

test('ordena Requiere acción > Importante > Informativo sin recalcular el Action Center',()=>{
  const center=buildNotificationCenter({
    role:'coach',
    coachCockpit:{items:[coachItem()]},
    notifications:[
      {id:'n-info',status:'info',createdAt:'2026-09-09T10:00:00Z'},
      {id:'n-important',actionArea:'agenda',status:'warning',createdAt:'2026-09-09T11:00:00Z'},
    ],
  });
  assert.deepEqual(center.items.map((item)=>item.priority),[
    'action-required',
    'important',
    'informational',
  ]);
  assert.equal(center.counts.actionRequired,1);
  assert.equal(center.counts.important,1);
  assert.equal(center.counts.informational,1);
});

test('deduplica avisos persistidos por destino y conserva el estado no leído',()=>{
  const center=buildNotificationCenter({
    role:'coach',
    notifications:[
      {id:'n-1',actionArea:'expediente',actionEntityId:'client-7',readAt:'2026-09-09T09:00:00Z'},
      {id:'n-2',actionArea:'expediente',actionEntityId:'client-7',createdAt:'2026-09-09T10:00:00Z'},
    ],
  });
  assert.equal(center.items.length,1);
  assert.equal(center.items[0].count,2);
  assert.equal(center.items[0].unread,true);
  assert.deepEqual(new Set(center.items[0].sourceIds),new Set(['n-1','n-2']));
});

test('no expone title/body persistidos ni detalle sensible del Action Center',()=>{
  const center=buildNotificationCenter({
    role:'coach',
    coachCockpit:{items:[coachItem()]},
    notifications:[{
      id:'private-1',
      title:'Resultado médico confidencial',
      body:'embarazo medicación lesión diagnóstico privado',
      actionArea:'progreso',
      actionEntityId:'client-1',
    }],
  });
  const serialized=JSON.stringify(center).toLowerCase();
  for(const forbidden of ['resultado médico confidencial','embarazo','medicación','lesión','diagnóstico privado','dato clínico']){
    assert.equal(serialized.includes(forbidden),false,forbidden);
  }
});

test('aplica separación por rol y sólo conserva deep-links permitidos',()=>{
  const client=buildNotificationCenter({
    role:'client',
    coachCockpit:{items:[coachItem()]},
    notifications:[
      {id:'forbidden',actionArea:'clientes',actionEntityId:'client-1'},
      {id:'allowed',actionArea:'progreso',actionEntityId:'client-1'},
    ],
  });
  assert.equal(client.items.some((item)=>item.source==='action-center'),false);
  const allowed=client.items.find((item)=>item.sourceId==='allowed');
  const forbidden=client.items.find((item)=>item.sourceId==='forbidden');
  assert.deepEqual(allowed.action,{type:'area',area:'progreso',entityId:null,label:'Abrir actualización'});
  assert.equal(forbidden.action,null);

  const coach=buildNotificationCenter({role:'coach',coachCockpit:{items:[coachItem()]}});
  assert.deepEqual(coach.items[0].action,{
    type:'coach-client',
    area:'planificacion',
    entityId:'client-1',
    label:'Revisar feedback',
  });
});

test('ofrece empty state específico sin inventar actividad',()=>{
  const coach=buildNotificationCenter({role:'coach'});
  const client=buildNotificationCenter({role:'client'});
  assert.equal(coach.items.length,0);
  assert.equal(coach.emptyTitle,'Todo al día');
  assert.equal(client.emptyTitle,'Sin avisos pendientes');
});

test('renderiza centro accesible, acción exacta y lectura persistida sin texto sensible',()=>{
  const html=renderCommunicationRoute({
    communication:true,
    kind:'communication',
    role:'coach',
    canOpenThread:false,
    clients:[],
    threads:[],
    coachCockpit:{items:[coachItem()]},
    notifications:[{
      id:'n-private',
      title:'Diagnóstico privado',
      body:'Detalle embarazo lesión',
      actionArea:'agenda',
    }],
  });
  assert.match(html,/id="m26-notification-center-title"/);
  assert.match(html,/Requiere acción/);
  assert.match(html,/Importante/);
  assert.match(html,/data-m26-coach-action="true"/);
  assert.match(html,/data-m26-target-area="planificacion"/);
  assert.match(html,/data-communication-form="notification-read"/);
  assert.doesNotMatch(html,/Diagnóstico privado|embarazo|lesión/i);
});
