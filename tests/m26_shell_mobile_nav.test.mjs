import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionState} from '../src/m26/production-state.js';
import {createShellViewModel} from '../src/m26/shell/shell-view-model.js';
import {renderM26Shell} from '../src/m26/shell/shell-render.js';

const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';

function readyState(role,{selectedClientId=clientId,activeArea='hoy'}={}){
  const identity=role==='client'
    ? {id:'61227666-d8b4-4d1e-aa08-2405ad2000db',role,clientId,name:'Cliente QA M26'}
    : {id:'2425747b-93aa-44ed-86f3-334919a1f832',role,name:'Coach QA M26'};
  return createProductionState({
    hydration:{status:'ready',error:null,confirmedAt:'2026-07-18T21:00:00Z',serverTime:'2026-07-18T21:00:00Z'},
    identity,
    environment:'PRODUCTION',
    canary:{active:true,scope:'allowlist',version:'M26-SHELL-MOBILE'},
    selectedClientId,
    activeArea,
    collections:{
      ...createProductionState().collections,
      clients:[{id:clientId,name:'Cliente Prueba IBERFIT',modalidad:'Híbrido'}],
    },
  });
}

function mobileOverflow(html){
  const match=String(html).match(/<div class="m26-mobile-more-menu">([\s\S]*?)<\/div><\/details>/u);
  assert.ok(match,'debe renderizar el menú móvil Más');
  return match[1];
}

test('Más indica visual y semánticamente cuando contiene la sección activa',()=>{
  const vm=createShellViewModel(readyState('client',{activeArea:'informes'}));
  const html=renderM26Shell(vm);
  assert.match(html,/<details class="m26-mobile-more is-active" data-m26-more-active="true"><summary aria-current="page">/u);
  assert.match(mobileOverflow(html),/data-m26-area="informes" aria-current="page"/u);
});

test('Más bloquea contexto Coach sin cliente y conserva accesos globales',()=>{
  const vm=createShellViewModel(readyState('coach',{selectedClientId:null,activeArea:'hoy'}));
  const menu=mobileOverflow(renderM26Shell(vm));
  assert.doesNotMatch(menu,/data-m26-area="expediente"/u);
  assert.doesNotMatch(menu,/data-m26-area="iri"/u);
  assert.match(menu,/class="m26-nav-item is-disabled" type="button" disabled aria-disabled="true"/u);
  assert.match(menu,/data-m26-area="biblioteca"/u);
  assert.match(menu,/data-m26-area="ajustes"/u);
});

test('pulido móvil mantiene safe-area y objetivos táctiles en el shell',()=>{
  const vm=createShellViewModel(readyState('client'));
  const html=renderM26Shell(vm);
  assert.match(html,/padding-bottom: max\(\.55rem, env\(safe-area-inset-bottom\)\)/u);
  assert.match(html,/min-height: 3\.25rem; touch-action: manipulation/u);
  assert.match(html,/scroll-padding-bottom: calc\(5rem \+ env\(safe-area-inset-bottom\)\)/u);
});

test('sidebar marca el grupo activo y permanece utilizable en escritorio',()=>{
  const vm=createShellViewModel(readyState('coach',{activeArea:'agenda'}));
  const html=renderM26Shell(vm);
  assert.match(html,/<section class="m26-nav-group is-active-group">[\s\S]*?data-m26-area="agenda" aria-current="page"[\s\S]*?<\/section>/u);
  assert.match(html,/\.m26-sidebar \{ position: sticky; top: 0; height: 100dvh; max-height: 100dvh; overscroll-behavior: contain; \}/u);
});
