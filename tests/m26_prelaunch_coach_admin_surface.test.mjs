import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {navigationForRole, areaDefinition, canonicalArea, areaAllowedForRole} from '../src/m26/shell/navigation.js';

const read=(path)=>fs.readFileSync(path,'utf8');

test('prelaunch Coach presents verification capability as product synchronization',()=>{
  const nav=navigationForRole('coach');
  const sync=nav.tools.find((item)=>item.key==='verificacion');
  assert.ok(sync);
  assert.equal(sync.label,'Sincronización');
  assert.equal(sync.title,'Estado de cambios');
  assert.equal(areaAllowedForRole('verificacion','coach'),true);
  assert.equal(areaAllowedForRole('verificacion','client'),false);
  assert.equal(canonicalArea('qa'),'verificacion');
});

test('prelaunch synchronization route keeps manual recovery but removes technical visible title',()=>{
  const route=read('src/m26/modules/route-render.js');
  assert.ok(route.includes('<p class="m26-eyebrow">Sincronización</p><h2>Estado de cambios</h2>'));
  assert.ok(!route.includes('<h2>Centro de verificación</h2>'));
  assert.ok(route.includes('data-verification-action="refresh"'));
  assert.match(route,/Actualizar estado local/u);
  assert.match(route,/Estado local no comprobado/u);
});

test('prelaunch Admin automation remains a real bounded capability',()=>{
  const nav=read('src/m26/admin/navigation.js');
  const catalog=read('src/m26/admin/command-catalog.js');
  const controller=read('src/m26/admin/controller.js');
  const state=read('src/m26/admin/admin-state.js');
  const renderer=read('src/m26/admin/route-render.js');
  assert.match(nav,/admin-automatizaciones/u);
  assert.match(catalog,/ADMIN_AUTOMATIZACION_GUARDAR/u);
  assert.match(controller,/kind==='automation-save'/u);
  assert.match(state,/automationRules/u);
  assert.match(renderer,/Automatiza tareas, nunca decisiones profesionales\./u);
  assert.match(renderer,/actionType/u);
  assert.doesNotMatch(renderer,/ajustar automáticamente la carga|prescripción automática/u);
});

test('prelaunch Admin next actions remain inside admin route namespace',async()=>{
  const {deriveClientExperience,experienceNextAction}=await import('../src/m26/experience/client-experience.js');
  for(const summary of [{},{profile:{completeness:100}},{profile:{completeness:100},iri:{status:'confirmada'}},{profile:{completeness:100},iri:{status:'confirmada'},cycle:{id:'c1'}},{profile:{completeness:100},iri:{status:'confirmada'},cycle:{id:'c1'},nextAppointment:{id:'a1'}}]){
    const experience=deriveClientExperience(summary);
    const action=experienceNextAction(experience,{role:'admin'});
    assert.match(action.area,/^admin-/u);
    assert.equal(areaDefinition(action.area)?.roles?.includes('admin'),true);
  }
});
