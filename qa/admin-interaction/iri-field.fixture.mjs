import {renderIriRoute} from '../../src/m26/modules/route-render.js';
import {createWorkflowController} from '../../src/m26/app/workflow-controller.js';
import {normalizeFirstSessionDraft} from '../../src/m26/workflows/iri-first-session.js';
const root=document.querySelector('#qa-root');
const current={id:'iri-field',clientId:'iri-person',assessmentType:'inicial'};
const state={identity:{id:'coach',role:'coach'},selectedClientId:'iri-person',activeArea:'iri',collections:{clients:[{id:'iri-person',name:'QA Solo IRI',lifecycleStatus:'iri_only'}],iriAssessments:[current]}};
root.innerHTML=renderIriRoute({role:'coach',current,canEdit:true,profile:{},sourceProfile:{},history:[],currentSummary:{coverageCount:0,coverageLabel:'0',processLabel:'En preparación',confirmed:false,domains:{}}});
createWorkflowController({root,store:{getState:()=>state},commandBus:{execute:async()=>({ok:true})},catalog:{list:()=>[],get:()=>null,has:()=>false},mediaMap:new Map(),draftRepository:{load:async()=>null,save:async()=>({ok:true})}}).mount();
globalThis.__IBERFIT_IRI_FIELD_QA__={draft:()=>normalizeFirstSessionDraft(Object.fromEntries(new FormData(root.querySelector('[data-workflow-form="iri"]'))),current,'iri-person')};
