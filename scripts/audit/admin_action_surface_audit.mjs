import fs from 'node:fs/promises';
import path from 'node:path';

import {M26_AREAS,areaAllowedForRole} from '../../src/m26/shell/navigation.js';
import {projectAdminSnapshot} from '../../src/m26/admin/admin-state.js';
import {auditInteractiveMarkup} from '../../src/m26/ui/interactive-audit.js';
import {createProductionState} from '../../src/m26/production-state.js';
import {resolveM26Route} from '../../src/m26/shell/route-guard.js';
import {createShellViewModel} from '../../src/m26/shell/shell-view-model.js';
import {createRouteViewModel} from '../../src/m26/modules/route-view-model.js';
import {renderRouteView} from '../../src/m26/modules/route-render.js';

const VERSION='1.0.0';
const ROLE='admin';
const NOW=new Date('2026-09-06T12:00:00-03:00');
const ORG_ID='audit-org';
const CLIENT_ID='audit-client-1';
const CLIENT_ID_UNASSIGNED='audit-client-2';
const OUT_DIR=path.resolve(process.env.M26_ADMIN_AUDIT_OUT_DIR||'recovery/continuous-audit');
const OUT_JSON=path.join(OUT_DIR,'admin-actions-latest.json');
const OUT_MD=path.join(OUT_DIR,'admin-actions-latest.md');

const CAPABILITIES=Object.freeze([
  'organization.read','organization.settings.manage',
  'user.read_summary','user.manage_status','role.read','role.manage',
  'assignment.read','assignment.manage','client.lifecycle.read','client.lifecycle.manage',
  'appointment.manage_global','operation.read_global','operation.manage_global',
  'message.read','message.manage_templates','automation.read','automation.manage',
  'analytics.read','audit.read',
]);

const ACTIONABLE_AREAS=Object.freeze([
  'admin-inicio','admin-usuarios','admin-equipo','admin-clientes',
  'admin-operaciones','admin-comunicacion','admin-automatizaciones','admin-configuracion',
]);

const REQUIRED_FORM_KINDS=Object.freeze([
  'user-status','role-change','assignment-create','assignment-end',
  'lead-create','lead-update','client-lifecycle','client-delete',
  'task-create','task-resolve','template-save','automation-save','settings-save',
]);

function rawAdmin(){
  return {
    ok:true,
    organization:{
      id:ORG_ID,name:'IBERFIT Audit',slug:'iberfit-audit',status:'active',
      timezone:'America/Santiago',locale:'es-CL',revision:3,
    },
    permissions:CAPABILITIES,
    permissionRevision:3,
    serverTime:NOW.toISOString(),
    data:{
      organizationUsers:[
        {id:'audit-admin',userId:'audit-admin',email:'admin.audit@iberfit.invalid',name:'Admin Auditor',status:'active',primaryRole:'admin',roles:['admin'],revision:2},
        {id:'audit-coach',userId:'audit-coach',email:'coach.audit@iberfit.invalid',name:'Coach Auditor',status:'active',primaryRole:'coach',roles:['coach'],revision:2},
      ],
      applicationRoles:[{id:'role-audit-coach',userId:'audit-coach',role:'coach',active:true,revision:1}],
      coachProfiles:[{id:'coach-profile-audit',userId:'audit-coach',email:'coach.audit@iberfit.invalid',name:'Coach Auditor',status:'active',clientCount:1,capacityHours:20,assignedHours:8,revision:1}],
      coachClientAssignments:[{id:'assignment-audit',coachUserId:'audit-coach',clientId:CLIENT_ID,status:'active',startsAt:'2026-09-01T12:00:00Z',reason:'Fixture de auditoría',revision:2}],
      leads:[{id:'lead-audit',name:'Lead Auditor',email:'lead.audit@iberfit.invalid',source:'audit',objective:'Evaluar flujo',status:'new',revision:2}],
      clientLifecycle:[{id:'lifecycle-audit',clientId:CLIENT_ID,status:'active',reason:'Fixture de auditoría',effectiveAt:'2026-09-01T12:00:00Z',revision:2}],
      operationalTasks:[{id:'task-audit',type:'manual_review',entityType:'client',entityId:CLIENT_ID,clientId:CLIENT_ID,status:'open',priority:'high',title:'Revisión de auditoría',detail:'Valida controles Admin',revision:2}],
      notificationTemplates:[{id:'template-audit',key:'audit.template',name:'Plantilla auditoría',channel:'in_app',subject:'Auditoría',body:'Contenido de auditoría',status:'active',revision:2}],
      notificationDeliveries:[{id:'delivery-audit',templateKey:'audit.template',recipientType:'client',recipientId:CLIENT_ID,channel:'in_app',status:'sent',revision:1}],
      automationRules:[{id:'automation-audit',key:'audit.rule',name:'Regla auditoría',triggerType:'checkin_due',actionType:'notification',status:'active',configuration:{templateKey:'audit.template'},revision:2}],
      auditEvents:[{id:'event-audit',eventType:'AUDIT_FIXTURE',actorUserId:'audit-admin',actorApplication:'admin',entityType:'organization',entityId:ORG_ID,occurredAt:NOW.toISOString(),traceId:'audit-trace',summary:'Fixture de auditoría Admin',revision:1}],
    },
    analytics:{activeClients:2,averageAdherence:82,churn30d:0,conversionRate:50},
    revision:3,
  };
}

function stateFor(area){
  const base=createProductionState();
  const identity={id:'audit-admin',role:'admin',name:'Admin Auditor'};
  const admin=projectAdminSnapshot(rawAdmin(),identity);
  return createProductionState({
    hydration:{status:'ready',error:null,confirmedAt:NOW.toISOString(),serverTime:NOW.toISOString()},
    identity,
    environment:'AUDIT_READ_ONLY',
    canary:{active:false,scope:null,version:'admin-action-audit'},
    admin,
    selectedClientId:null,
    activeArea:area,
    collections:{
      ...base.collections,
      clients:[
        {id:CLIENT_ID,name:'Cliente con Coach',email:'client1.audit@iberfit.invalid',modalidad:'Híbrido',status:'activo'},
        {id:CLIENT_ID_UNASSIGNED,name:'Cliente sin Coach',email:'client2.audit@iberfit.invalid',modalidad:'Online',status:'activo'},
      ],
      appointments:[{id:'appointment-audit',clientId:CLIENT_ID,startAt:'2026-09-06T16:00:00Z',status:'confirmed'}],
    },
  });
}

function uniq(values){return [...new Set(values)];}
function buttonCount(html){return (String(html).match(/<button\b/gi)||[]).length;}
function formKinds(html){return uniq([...String(html).matchAll(/data-admin-form=["']([^"']+)["']/gi)].map((match)=>match[1]));}

function auditRoute(area){
  const state=stateFor(area);
  const decision=resolveM26Route(state,area);
  if(!decision.allowed||decision.area!==area)throw new Error(`ADMIN_ROUTE_GUARD_FAILED:${area}:${decision.area}:${decision.reason||'unknown'}`);

  const shell=createShellViewModel(state);
  const vm=createRouteViewModel(shell,state,NOW,{catalog:[]});
  if(vm?.admin!==true)throw new Error(`ADMIN_VM_NOT_ADMIN:${area}`);
  if(['admin-unavailable','admin-forbidden','placeholder'].includes(String(vm?.kind||''))){
    throw new Error(`ADMIN_VM_NOT_OPERATIONAL:${area}:${vm?.kind||'unknown'}`);
  }

  const html=renderRouteView(vm);
  if(/Administración no disponible|Permiso insuficiente|Esta sección no está disponible/u.test(html)){
    throw new Error(`ADMIN_RENDER_FALLBACK:${area}`);
  }
  if(/<script\b/i.test(html))throw new Error(`ADMIN_SCRIPT_TAG:${area}`);
  if(/\bon(?:click|load|error|submit|change|input)\s*=/i.test(html))throw new Error(`ADMIN_INLINE_HANDLER:${area}`);
  if(/javascript\s*:/i.test(html))throw new Error(`ADMIN_JAVASCRIPT_URL:${area}`);

  const interaction=auditInteractiveMarkup(html);
  const hard=interaction.errors.filter((item)=>item!=='DISABLED_ARIA_REQUIRED');
  if(hard.length)throw new Error(`ADMIN_INTERACTIVE_CONTRACT:${area}:${uniq(hard).join(',')}`);

  const buttons=buttonCount(html);
  const forms=formKinds(html);
  if(ACTIONABLE_AREAS.includes(area)&&buttons===0)throw new Error(`ADMIN_ACTION_BUTTONS_MISSING:${area}`);

  return Object.freeze({area,kind:vm.kind,buttons,formKinds:Object.freeze(forms),interactiveErrors:Object.freeze(interaction.errors)});
}

function markdown(report){
  const lines=[
    '# IBERFIT M26 · Auditoría de acciones Admin',
    '',
    `- Generada: ${report.generatedAt}`,
    `- Versión: ${report.version}`,
    `- Resultado: **${report.ok?'PASS':'FAIL'}**`,
    `- Rutas Admin operativas: ${report.coverage.audited}/${report.coverage.allowed}`,
    `- Rutas con acciones exigidas: ${report.coverage.actionableAudited}/${report.coverage.actionableExpected}`,
    `- Botones inspeccionados: ${report.coverage.interactiveButtons}`,
    `- Tipos de formulario Admin inspeccionados: ${report.coverage.formKinds.length}`,
    '',
    '## Cobertura por ruta',
    '',
  ];
  for(const route of report.routes){
    lines.push(`- **${route.area}** · ${route.kind}: ${route.buttons} botones · ${route.formKinds.length} tipos de formulario.`);
  }
  lines.push('','## Contratos de acciones','');
  for(const kind of REQUIRED_FORM_KINDS){
    lines.push(`- ${report.coverage.formKinds.includes(kind)?'PASS':'FAIL'} · ${kind}`);
  }
  lines.push('','> Read-only: renderiza fixtures Admin con permisos explícitos; no autentica cuentas reales, no ejecuta comandos de dominio y no modifica producción.');
  return `${lines.join('\n')}\n`;
}

async function main(){
  const allowed=Object.keys(M26_AREAS).filter((area)=>areaAllowedForRole(area,ROLE));
  const routes=[];
  const failures=[];
  for(const area of allowed){
    try{routes.push(auditRoute(area));}
    catch(error){failures.push({area,error:error?.message||String(error)});}
  }

  const allFormKinds=uniq(routes.flatMap((route)=>route.formKinds));
  const missingFormKinds=REQUIRED_FORM_KINDS.filter((kind)=>!allFormKinds.includes(kind));
  const actionableAudited=routes.filter((route)=>ACTIONABLE_AREAS.includes(route.area)&&route.buttons>0).length;
  if(missingFormKinds.length)failures.push({area:'admin-actions',error:`ADMIN_FORM_CONTRACT_MISSING:${missingFormKinds.join(',')}`});
  if(actionableAudited!==ACTIONABLE_AREAS.length)failures.push({area:'admin-actions',error:`ADMIN_ACTIONABLE_ROUTE_GAP:${actionableAudited}/${ACTIONABLE_AREAS.length}`});

  const report={
    schema:'iberfit-m26-admin-action-surface-audit-v1',
    version:VERSION,
    generatedAt:new Date().toISOString(),
    ok:failures.length===0,
    failures,
    routes,
    coverage:{
      allowed:allowed.length,
      audited:routes.length,
      actionableExpected:ACTIONABLE_AREAS.length,
      actionableAudited,
      interactiveButtons:routes.reduce((sum,route)=>sum+route.buttons,0),
      formKinds:allFormKinds,
      requiredFormKinds:[...REQUIRED_FORM_KINDS],
      missingFormKinds,
    },
  };

  await fs.mkdir(OUT_DIR,{recursive:true});
  await fs.writeFile(OUT_JSON,`${JSON.stringify(report,null,2)}\n`);
  const md=markdown(report);
  await fs.writeFile(OUT_MD,md);
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,md);

  console.log(`IBERFIT_ADMIN_ACTION_AUDIT=${report.ok?'PASS':'FAIL'}`);
  console.log(`ADMIN_ROUTES=${report.coverage.audited}/${report.coverage.allowed}`);
  console.log(`ADMIN_ACTIONABLE=${report.coverage.actionableAudited}/${report.coverage.actionableExpected}`);
  console.log(`ADMIN_BUTTONS=${report.coverage.interactiveButtons}`);
  console.log(`ADMIN_FORM_KINDS=${report.coverage.formKinds.length}`);
  if(!report.ok){
    for(const failure of failures)console.error(`${failure.area}: ${failure.error}`);
    process.exitCode=1;
  }
}

await main();
