import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceAccessUi,renderAccessUi} from '../src/m26/app/access-ui.js';

function createToggleHarness(){
  const listeners=new Map();
  let listenerCount=0;
  const input={
    type:'password',
    focusCalls:0,
    focus(){this.focusCalls+=1;},
  };
  const toggle={
    dataset:{},
    textContent:'Mostrar',
    attributes:new Map([
      ['aria-controls','m26-new-password'],
      ['aria-pressed','false'],
      ['aria-label','Mostrar contraseña'],
    ]),
    addEventListener(type,listener){
      listeners.set(type,listener);
      listenerCount+=1;
    },
    getAttribute(name){return this.attributes.get(name)||null;},
    setAttribute(name,value){this.attributes.set(name,String(value));},
  };
  const root={
    querySelectorAll(selector){
      if(selector==='[data-password-toggle]')return [toggle];
      if(selector==='[data-auth-action="mfa-register-device"]')return [];
      return [];
    },
    querySelector(selector){
      if(selector==='#m26-new-password')return input;
      if(selector==='[data-auth-form="login"]')return null;
      return null;
    },
  };
  return {root,input,toggle,listeners,getListenerCount:()=>listenerCount};
}

test('mostrar contraseña funciona también en reset y no duplica listeners',()=>{
  const harness=createToggleHarness();

  assert.equal(enhanceAccessUi(harness.root),true);
  assert.equal(harness.getListenerCount(),1);
  assert.equal(harness.toggle.dataset.iberfitPasswordToggleEnhanced,'true');

  harness.listeners.get('click')();
  assert.equal(harness.input.type,'text');
  assert.equal(harness.toggle.textContent,'Ocultar');
  assert.equal(harness.toggle.getAttribute('aria-pressed'),'true');
  assert.equal(harness.toggle.getAttribute('aria-label'),'Ocultar contraseña');
  assert.equal(harness.input.focusCalls,1);

  assert.equal(enhanceAccessUi(harness.root),false);
  assert.equal(harness.getListenerCount(),1);

  harness.listeners.get('click')();
  assert.equal(harness.input.type,'password');
  assert.equal(harness.toggle.textContent,'Mostrar');
  assert.equal(harness.toggle.getAttribute('aria-pressed'),'false');
  assert.equal(harness.toggle.getAttribute('aria-label'),'Mostrar contraseña');
});

test('reset mantiene ambos campos, requisitos, progreso y salida al login',()=>{
  const html=renderAccessUi({mode:'update-password',backendReady:true,host:'app.iberfit.cl'});

  assert.match(html,/data-auth-mode="update-password"/u);
  assert.match(html,/aria-label="Recuperación de acceso"/u);
  assert.equal((html.match(/class="m26-auth-flow-step is-complete"/gu)||[]).length,2);
  assert.equal((html.match(/data-password-toggle/gu)||[]).length,2);
  assert.match(html,/aria-describedby="m26-password-requirements"/u);
  assert.match(html,/data-auth-action="back-to-login"/u);
});
