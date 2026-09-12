import {renderAdminRoute} from '../../src/m26/admin/route-render.js';
import {createAdminController} from '../../src/m26/admin/controller.js';

const root=document.querySelector('#qa-root');
if(!root)throw new Error('QA_ADMIN_ROOT_MISSING');

const CURRENT_ADMIN='11111111-1111-4111-8111-111111111111';
const COACH='22222222-2222-4222-8222-222222222222';
const CLIENT='33333333-3333-4333-8333-333333333333';
const CLIENT_ID='44444444-4444-4444-8444-444444444444';
const ORG='00000000-0000-4000-8000-000000000140';

const state={
  admin:{
    organization:{id:ORG,name:'IBERFIT QA',timezone:'America/Santiago',locale:'es-CL',revision:7},
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
  return {
    admin:true,
    kind:'admin-usuarios',
    currentUserId:CURRENT_ADMIN,
    users:structuredClone(users),
    roles:[],
    canManageStatus:true,
    canManageRoles:true,
    user360Summary:{total:3,activeUsers:2,pendingInvitations:0,integrityIssueCount:0},
  };
}

function clientsVm(){
  return {
    admin:true,
    kind:'admin-clientes',
    currentUserId:CURRENT_ADMIN,
    canManage:true,
    leads:[],
    clients:[],
  };
}

const route=new URLSearchParams(location.search).get('route')==='clients'?'clients':'users';
let vm=route==='clients'?clientsVm():usersVm();

function render(){
  root.innerHTML=renderAdminRoute(vm);
}

const service={
  async execute(input){
    const type=String(input?.type||'');
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

globalThis.__IBERFIT_ADMIN_INTERACTION_QA__=Object.freeze({
  route,
  mounted:true,
  ids:Object.freeze({CURRENT_ADMIN,COACH,CLIENT,CLIENT_ID,ORG}),
});
