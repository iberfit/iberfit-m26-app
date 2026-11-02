// Synthetic identity, real canonical store + shell + navigation + current styles.
// This fixture proves navigation composition and recovery, NOT real authentication
// or functional acceptance of the 43 route bodies.
import {createCanonicalStore} from '../../src/m26/canonical-store.js';
import {createProductionState} from '../../src/m26/production-state.js';
import {createShellController} from '../../src/m26/shell/shell-controller.js';
import {renderClientBottomNav} from '../../src/m26/modules/route-render.js';
import {createRouteViewModel} from '../../src/m26/modules/route-view-model.js';
import {renderRouteView} from '../../src/m26/modules/route-render.js';
import {ADMIN_ROUTE_CAPABILITIES,normalizeAdminPermissions} from '../../src/m26/admin/permission-policy.js';

const params=new URLSearchParams(location.search);
const role=params.get('role');
const realBodies=params.get('body')==='real';
// Explicitly opted-in QA only: grant synthetic capabilities to an invented
// Admin identity for ART-DIRECTION coverage. The default stays fail-closed.
const authorizedAdminSynthetic=role==='admin'&&realBodies&&params.get('adminSurface')==='authorized-synthetic';
if(!['client','coach','admin'].includes(role))throw new Error('SIGNATURE_QA_ROLE_INVALID');
const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const root=document.querySelector('#qa-root');
if(!root)throw new Error('SIGNATURE_QA_ROOT_MISSING');
const baseline=createProductionState();
const enabledAdminMediaReview=role==='admin'?{
  ...baseline.admin,
  available:true,
  reason:null,
  permissions:authorizedAdminSynthetic
    ?normalizeAdminPermissions({
      capabilities:Object.values(ADMIN_ROUTE_CAPABILITIES),
      scopeType:'organization',organizationId:'00000000-0000-4000-8000-000000000140',
      issuedAt:'2026-10-20T12:00:00.000Z',
    })
    :baseline.admin.permissions,
  organization:{
    id:'00000000-0000-4000-8000-000000000140',
    name:'IBERFIT QA — organización ficticia',
    settings:{admin_media_review_enabled:true},
  },
}:baseline.admin;
const initial=createProductionState({
  hydration:{status:'ready',error:null,confirmedAt:'2026-10-20T07:00:00Z',serverTime:'2026-10-20T07:00:00Z'},
  identity:{id:'11111111-1111-4111-8111-111111111111',role,name:'SIGNATURE navegación QA',email:'signature.qa@example.test',authorizedRoles:[role],...(role==='client'?{clientId}:{})},
  selectedClientId:clientId,
  activeArea:role==='admin'?'admin-inicio':'hoy',
  environment:'QA',
  // Production Media Factory is explicitly feature-gated. This synthetic
  // Admin actor opts into the gate to exercise an enabled authorized route;
  // it never changes the application's fail-closed policy or backend access.
  admin:enabledAdminMediaReview,
  canary:{active:true,scope:'allowlist',version:'SIGNATURE-U22-SHELL-QA'},
  collections:{...createProductionState().collections,clients:[{id:clientId,name:'Cliente sintético U22',modalidad:'Híbrido'}]},
});
const store=createCanonicalStore(initial);
const controller=createShellController({
  root,store,
  renderRoute:(vm,state)=>{
    // Opt-in isolated QA only: real production view model and renderer, synthetic role and empty data.
    if(realBodies)return renderRouteView(createRouteViewModel(vm,state,new Date('2026-10-20T12:00:00-03:00')));
    const content='<section class="m26-route-placeholder" data-qa-current-area="'+vm.activeArea+'"><h2>'+vm.page.title+'</h2><p>Contenido simulado: no representa aceptación funcional.</p></section>';
    // Client production deliberately suppresses the shell mobile navigation.
    // Render the actual production Client bottom nav helper around fake body,
    // not a handcrafted duplicate, so physical taps exercise the real dock.
    return role==='client'
      ?'<div class="m26-client-route-shell" data-client-bottom-nav-route="'+vm.activeArea+'">'+content+renderClientBottomNav({kind:vm.activeArea})+'</div>'
      :content;
  },
});
controller.mount();
globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__=Object.freeze({
  role,bodyMode:realBodies?'real-synthetic':'placeholder',
  adminSurface:authorizedAdminSynthetic?'authorized-synthetic':'permission-denied',
  area:()=>store.getState().activeArea,
  navigate:(area)=>store.navigate(area),
  rerender:()=>controller.render(),
});
