import {renderClientsRoute} from '../../src/m26/modules/route-render.js';
import {createWorkflowController} from '../../src/m26/app/workflow-controller.js';
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
  collections:{clients:[],appointments:[],sessions:[],clientAccess:[],iriAssessments:[]},
};

const vm={
  role:'coach',
  canCreate:true,
  clients:[],
  selectedClientId:null,
};

const subscribers=new Set();
let refreshRevision=0;
let draftSaveCount=0;
let draftLoadResolved=false;
let releaseDraftLoad;
const draftLoadGate=new Promise((resolve)=>{releaseDraftLoad=resolve;});
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

const catalog=Object.freeze({
  list:()=>[],
  get:()=>null,
  has:()=>false,
  count:0,
});
const draftRepository=Object.freeze({
  async load(){
    await draftLoadGate;
    draftLoadResolved=true;
    return {value:{name:'BORRADOR ANTIGUO NO DEBE VOLVER',email:'borrador-antiguo@example.test'}};
  },
  async save(){draftSaveCount+=1;return {ok:true};},
});
const workflow=createWorkflowController({
  root,
  store,
  catalog,
  mediaMap:new Map(),
  draftRepository,
  commandBus:{execute:async()=>({ok:true})},
  onRender:()=>shell.render(),
  refreshState:async()=>state,
});
workflow.mount();

globalThis.__IBERFIT_REAL_CLIENT_ONBOARDING_QA__=Object.freeze({
  mounted:true,
  queueShellRefresh,
  forceExternalRender:()=>shell.render(),
  activeArea:()=>state.activeArea,
  draftSaveCount:()=>draftSaveCount,
  draftLoadResolved:()=>draftLoadResolved,
  releaseDraftLoad:()=>releaseDraftLoad?.(),
});
