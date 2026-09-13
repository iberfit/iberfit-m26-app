import {renderAdminRoute} from '../../src/m26/admin/route-render.js';
import {createAdminController} from '../../src/m26/admin/controller.js';
import {createShellController} from '../../src/m26/shell/shell-controller.js';

const root=document.querySelector('#qa-root');
if(!root)throw new Error('QA_CLIENT_FORM_ROOT_MISSING');

const ADMIN='11111111-1111-4111-8111-111111111111';
const ORG='00000000-0000-4000-8000-000000000140';

const state={
  identity:{id:ADMIN,name:'Admin QA',email:'admin.qa@iberfit.cl',role:'admin',authorizedRoles:['admin']},
  hydration:{status:'ready',serverTime:'2026-09-12T12:00:00.000Z'},
  activeArea:'admin-clientes',
  selectedClientId:null,
  pendingOperations:[],
  conflicts:[],
  rejectedOperations:[],
  metrics:{},
  collections:{clients:[],appointments:[],sessions:[],clientAccess:[]},
  admin:{
    available:true,
    organization:{id:ORG,name:'IBERFIT QA',timezone:'America/Santiago',locale:'es-CL',revision:7},
    summary:{},
  },
};

const vm={
  admin:true,
  kind:'admin-clientes',
  currentUserId:ADMIN,
  organization:state.admin.organization,
  canManage:true,
  leads:[],
  clients:[],
};

const subscribers=new Set();
const store={
  getState:()=>state,
  subscribe(listener){subscribers.add(listener);return ()=>subscribers.delete(listener);},
  navigate(area){state.activeArea=String(area||state.activeArea);for(const listener of subscribers)listener(state);},
  selectClient(clientId){state.selectedClientId=clientId||null;for(const listener of subscribers)listener(state);},
};
function queueShellRefresh(){for(const listener of subscribers)listener(state);}

const shell=createShellController({
  root,
  store,
  renderRoute:()=>renderAdminRoute(vm),
});
shell.mount();

const service={
  async execute(input){
    return {
      ok:true,
      response:{ok:true,kind:'ack',operationId:'qa-client-form',commandType:String(input?.type||'')},
      refreshPending:false,
      refreshOk:true,
      whenRefreshed:Promise.resolve({ok:true}),
    };
  },
};

const admin=createAdminController({root,store,service,render:()=>shell.render()});
admin.mount();

globalThis.__IBERFIT_CLIENT_FORM_QA__=Object.freeze({
  mounted:true,
  queueShellRefresh,
});
