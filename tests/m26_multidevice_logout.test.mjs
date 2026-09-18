import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createM26Transport,
  M26_QA_PROJECT_REF,
  M26_QA_SUPABASE_ORIGIN,
} from '../src/m26/supabase-transport.js';

function createTransportProbe(){
  const calls=[];
  const transport=createM26Transport({
    enabled:true,
    projectRef:M26_QA_PROJECT_REF,
    url:M26_QA_SUPABASE_ORIGIN,
    publishableKey:'sb_publishable_multidevice_test',
    qaOnly:true,
    timeoutMs:1_000,
  },{
    fetchImpl:async(url,options={})=>{
      calls.push({url:String(url),method:String(options.method||'GET')});
      return new Response(null,{status:204,headers:{'content-type':'application/json'}});
    },
  });
  return {transport,calls};
}

test('transport logout is local by default and global revocation requires an explicit scope',async()=>{
  const {transport,calls}=createTransportProbe();

  const local=await transport.logout('access-token');
  assert.equal(local.scope,'local');
  assert.equal(calls[0].url,M26_QA_SUPABASE_ORIGIN+'/auth/v1/logout?scope=local');

  const global=await transport.logout('access-token',{scope:'global'});
  assert.equal(global.scope,'global');
  assert.equal(calls[1].url,M26_QA_SUPABASE_ORIGIN+'/auth/v1/logout?scope=global');

  const others=await transport.logout('access-token',{scope:'others'});
  assert.equal(others.scope,'others');
  assert.equal(calls[2].url,M26_QA_SUPABASE_ORIGIN+'/auth/v1/logout?scope=others');

  await assert.rejects(
    ()=>transport.logout('access-token',{scope:'unexpected'}),
    /M26_LOGOUT_SCOPE_INVALID/u,
  );
  assert.equal(calls.length,3);
});

test('application normal and clear-device logout are local while all-device revocation is explicit',()=>{
  const app=fs.readFileSync('src/m26/app/application.js','utf8');

  assert.match(
    app,
    /function finishLogout\\(\\{token,scope='local',message='',noticeKind='status'\\}=\\{\\}\\)/u,
  );
  assert.match(app,/function onLogout\\(\\)\\{const token=currentToken\\(\\);finishLogout\\(\\{token,scope:'local'\\}\\);\\}/u);

  const clearStart=app.indexOf('async function onLogoutAndClearDevice(){');
  const clearEnd=app.indexOf('  function destroyControllers()',clearStart);
  assert.ok(clearStart>=0&&clearEnd>clearStart);
  const clearBlock=app.slice(clearStart,clearEnd);
  assert.match(clearBlock,/scope:'local'/u);
  assert.doesNotMatch(clearBlock,/scope:'global'/u);

  const globalStart=app.indexOf('function onLogoutAllSessions(){');
  const globalEnd=app.indexOf('async function onLogoutAndClearDevice(){',globalStart);
  assert.ok(globalStart>=0&&globalEnd>globalStart);
  const globalBlock=app.slice(globalStart,globalEnd);
  assert.match(globalBlock,/globalThis\\.confirm/u);
  assert.match(globalBlock,/scope:'global'/u);
  assert.match(globalBlock,/if\\(!accepted\\)return false/u);

  assert.match(app,/addEventListener\\('m26:logout-all-sessions',onLogoutAllSessions\\)/u);
  assert.match(app,/removeEventListener\\('m26:logout-all-sessions',onLogoutAllSessions\\)/u);
});

test('settings and shell expose global revocation only as a distinct explicit action',()=>{
  const route=fs.readFileSync('src/m26/modules/route-render.js','utf8');
  const shell=fs.readFileSync('src/m26/shell/shell-controller.js','utf8');
  const sidebar=fs.readFileSync('src/m26/shell/shell-render.js','utf8');

  assert.match(route,/Cerrar sesión en este dispositivo/u);
  assert.match(route,/data-m26-action="logout-all-sessions"/u);
  assert.match(route,/Revocar sesiones en todos los dispositivos/u);
  assert.match(route,/requiere confirmación explícita/u);

  assert.match(
    shell,
    /if\\(action==='logout-all-sessions'\\)\\{\\s*root\\.dispatchEvent\\(new CustomEvent\\('m26:logout-all-sessions'/u,
  );

  const sidebarLogout=(sidebar.match(/data-m26-action="logout"/gu)||[]).length;
  assert.ok(sidebarLogout>=1);
  assert.doesNotMatch(sidebar,/data-m26-action="logout-all-sessions"/u);
});
