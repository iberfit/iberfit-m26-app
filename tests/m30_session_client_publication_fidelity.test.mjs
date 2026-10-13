import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCollectionsForRole,assertClientProjectionSafe} from '../src/m26/security/role-projection.js';
import {clientContentView} from '../src/m26/publication/client-content.js';

const client={id:'u1',role:'client',clientId:'c1'};
const exercise={id:'b1',type:'exercise',name:'Sentadilla',sets:3,reps:'10',restSeconds:90};
const session=(extra={})=>({id:'s1',clientId:'c1',title:'Fuerza',status:'publicado',visibleToClient:true,blocks:[exercise],...extra});
const project=(item)=>projectCollectionsForRole({sessions:[item]},client).sessions[0];

test('M30: publicación presencial antigua no transmite bloques aunque no tenga clientVisibilityLevel',()=>{
  const projected=project(session({execution_type:'presencial'}));
  assert.equal(projected.deliveryModality,'presencial');
  assert.equal(projected.clientVisibilityLevel,'summary_only');
  assert.deepEqual(projected.blocks,[]);
  const view=clientContentView('session',projected);
  assert.equal(view.sections.length,0);
  assert.match(view.summary,/dirige tu Coach/);
  assert.doesNotMatch(JSON.stringify(view),/Sentadilla/);
  assertClientProjectionSafe({sessions:[projected]},client);
});

test('M30: el modo presencial prevalece sobre visibilidad full y ownership autónomo contradictorios',()=>{
  const projected=project(session({deliveryModality:'presencial',clientVisibilityLevel:'full',deliveryOwnership:'client_autonomous'}));
  assert.equal(projected.clientVisibilityLevel,'summary_only');
  assert.deepEqual(projected.blocks,[]);
  assert.equal(clientContentView('session',projected).sections.length,0);
});

test('M30: ownership coach-led sin modalidad también protege el detalle',()=>{
  const projected=project(session({deliveryOwnership:'coach_led',clientVisibilityLevel:'full'}));
  assert.equal(projected.clientVisibilityLevel,'summary_only');
  assert.deepEqual(projected.blocks,[]);
});

test('M30: sesión autónoma publicada conserva el contenido permitido sin inventar descansos',()=>{
  const grouped={id:'g1',type:'biserie',rounds:3,exerciseIds:['ex-a','ex-b']};
  const projected=project(session({deliveryModality:'guiada_en_app',clientVisibilityLevel:'full',blocks:[
    {id:'solo',type:'exercise',name:'Plancha',sets:2,reps:'30 s'},
    grouped,
  ],internalNotes:'No debe llegar al Cliente'}));
  assert.equal(projected.clientVisibilityLevel,'full');
  assert.equal(projected.blocks[1].rounds,3);
  assert.deepEqual(projected.blocks[1].exerciseIds,['ex-a','ex-b']);
  assert.equal(Object.hasOwn(projected,'internalNotes'),false);
  const view=clientContentView('session',projected);
  const details=view.sections[0].items;
  assert.equal(details.length,2);
  assert.equal(details[0].title,'Plancha');
  assert.doesNotMatch(details[0].detail,/0 s de descanso/);
  assert.equal(details[1].title,'Biserie · 2 ejercicios');
  assert.match(details[1].detail,/3 rondas/);
});

test('M30: vista previa de publicación Coach conserva detalles guiados pero oculta supervisados',()=>{
  const approved=session({status:'aprobado',visibleToClient:false,deliveryModality:'guiada_en_app'});
  assert.equal(clientContentView('session',approved).sections.length,0);
  assert.equal(clientContentView('session',approved,{previewForPublication:true}).sections.length,1);
  const supervised={...approved,deliveryModality:'presencial',clientVisibilityLevel:'full'};
  assert.equal(clientContentView('session',supervised,{previewForPublication:true}).sections.length,0);
});

test('M30: retirada u ocultación impide reexponer detalle desde la proyección',()=>{
  const records=[session({status:'retirado'}),session({visibleToClient:false}),session({clientVisibilityLevel:'hidden'})];
  const projected=projectCollectionsForRole({sessions:records},client);
  assert.equal(projected.sessions.length,0);
  assert.throws(()=>assertClientProjectionSafe({sessions:[session({clientVisibilityLevel:'hidden'})]},client),/M26_CLIENT_HIDDEN_SESSION_EXPOSED/);
  assert.equal(clientContentView('session',records[2]).sections.length,0);
});
