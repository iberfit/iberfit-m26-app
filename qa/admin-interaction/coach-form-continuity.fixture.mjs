import {createShellController} from '../../src/m26/shell/shell-controller.js';
import {renderClientsRoute} from '../../src/m26/modules/route-render.js';
import {createCoachProductivityController} from '../../src/m26/productivity/coach-productivity.js';

const root=document.querySelector('#qa-root');
if(!root)throw new Error('QA_COACH_FORM_ROOT_MISSING');

const COACH='11111111-1111-4111-8111-111111111111';
const SAMPLE_CLIENT=Object.freeze({
  id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name:'Ana Pérez',
  modality:'Online',
  status:'Activa',
  accessKnown:true,
  iri:{confirmed:true,status:'Completada',coverageCount:7,coverageLabel:'7 de 7'},
  profile:{primaryObjective:'Fuerza y salud',weeklyFrequency:2,email:'ana.perez@example.com',phone:'+56955550101'},
  nextAction:{label:'Revisar seguimiento'},
  experience:{stageLabel:'Seguimiento activo',priority:1,stage:'active'},
});

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
let refreshRevision=0;
const store={
  getState:()=>state,
  subscribe(listener){subscribers.add(listener);return ()=>subscribers.delete(listener);},
  navigate(area){state.activeArea=String(area||state.activeArea);for(const listener of subscribers)listener(state);},
  selectClient(clientId){state.selectedClientId=clientId||null;for(const listener of subscribers)listener(state);},
};
function notify(){refreshRevision+=1;for(const listener of subscribers)listener(state);}
function queueShellRefresh(){notify();}
function setClientScenario(mode='zero'){
  state.collections.clients=mode==='one'?[SAMPLE_CLIENT]:[];
  notify();
  return state.collections.clients.length;
}
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
  renderRoute:()=>`${renderClientsRoute({
    role:'coach',
    clients:state.collections.clients,
    selectedClientId:state.selectedClientId,
    canCreate:true,
  })}<span hidden data-qa-refresh-revision="${refreshRevision}"></span>`,
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
  forceExternalRender:()=>shell.render(),
  startRefreshBurst,
  setClientScenario,
});
