import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductionState} from '../src/m26/production-state.js';
import {createShellViewModel} from '../src/m26/shell/shell-view-model.js';
import {renderM26Shell} from '../src/m26/shell/shell-render.js';
import {
  bindCoachCommandPaletteSupport,
  coachCommandItems,
  closeCoachCommandPalette,
  openCoachCommandPalette,
  shouldOpenCoachCommandShortcut,
} from '../src/m26/rc39/shell-enhancer.js';

const clientA='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const clientB='7cd43573-448b-4d07-b1bc-b61486648170';

function coachState({selectedClientId=null}={}){
  return createProductionState({
    hydration:{status:'ready',error:null,confirmedAt:'2026-09-09T12:00:00Z',serverTime:'2026-09-09T12:00:00Z'},
    identity:{id:'2425747b-93aa-44ed-86f3-334919a1f832',role:'coach',name:'Coach QA M26'},
    environment:'PRODUCTION',
    canary:{active:true,scope:'allowlist',version:'M26-COMMAND-PALETTE'},
    selectedClientId,
    activeArea:'hoy',
    collections:{
      ...createProductionState().collections,
      clients:[
        {id:clientA,name:'Álvaro Prueba',modalidad:'Híbrido'},
        {id:clientB,name:'Beatriz Demo',modalidad:'Online'},
      ],
    },
  });
}

function closestTarget(selectorName){
  return {
    tagName:'BUTTON',
    closest(selector){return selector===selectorName?this:null;},
  };
}

function fakeNode(tagName='div'){
  return {
    tagName:String(tagName).toUpperCase(),
    hidden:false,
    value:'',
    textContent:'',
    className:'',
    dataset:{},
    children:[],
    attributes:new Map(),
    disabled:false,
    setAttribute(name,value){this.attributes.set(name,String(value));},
    getAttribute(name){return this.attributes.get(name)??null;},
    append(...nodes){this.children.push(...nodes);},
    replaceChildren(...nodes){this.children=[...nodes];},
    focus(){this.focused=true;},
    click(){this.clicked=true;},
    closest(){return null;},
    querySelectorAll(){return [];},
  };
}

function commandDocument(vm){
  const listeners={};
  const launcher=fakeNode('button');
  launcher.hidden=false;
  launcher.closest=(selector)=>selector==='[data-coach-command-open]'?launcher:null;
  const palette=fakeNode('section');
  palette.hidden=true;
  const search=fakeNode('input');
  search.closest=(selector)=>selector==='[data-coach-command-search]'?search:null;
  const status=fakeNode('p');
  const results=fakeNode('div');
  const close=fakeNode('button');
  close.closest=(selector)=>selector==='[data-coach-command-close]'?close:null;
  const doc={
    listeners,
    activeElement:null,
    addEventListener(type,listener){listeners[type]=listener;},
    createElement(tag){
      const node=fakeNode(tag);
      node.focus=()=>{doc.activeElement=node;node.focused=true;};
      node.closest=(selector)=>selector==='[data-coach-command-result]'&&node.dataset.coachCommandResult==='true'?node:null;
      return node;
    },
    querySelector(selector){
      if(selector==='[data-coach-command-open]')return launcher;
      if(selector==='[data-coach-command-palette]')return palette;
      if(selector==='[data-coach-command-search]')return search;
      if(selector==='[data-coach-command-status]')return status;
      if(selector==='[data-coach-command-results]')return results;
      if(selector.includes('.m26-mobile-more[open]'))return null;
      return null;
    },
  };
  search.focus=()=>{doc.activeElement=search;search.focused=true;};
  launcher.focus=()=>{doc.activeElement=launcher;launcher.focused=true;};
  palette.querySelectorAll=(selector)=>{
    const resultButtons=results.children.filter((node)=>node.dataset?.coachCommandResult==='true'&&!node.disabled);
    if(selector==='[data-coach-command-result]:not([disabled])')return resultButtons;
    if(selector==='[data-coach-command-close],[data-coach-command-search],[data-coach-command-result]:not([disabled])')return [close,search,...resultButtons];
    return [];
  };
  bindCoachCommandPaletteSupport(doc,vm);
  return {doc,launcher,palette,search,status,results,close,listeners};
}

test('catálogo del comando respeta permisos y contexto de cliente',()=>{
  const withoutClient=createShellViewModel(coachState());
  const all=coachCommandItems(withoutClient);
  const expediente=all.find((item)=>item.area==='expediente');
  const clientes=all.filter((item)=>item.type==='client');
  assert.equal(expediente?.disabled,true);
  assert.equal(clientes.length,2);

  const withClient=createShellViewModel(coachState({selectedClientId:clientA}));
  assert.equal(coachCommandItems(withClient).find((item)=>item.area==='expediente')?.disabled,false);
  assert.equal(coachCommandItems(withClient,'diagnostico').some((item)=>item.area==='iri'),true);
  assert.equal(coachCommandItems(withClient,'alvaro').some((item)=>item.clientId===clientA),true);
});

test('launcher y diálogo exponen relación accesible estable',()=>{
  const html=renderM26Shell(createShellViewModel(coachState({selectedClientId:clientA})));
  assert.match(html,/data-coach-command-open aria-haspopup="dialog" aria-controls="m26-coach-command-palette" aria-expanded="false"/u);
  assert.match(html,/<section id="m26-coach-command-palette" class="m26-coach-command-backdrop" data-coach-command-palette role="dialog" aria-modal="true"/u);
});

test('Ctrl o Cmd K abre sólo fuera de campos editables',()=>{
  const body={tagName:'DIV',closest(){return null;}};
  const input={tagName:'INPUT',closest(){return this;}};
  assert.equal(shouldOpenCoachCommandShortcut({key:'k',ctrlKey:true,target:body}),true);
  assert.equal(shouldOpenCoachCommandShortcut({key:'K',metaKey:true,target:body}),true);
  assert.equal(shouldOpenCoachCommandShortcut({key:'k',ctrlKey:true,target:input}),false);
  assert.equal(shouldOpenCoachCommandShortcut({key:'k',ctrlKey:true,shiftKey:true,target:body}),false);
});

test('paleta abre con resultados, enfoca búsqueda y cierra restaurando launcher',async()=>{
  const vm=createShellViewModel(coachState({selectedClientId:clientA}));
  const {doc,launcher,palette,search,results}=commandDocument(vm);
  assert.equal(openCoachCommandPalette(doc),true);
  assert.equal(palette.hidden,false);
  assert.equal(launcher.getAttribute('aria-expanded'),'true');
  assert.ok(results.children.length>0);
  await Promise.resolve();
  assert.equal(search.focused,true);

  assert.equal(closeCoachCommandPalette(doc),true);
  assert.equal(palette.hidden,true);
  assert.equal(launcher.getAttribute('aria-expanded'),'false');
  await Promise.resolve();
  assert.equal(launcher.focused,true);
});

test('eventos globales abren con shortcut, filtran y cierran con Escape/backdrop',async()=>{
  const vm=createShellViewModel(coachState({selectedClientId:clientA}));
  const {doc,launcher,palette,search,results,listeners}=commandDocument(vm);
  const body={tagName:'DIV',closest(){return null;}};
  let prevented=false;
  listeners.keydown({key:'k',ctrlKey:true,target:body,preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(palette.hidden,false);
  await Promise.resolve();

  search.value='Beatriz';
  listeners.input({target:search});
  assert.equal(results.children.filter((node)=>node.dataset?.coachCommandResult==='true').length,1);
  assert.equal(results.children[0].dataset.m26SelectClient,clientB);

  prevented=false;
  listeners.keydown({key:'Escape',target:search,preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(palette.hidden,true);
  await Promise.resolve();
  assert.equal(launcher.focused,true);

  openCoachCommandPalette(doc);
  listeners.click({target:palette});
  assert.equal(palette.hidden,true);
});
