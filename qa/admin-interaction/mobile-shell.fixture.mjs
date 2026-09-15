import {createCanonicalStore} from '../../src/m26/canonical-store.js';
import {createProductionState} from '../../src/m26/production-state.js';
import {createShellController} from '../../src/m26/shell/shell-controller.js';

const root=document.querySelector('#qa-root');
if(!root)throw new Error('QA_ADMIN_MOBILE_SHELL_ROOT_MISSING');

const initial=createProductionState({
  hydration:{
    status:'ready',
    error:null,
    confirmedAt:'2026-09-15T12:00:00.000Z',
    serverTime:'2026-09-15T12:00:00.000Z',
  },
  identity:{
    id:'11111111-1111-4111-8111-111111111111',
    name:'Admin Mobile QA',
    email:'admin.mobile.qa@iberfit.cl',
    role:'admin',
    authorizedRoles:['admin'],
  },
  environment:'QA',
  canary:{active:true,scope:'allowlist',version:'M26-ADMIN-MOBILE-MORE-QA'},
  activeArea:'admin-inicio',
});

const store=createCanonicalStore(initial);
const shell=createShellController({
  root,
  store,
  renderRoute:(vm)=>`<section class="m26-route-placeholder" data-qa-current-area="${vm.activeArea}"><p class="m26-eyebrow">QA móvil</p><h2>${vm.page?.title||vm.activeArea}</h2></section>`,
});

shell.mount();

globalThis.__IBERFIT_ADMIN_MOBILE_SHELL_QA__=Object.freeze({
  mounted:true,
  activeArea:()=>store.getState().activeArea,
});
