import test from 'node:test';
import assert from 'node:assert/strict';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';
const vm={role:'client',serviceKind:'training',clients:[{id:'synthetic',name:'Cliente <QA>',serviceActive:true}],appointments:[],upcoming:[],operations:{}};
test('session decision moves below greeting and keeps the real authorized start command',()=>{
  const html=renderHoyRoute({...vm,rc39:{sessionProjections:[{id:'session-qa',visible:true,canClientStart:true,session:{title:'Fuerza <QA>'}}]}});
  const zone=html.indexOf('class="m26-client-home-primary-zone"');
  assert.ok(html.indexOf('class="m26-client-home-status"')>zone);
  assert.match(html,/Fuerza &lt;QA&gt;/);
  assert.match(html,/data-workflow-action="start-published-session" data-entity-id="session-qa"/);
  assert.equal((html.match(/class="m26-today-action is-primary"/g)||[]).length,1);
});
test('read-only, paused and IRI-only states never gain session execution from visual adaptation',()=>{
  for(const state of [
    {...vm,rc39:{sessionProjections:[{id:'readonly',visible:true,canClientStart:false,session:{title:'Consulta'}}]}},
    {...vm,clients:[{...vm.clients[0],serviceActive:false}]},
    {...vm,serviceKind:'iri'},
  ])assert.doesNotMatch(renderHoyRoute(state),/data-workflow-action="start-published-session"/);
});
