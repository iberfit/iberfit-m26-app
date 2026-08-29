import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveM26Runtime,
  M26_QA_PROJECT_REF,
  M26_QA_SUPABASE_ORIGIN,
} from '../src/m26/supabase-transport.js';
import {renderAccessUi} from '../src/m26/app/access-ui.js';

const raw=Object.freeze({
  enabled:true,
  qaOnly:true,
  projectRef:M26_QA_PROJECT_REF,
  url:M26_QA_SUPABASE_ORIGIN,
  publishableKey:'sb_publishable_test_value',
  version:'26.0.0-prelaunch-test',
});

test('RC65 prelaunch keeps Cloudflare Pages previews fail-closed',()=>{
  const runtime=resolveM26Runtime(raw,{hostname:'3891960e.iberfit-m26-canary.pages.dev'});
  assert.equal(runtime.qaOnly,true);
  assert.equal(runtime.canary,false);
  assert.equal(runtime.enabled,false);
});

test('RC65 prelaunch canonical canary remains enabled',()=>{
  const runtime=resolveM26Runtime(raw,{hostname:'m26-canary.iberfit.cl'});
  assert.equal(runtime.qaOnly,true);
  assert.equal(runtime.canary,true);
  assert.equal(runtime.enabled,true);
});

test('RC65 prelaunch preview UI points explicitly to canonical canary',()=>{
  const html=renderAccessUi({
    backendReady:false,
    qaOnly:true,
    host:'3891960e.iberfit-m26-canary.pages.dev',
  });
  assert.match(html,/Este enlace de revisión no admite acceso/u);
  assert.match(html,/href="https:\/\/m26-canary\.iberfit\.cl\/"/u);
  assert.match(html,/Abrir Canary oficial/u);
  assert.doesNotMatch(html,/El acceso no está disponible temporalmente en este sitio/u);
});

test('RC65 prelaunch canonical outage remains a generic fail-closed state',()=>{
  const html=renderAccessUi({
    backendReady:false,
    qaOnly:true,
    host:'m26-canary.iberfit.cl',
  });
  assert.match(html,/El acceso no está disponible temporalmente en este sitio/u);
  assert.doesNotMatch(html,/Abrir Canary oficial/u);
});

test('RC65 prelaunch arbitrary pages.dev host never gets IBERFIT canonical-link exception',()=>{
  const html=renderAccessUi({
    backendReady:false,
    qaOnly:true,
    host:'unrelated-project.pages.dev',
  });
  assert.match(html,/El acceso no está disponible temporalmente en este sitio/u);
  assert.doesNotMatch(html,/Abrir Canary oficial/u);
});
