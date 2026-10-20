// Synthetic identity, real canonical store + shell + navigation + current styles.
// This fixture proves navigation composition and recovery, NOT real authentication
// or functional acceptance of the 43 route bodies.
import {createCanonicalStore} from '../../src/m26/canonical-store.js';
import {createProductionState} from '../../src/m26/production-state.js';
import {createShellController} from '../../src/m26/shell/shell-controller.js';

const role=new URLSearchParams(location.search).get('role');
if(!['client','coach','admin'].includes(role))throw new Error('SIGNATURE_QA_ROLE_INVALID');
const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const root=document.querySelector('#qa-root');
if(!root)throw new Error('SIGNATURE_QA_ROOT_MISSING');
const initial=createProductionState({
  hydration:{status:'ready',error:null,confirmedAt:'2026-10-20T07:00:00Z',serverTime:'2026-10-20T07:00:00Z'},
  identity:{id:'11111111-1111-4111-8111-111111111111',role,name:'SIGNATURE navegación QA',email:'signature.qa@example.test',authorizedRoles:[role],...(role==='client'?{clientId}:{})},
  selectedClientId:clientId,
  activeArea:role==='admin'?'admin-inicio':'hoy',
  environment:'QA',
  canary:{active:true,scope:'allowlist',version:'SIGNATURE-U22-SHELL-QA'},
  collections:{...createProductionState().collections,clients:[{id:clientId,name:'Cliente sintético U22',modalidad:'Híbrido'}]},
});
const store=createCanonicalStore(initial);
const controller=createShellController({
  root,store,
  renderRoute:(vm)=>'<section class="m26-route-placeholder" data-qa-current-area="'+vm.activeArea+'"><h2>'+vm.page.title+'</h2><p>Contenido simulado: no representa aceptación funcional.</p></section>',
});
controller.mount();
globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__=Object.freeze({
  role,area:()=>store.getState().activeArea,
  navigate:(area)=>store.navigate(area),
  rerender:()=>controller.render(),
});
