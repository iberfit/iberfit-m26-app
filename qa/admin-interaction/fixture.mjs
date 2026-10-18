import {renderAdminRoute} from '../../src/m26/admin/route-render.js';
import {createAdminController} from '../../src/m26/admin/controller.js';
import {renderM26Shell} from '../../src/m26/shell/shell-render.js';
import {createShellViewModel} from '../../src/m26/shell/shell-view-model.js';
import {setMobileMoreOpen} from '../../src/m26/shell/mobile-more-disclosure.js';

const root=document.querySelector('#qa-root');
if(!root)throw new Error('QA_ADMIN_ROOT_MISSING');

const CURRENT_ADMIN='11111111-1111-4111-8111-111111111111';
const COACH='22222222-2222-4222-8222-222222222222';
const CLIENT='33333333-3333-4333-8333-333333333333';
const CLIENT_ID='44444444-4444-4444-8444-444444444444';
const ORG='00000000-0000-4000-8000-000000000140';
const lifecycleQA=new URLSearchParams(location.search).has('lifecycle');
const triageQA=new URLSearchParams(location.search).has('triage');
const people=lifecycleQA?[
  {id:'iri-person',name:'Persona con IRI',status:'active',lifecycle:{status:'onboarding'},trainingServiceStatus:'none',serviceKind:'none',coachNames:['Coach Interacción']},
  {id:'active-person',name:'Cliente activo',status:'active',lifecycle:{status:'active'},trainingServiceStatus:'active',serviceKind:'training',coachNames:['Coach Interacción']},
]:[];
const commands=[];

const route=new URLSearchParams(location.search).get('route')==='clients'?'clients':'users';
const activeArea=route==='clients'?'admin-clientes':'admin-usuarios';

const state={
  identity:{
    id:CURRENT_ADMIN,
    name:'Admin QA',
    email:'admin.qa@iberfit.cl',
    role:'admin',
    authorizedRoles:['admin'],
  },
  hydration:{status:'ready',serverTime:'2026-09-12T12:00:00.000Z'},
  activeArea,
  selectedClientId:null,
  pendingOperations:[],
  conflicts:[],
  rejectedOperations:[],
  metrics:{},
  collections:{
    clients:structuredClone(people),
    appointments:[],
    sessions:[],
    clientAccess:[],
  },
  admin:{
    available:true,
    organization:{id:ORG,name:'IBERFIT QA',timezone:'America/Santiago',locale:'es-CL',revision:7},
    summary:{},
  },
};

const users=[
  {
    id:CURRENT_ADMIN,userId:CURRENT_ADMIN,name:'Admin QA',authEmail:'admin.qa@iberfit.cl',email:'admin.qa@iberfit.cl',
    status:'active',revision:7,roles:['admin'],primaryRole:'admin',lastAccessAt:'2026-09-12T12:00:00.000Z',
  },
  {
    id:COACH,userId:COACH,name:'Coach Interacción',authEmail:'coach.interaccion@iberfit.cl',email:'coach.interaccion@iberfit.cl',
    status:'active',revision:4,roles:['coach'],primaryRole:'coach',lastAccessAt:'2026-09-12T11:30:00.000Z',
    coach:{name:'Coach Interacción',email:'coach.interaccion@iberfit.cl',activeClientCount:2},
  },
  {
    id:CLIENT,userId:CLIENT,name:'Cliente Interacción',authEmail:'cliente.interaccion@iberfit.cl',email:'cliente.interaccion@iberfit.cl',
    contactEmail:'cliente.interaccion@iberfit.cl',status:'suspended',revision:3,roles:['client'],primaryRole:'client',
    client:{id:CLIENT_ID,name:'Cliente Interacción',modality:'Híbrido',lifecycleStatus:'active'},
    access:{status:'suspendido',authLinked:true,activatedAt:'2026-09-01T10:00:00.000Z'},
    assignedCoachNames:['Coach Interacción'],
  },
];

function usersVm(){
  const currentUsers=structuredClone(users);
  if(triageQA){
    // Local, non-network fixture only. No production identity or DB changes.
    currentUsers[2].integrityIssues=[{code:'AUTH_CLIENT_LINK_REVIEW'}];
    currentUsers[2].access={status:'invitacion_pendiente',authLinked:false};
    currentUsers.push({
      id:'55555555-5555-4555-8555-555555555555',
      userId:'55555555-5555-4555-8555-555555555555',
      name:'Cliente sin vínculo QA',
      authEmail:'sin-vinculo@iberfit.test',
      status:'active',roles:['client'],primaryRole:'client',
      integrityIssues:[],access:null,
    });
  }
  return {
    admin:true,
    kind:'admin-usuarios',
    currentUserId:CURRENT_ADMIN,
    users:currentUsers,
    roles:[],
    canManageStatus:true,
    canManageRoles:true,
    user360Summary:triageQA
      ?{total:4,activeUsers:3,pendingInvitations:1,integrityIssueCount:1}
      :{total:3,activeUsers:2,pendingInvitations:0,integrityIssueCount:0},
  };
}

function clientsVm(){
  return {
    admin:true,
    kind:'admin-clientes',
    currentUserId:CURRENT_ADMIN,
    canManage:true,
    leads:[],
    clients:structuredClone(people),
    coaches:[{id:COACH,userId:COACH,name:'Coach Interacción',email:'coach.interaccion@iberfit.cl',status:'active'}],
  };
}

let vm=route==='clients'?clientsVm():usersVm();

function render(){
  const shellVm=createShellViewModel(state);
  root.innerHTML=renderM26Shell(shellVm,renderAdminRoute(vm));
}

const service={
  async execute(input){
    commands.push(structuredClone(input));
    const type=String(input?.type||'');
    if(type==='ADMIN_CLIENTE_CAMBIAR_SERVICIO'){
      const person=people.find((item)=>item.id===input.payload.clientId);
      if(person){
        person.trainingServiceStatus=input.payload.status;
        person.serviceKind=['active','paused'].includes(input.payload.status)?'training':'none';
      }
      vm=clientsVm();
    }
    if(type==='ADMIN_USUARIO_CAMBIAR_ESTADO'){
      const target=users.find((item)=>item.userId===input.payload?.userId);
      if(target){
        target.status=String(input.payload?.status||target.status);
        target.revision+=1;
        vm=usersVm();
      }
    }
    return {
      ok:true,
      response:{ok:true,kind:'ack',operationId:'qa-interaction',commandType:type},
      refreshPending:false,
      refreshOk:true,
      whenRefreshed:Promise.resolve({ok:true}),
    };
  },
};

render();

const controller=createAdminController({
  root,
  store:{getState:()=>state},
  service,
  render,
});
controller.mount();

// The visual fixture renders the production shell but deliberately does not
// mount the full navigation/store controller. Exercise its exact disclosure
// helper so native touch has production ARIA and inert-background semantics.
root.addEventListener('click',(event)=>{
  const summary=event.target?.closest?.('details.m26-mobile-more > summary');
  if(!summary)return;
  const details=summary.closest('details.m26-mobile-more');
  if(!details)return;
  event.preventDefault();
  setMobileMoreOpen(details,!(details.open||details.hasAttribute('open')));
});

globalThis.__IBERFIT_ADMIN_INTERACTION_QA__=Object.freeze({
  route,
  mounted:true,
  ids:Object.freeze({CURRENT_ADMIN,COACH,CLIENT,CLIENT_ID,ORG}),
  commands:()=>structuredClone(commands),
  forceRender:()=>{render();root.dispatchEvent(new CustomEvent('m26:shell-rendered',{bubbles:true}));},
});
