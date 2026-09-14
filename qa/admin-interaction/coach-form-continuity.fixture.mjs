import {createShellController} from '../../src/m26/shell/shell-controller.js';
import {renderClientsRoute} from '../../src/m26/modules/route-render.js';
import {createCoachProductivityController} from '../../src/m26/productivity/coach-productivity.js';

const root=document.querySelector('#qa-root');
if(!root)throw new Error('QA_COACH_FORM_ROOT_MISSING');

const COACH='11111111-1111-4111-8111-111111111111';
const state={
  identity:{id:COACH,name:'Coach QA',email:'coach.qa@iberfit.cl',role:'coach',authorizedRoles:['coach']},
  hydration:{status:'ready',serverTime:'2026-09-14T00:00:00.000Z'},
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
function notify(){for(const listener of subscribers)listener(state);}
function queueShellRefresh(){notify();}
function startRefreshBurst({count=32,intervalMs=8}={}){
  let left=Math.max(1,Number(count)||1);
  const timer=setInterval(()=>{
    notify();
    left-=1;
    if(left<=0)clearInterval(timer);
  },Math.max(1,Number(intervalMs)||1));
  return true;
}

const shell=createShellController({
  root,
  store,
  renderRoute:()=>renderClientsRoute({
    role:'coach',
    clients:[],
    selectedClientId:null,
    canCreate:true,
  }),
});
shell.mount();

const productivity=createCoachProductivityController({
  root,
  store,
  ownerId:COACH,
  storage:globalThis.localStorage,
});
productivity.mount();

globalThis.__IBERFIT_COACH_FORM_QA__=Object.freeze({
  mounted:true,
  queueShellRefresh,
  startRefreshBurst,
});
