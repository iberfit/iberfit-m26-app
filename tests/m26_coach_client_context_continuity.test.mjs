import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const routeVm=read('src/m26/modules/route-view-model.js');
const routeRender=read('src/m26/modules/route-render.js');
const application=read('src/m26/app/application.js');
const sessionUi=read('src/m26/workflows/session-ui.js');
const roleCss=read('src/m26/design/role-surfaces.css');

test('Coach client context is derived from the selected visible client and remains professional-only',()=>{
  assert.match(routeVm,/function professionalClientContext\(state,clientId\)/u);
  assert.match(routeVm,/const client=clientRecord\(state,clientId\)/u);
  assert.match(routeVm,/clientContext:\['admin','coach'\]\.includes\(role\)\?professionalClientContext\(state,clientId\):null/u);
  assert.doesNotMatch(routeVm,/clientContext:\['client'/u);
});

test('Planning and sessions identify the active client and keep one canonical route path',()=>{
  assert.match(routeRender,/function professionalClientContextBar\(clientContext,\{activeArea=''\}=\{\}\)/u);
  assert.match(routeRender,/Trabajando con/u);
  assert.match(routeRender,/\['expediente','Expediente'\]/u);
  assert.match(routeRender,/\['planificacion','Planificación'\]/u);
  assert.match(routeRender,/\['sesion','Sesiones'\]/u);
  assert.match(routeRender,/\['progreso','Progreso'\]/u);
  assert.match(routeRender,/aria-current="page"/u);
  assert.match(routeRender,/professionalClientContextBar\(vm\.clientContext,\{activeArea:'planificacion'\}\)/u);
  assert.match(routeRender,/professionalClientContextBar\(vm\.clientContext,\{activeArea:'sesion'\}\)/u);
});

test('Session workspace client identity comes from its own draft or execution scope',()=>{
  assert.match(application,/sessionUi\?\.draft\?\.clientId\|\|[\s\S]*sessionUi\?\.execution\?\.clientId\|\|[\s\S]*sessionUi\?\.session\?\.clientId/u);
  assert.match(application,/\.find\(\(item\)=>String\(item\?\.id\|\|''\)\.trim\(\)===memoryClientId\)/u);
  assert.match(application,/clientContext:sessionClientContext/u);
  const builderPasses=(application.match(/clientContext:sessionClientContext/g)||[]).length;
  assert.equal(builderPasses,2,'builder and live execution must receive the scoped client context');
});

test('Builder and live execution show professional client identity without adding unsafe route navigation',()=>{
  assert.match(sessionUi,/function renderProfessionalSessionClientContext\(clientContext,role\)/u);
  assert.match(sessionUi,/!\['coach','admin'\]\.includes\(normalizedRole\)/u);
  assert.match(sessionUi,/class="m26-session-client-context"/u);
  assert.match(sessionUi,/renderProfessionalSessionClientContext\(clientContext,role\)/u);
  assert.match(sessionUi,/professionalClientContext=renderProfessionalSessionClientContext\(clientContext,role\)/u);
  assert.doesNotMatch(sessionUi,/m26-session-client-context[^]*data-m26-area=/u);
});

test('Active client context remains touch-safe and responsive',()=>{
  assert.match(roleCss,/\.m26-professional-client-context-nav button\{[\s\S]*min-height:44px/u);
  assert.match(roleCss,/@media\(max-width:760px\)[\s\S]*\.m26-professional-client-context-nav/u);
  assert.match(roleCss,/@media\(max-width:520px\)[\s\S]*\.m26-session-client-context/u);
  assert.match(roleCss,/@media\(forced-colors:active\)[\s\S]*\.m26-professional-client-context/u);
});
