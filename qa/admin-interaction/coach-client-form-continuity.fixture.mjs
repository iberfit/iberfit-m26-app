import {renderClientsRoute} from '../../src/m26/modules/route-render.js';
import {createCoachProductivityController} from '../../src/m26/productivity/coach-productivity.js';
import {createShellController} from '../../src/m26/shell/shell-controller.js';

const root=document.querySelector('#qa-root');
if(!root)throw new Error('QA_COACH_CLIENT_FORM_ROOT_MISSING');

const COACH='11111111-1111-4111-8111-111111111111';
const state={
  identity:{id:COACH,name:'Coach QA',email:'coach.qa@iberfit.cl',role:'coach',authorizedRoles:['coach']},
  hydration:{status:'ready',serverTime:'2026-09-14T01:00:00.000Z'},
  activeArea:'clientes',
  selectedClientId:null,
  pendingOperations:[],
  conflicts:[],
  rejectedOperations:[],
  metrics:{},
  collections:{clients:[],appointments:[],sessions:[],clientAccess:[]},
};
const subscribers=new Set();
const store={
  getState:()=>state,
  subscribe(listener){subscribers.add(listener);return ()=>subscribers.delete(listener);},
  navigate(area){state.activeArea=String(area||state.activeArea);for(const listener of subscribers)listener(state);},
  selectClient(clientId){state.selectedClientId=clientId||null;for(const listener of subscribers)listener(state);},
};
const vm={role:'coach',clients:[],selectedClientId:null,canCreate:true};
function queueShellRefresh(){for(const listener of subscribers)listener(state);}

const shell=createShellController({root,store,renderRoute:()=>renderClientsRoute(vm)});
shell.mount();

const productivity=createCoachProductivityController({
  root,
  store,
  ownerId:COACH,
  storage:globalThis.localStorage,
});
productivity.mount();

globalThis.__IBERFIT_COACH_CLIENT_FORM_QA__=Object.freeze({
  mounted:true,
  queueShellRefresh,
});
