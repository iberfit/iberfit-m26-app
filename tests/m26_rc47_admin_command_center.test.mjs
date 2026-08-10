import test from 'node:test';
import assert from 'node:assert/strict';
import {createPermissionSet} from '../src/m26/shared/permission-set.js';
import {deriveAdminCommandCenter} from '../src/m26/admin/command-center.js';
import {createAdminRouteViewModel} from '../src/m26/admin/view-model.js';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';

test('Command Center prioriza cliente sin Coach antes de recorrido pendiente',()=>{
  const cc=deriveAdminCommandCenter({
    clients:[
      {id:'C1',name:'Ana',assignments:[],coachNames:[],experience:{stage:'active',stageLabel:'Seguimiento activo',priority:5},nextAction:{area:'admin-clientes',label:'Revisar'}},
      {id:'C2',name:'Bea',assignments:[{id:'A2'}],coachNames:['Carlos'],experience:{stage:'evaluation',stageLabel:'Evaluación pendiente',priority:2},nextAction:{area:'admin-clientes',label:'Revisar situación del cliente'}},
      {id:'C3',name:'Clara',assignments:[{id:'A3'}],coachNames:['Carlos'],experience:{stage:'active',stageLabel:'Seguimiento activo',priority:5},nextAction:{area:'admin-clientes',label:'Revisar'}},
    ],
    coaches:[{userId:'U1',name:'Carlos',clientCount:2,capacityHours:20,assignedHours:18}],
    tasks:[{id:'T1',status:'open',priority:'critical',title:'Incidencia'}],
  });
  assert.equal(cc.summary.totalClients,3);
  assert.equal(cc.summary.unassignedClients,1);
  assert.equal(cc.summary.iriPending,1);
  assert.equal(cc.summary.coachesNearCapacity,1);
  assert.equal(cc.summary.criticalTasks,1);
  assert.equal(cc.priorities[0].clientName,'Ana');
  assert.equal(cc.priorities[0].action.label,'Asignar coach');
  assert.equal(cc.coachLoad[0].loadPercent,90);
});

function adminState(){
  const capabilities=['organization.read','assignment.read','client.lifecycle.read'];
  return {
    identity:{id:'U-ADMIN',role:'admin'},
    selectedClientId:null,
    collections:{
      clients:[{id:'C1',name:'Ana',status:'active'}],
      clientProfiles:[],
      clientAccess:[],
      iriAssessments:[],
      reports:[],
      trainingCycles:[],
      sessions:[],
      sessionExecutions:[],
      appointments:[],
    },
    admin:{
      available:true,
      reason:null,
      organization:{id:'ORG1',name:'IBERFIT',timezone:'America/Santiago',locale:'es-CL',revision:1},
      summary:{users:2,coaches:1,leads:0,activeClients:1,openTasks:0,activeAutomations:0},
      analytics:{activeClients:1},
      permissions:createPermissionSet({capabilities,scopeType:'organization',organizationId:'ORG1'}),
      collections:{
        organizationUsers:[],
        applicationRoles:[],
        coachProfiles:[{id:'CP1',userId:'U1',name:'Carlos',status:'active',clientCount:1,capacityHours:20,assignedHours:10}],
        coachClientAssignments:[{id:'A1',coachUserId:'U1',clientId:'C1',status:'active',revision:1}],
        leads:[],
        clientLifecycle:[],
        operationalTasks:[],
        notificationTemplates:[],
        notificationDeliveries:[],
        automationRules:[],
        auditEvents:[],
      },
    },
  };
}

test('Admin Inicio usa el Experience Core y presenta decisiones humanas',()=>{
  const state=adminState();
  state.admin.collections.coachClientAssignments=[];
  const vm=createAdminRouteViewModel({}, {identity:{role:'admin'},activeArea:'admin-inicio'}, state);
  assert.equal(vm.commandCenter.summary.unassignedClients,1);
  assert.equal(vm.commandCenter.priorities[0].clientName,'Ana');
  const html=renderAdminRoute(vm);
  assert.match(html,/IBERFIT Command Center/);
  assert.match(html,/Asignar coach/);
  assert.match(html,/Ana/);
});

test('Equipo muestra nombres de Coach y Cliente en vez de IDs crudos',()=>{
  const state=adminState();
  const vm=createAdminRouteViewModel({}, {identity:{role:'admin'},activeArea:'admin-equipo'}, state);
  const html=renderAdminRoute(vm);
  assert.match(html,/<td>Carlos<\/td>/);
  assert.match(html,/<td>Ana<\/td>/);
  assert.doesNotMatch(html,/<td>U1<\/td>/);
  assert.doesNotMatch(html,/<td>C1<\/td>/);
});
