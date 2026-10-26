import {renderSessionBuilder} from '../../src/m26/workflows/session-ui.js';
import {renderM26Shell} from '../../src/m26/shell/shell-render.js';
import {createShellViewModel} from '../../src/m26/shell/shell-view-model.js';
import {resolveAdaptiveLayout} from '../../src/m26/shell/shell-controller.js';

const root=document.querySelector('#qa-root');
if(!root)throw new Error('SIGNATURE_COACH_BUILDER_ROOT_MISSING');
const COACH='11111111-1111-4111-8111-111111111111';
const CLIENT='22222222-2222-4222-8222-222222222222';
const EXERCISE={id:'signature-u14-squat',name_es:'Sentadilla con mancuernas',pattern:'sentadilla',equipment:'mancuernas'};
const catalog={
  get(id){return id===EXERCISE.id?EXERCISE:null;},
  has(id){return id===EXERCISE.id;},
  search(){return [EXERCISE];},
  facets:{patterns:['sentadilla'],equipment:['mancuernas'],difficulty:[],intent:[]},
};
const state={
  identity:{id:COACH,name:'Coach QA',email:'coach.synthetic@iberfit.cl',role:'coach',authorizedRoles:['coach']},
  hydration:{status:'ready',serverTime:'2026-10-19T12:00:00.000Z'},
  activeArea:'sesion',selectedClientId:CLIENT,pendingOperations:[],conflicts:[],rejectedOperations:[],metrics:{},
  collections:{clients:[{id:CLIENT,name:'Cliente de prueba',status:'active'}],appointments:[],sessions:[],
    clientProfiles:[],clientAccess:[],iriAssessments:[],reports:[],trainingCycles:[],sessionExecutions:[]},
};
const viewModel=createShellViewModel(state);
function draft(mode){
  const blocks=mode==='empty'?[]:[
    {id:'u14-block-1',type:'exercise',exerciseId:EXERCISE.id,name:EXERCISE.name_es,sets:3,reps:'8–12',targetRpe:7,targetRir:mode==='editing-invalid'?undefined:2,restSeconds:60},
    {id:'u14-block-2',type:'exercise',exerciseId:EXERCISE.id,name:EXERCISE.name_es,sets:2,reps:'10',targetRpe:7,targetRir:2,restSeconds:75},
  ];
  return {id:'u14-session',title:'Fuerza base A',clientId:CLIENT,blocks,durationMinutes:55,
    deliveryModality:'presencial',previewAccepted:mode==='preview',activeGroupId:null};
}
function render(mode){
  if(!['empty','editing','editing-invalid','preview'].includes(mode))throw new Error('SIGNATURE_COACH_BUILDER_MODE_INVALID');
  root.innerHTML=renderM26Shell(viewModel,renderSessionBuilder({
    draft:draft(mode),catalog,role:'coach',mediaMap:null,actionState:{status:'idle',message:''},filters:{},query:'',
  }));
  const layout=resolveAdaptiveLayout({width:innerWidth,coarsePointer:Boolean(matchMedia('(pointer: coarse)').matches),touchPoints:Number(navigator.maxTouchPoints||0)});
  root.dataset.m26Layout=layout;
  root.dataset.m26Input=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0?'touch':'pointer';
  root.dataset.qaBuilderMode=mode;
}
render('editing');
globalThis.addEventListener('resize',()=>{
  root.dataset.m26Layout=resolveAdaptiveLayout({width:innerWidth,coarsePointer:Boolean(matchMedia('(pointer: coarse)').matches),touchPoints:Number(navigator.maxTouchPoints||0)});
},{passive:true});
globalThis.__IBERFIT_COACH_BUILDER_VISUAL__=Object.freeze({syntheticQa:true,currentSource:true,authBypassed:false,mounted:true,setMode:render});
