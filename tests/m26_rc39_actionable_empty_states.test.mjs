import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';

function emptyVm(kind,role='client'){
  return {
    kind,
    role,
    selectedClient:{id:'client-1',name:'Cliente IBERFIT',modality:'hibrido'},
    rc39:{
      role,
      planningItems:[],
      sessionProjections:[],
      appointments:[],
    },
  };
}

test('Sesiones vacías del Cliente ofrecen continuidad útil sin inventar un entrenamiento',()=>{
  const html=renderRc39Route(emptyVm('sesion'));
  assert.match(html,/Sin sesiones/);
  assert.match(html,/data-m26-area="planificacion"[^>]*>Revisar mi planificación</);
  assert.match(html,/data-m26-area="actividad"[^>]*>Registrar cómo estoy</);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/);
  assert.doesNotMatch(html,/data-session-primary-start/);
});

test('Planificación pendiente conserva el estado real y ofrece acciones válidas mientras el Coach publica',()=>{
  const html=renderRc39Route(emptyVm('planificacion'));
  assert.match(html,/Tu semana aún no está publicada/);
  assert.match(html,/Planificación pendiente/);
  assert.match(html,/data-m26-area="actividad"[^>]*>Registrar cómo estoy</);
  assert.match(html,/data-m26-area="progreso"[^>]*>Ver mi evolución</);
  assert.doesNotMatch(html,/start-published-session/);
});

test('Coach conserva su CTA operativo y no recibe acciones de continuidad del Cliente',()=>{
  const html=renderRc39Route(emptyVm('sesion','coach'));
  assert.match(html,/data-workflow-action="open-session-builder">Crear sesión</);
  assert.match(html,/Sin sesiones/);
  assert.doesNotMatch(html,/Revisar mi planificación/);
  assert.doesNotMatch(html,/Registrar cómo estoy/);
});
