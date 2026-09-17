import {renderClientsRoute} from '../../src/m26/modules/route-render.js';
import {createShellController} from '../../src/m26/shell/shell-controller.js';

const root=document.querySelector('#qa-root');
if(!root)throw new Error('QA_REAL_CLIENT_ONBOARDING_ROOT_MISSING');

const COACH='22222222-2222-4222-8222-222222222222';
const state={
  identity:{id:COACH,name:'Coach QA',email:'coach.qa@iberfit.cl',role:'coach',authorizedRoles:['coach']},
  hydration:{status:'ready',serverTime:'2026-09-17T20:40:00.000Z'},
  activeArea:'clientes',
  selectedClientId:null,
  pendingOperations:[],
  conflicts:[],
  rejectedOperations:[],
  metrics:{},
  collections:{clients:[],appointments:[],sessions:[],clientAccess:[]},
};

const vm={
  role:'coach',
  canCreate:true,
  clients:[],
  selectedClientId:null,
};

const subscribers=new Set();
let refreshRevision=0;
const store={
  getState:()=>state,
  subscribe(listener){subscribers.add(listener);return ()=>subscribers.delete(listener);},
  navigate(area){state.activeArea=String(area||state.activeArea);for(const listener of subscribers)listener(state);},
  selectClient(clientId){state.selectedClientId=clientId||null;for(const listener of subscribers)listener(state);},
};
function queueShellRefresh(){refreshRevision+=1;for(const listener of subscribers)listener(state);}

const shell=createShellController({
  root,
  store,
  renderRoute:()=>`${renderClientsRoute(vm)}<span hidden data-qa-refresh-revision="${refreshRevision}"></span>`,
});
shell.mount();

globalThis.__IBERFIT_REAL_CLIENT_ONBOARDING_QA__=Object.freeze({
  mounted:true,
  queueShellRefresh,
  forceExternalRender:()=>shell.render(),
  activeArea:()=>state.activeArea,
});
