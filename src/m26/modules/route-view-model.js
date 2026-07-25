import { clientsOverview, clientHealthSummary, todayOverview, domainValue, domainDate, domainStatus, recordsForClient } from './domain-selectors.js';
import { computeProgressSummary, buildProgressTimeline, deriveAdherenceAlerts, adherenceSignal, buildVerificationCenter, engagementCapabilities } from '../engagement/index.js';
import {clientModalityLabel} from '../domain/modality.js';
import {
  appointmentStatusLabel,
  normalizeAppointmentRecord,
} from '../domain/appointment.js';
import {buildWearableViewModel} from '../wearables/view-model.js';
import {IBERFIT_UI_LOCALE,castilianStatusLabel} from '../ui/castellano.js';
import {deriveAgeYears} from '../workflows/iri-profile.js';
import {publicationSummary,publicationCounts} from '../workflows/publication-workflow.js';
import {clientContentView} from '../publication/client-content.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function dateLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat(IBERFIT_UI_LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function text(record, ...keys) { return domainValue(record, ...keys); }
function statusLabel(record, fallback = 'Sin estado') { return castilianStatusLabel(domainStatus(record), fallback); }
function compactAppointment(record) {
  const appointment=normalizeAppointmentRecord(record);

  return {
    id:appointment.id,
    clientId:appointment.clientId,
    sessionId:appointment.sessionId,
    title:appointment.title,
    date:appointment.startAt,
    dateLabel:dateLabel(appointment.startAt),
    status:appointmentStatusLabel(appointment.status),
    statusRaw:appointment.status,
    location:appointment.location,
    modality:appointment.modalityLabel,
  };
}
function compactSummary(summary) {
  const client = summary.client || {};
  return {
    id: client.id,
    name: text(client, 'name', 'nombre') || 'Cliente sin nombre',
    modality: clientModalityLabel(text(client, 'modality', 'modalidad')), 
    status: statusLabel(client),
    access: summary.access ? statusLabel(summary.access) : 'Sin acceso configurado',
    iri: summary.iri ? {
      score: text(summary.iri, 'score', 'puntuacion', 'totalScore', 'total_score'),
      quality: text(summary.iri, 'quality', 'calidad'),
      classification: text(summary.iri, 'classification', 'clasificacion'),
      status: statusLabel(summary.iri),
    } : null,
    cycle: summary.cycle ? {
      name: text(summary.cycle, 'name', 'nombre', 'title', 'titulo') || 'Ciclo de entrenamiento',
      status: statusLabel(summary.cycle),
    } : null,
    report: summary.report ? {
      title: text(summary.report, 'title', 'titulo', 'name', 'nombre') || 'Informe IBERFIT',
      status: statusLabel(summary.report),
    } : null,
    nextAppointment: summary.nextAppointment ? compactAppointment(summary.nextAppointment) : null,
    counts: clone(summary.counts),
    profile: clone(summary.profile),
  };
}
function routeClientId(shellVm,state){return shellVm.identity?.role==='client'?state.identity?.clientId:state.selectedClientId;}
function installedCommands(state){
  const candidates=[state?.environment?.commandRegistry,state?.environment?.installedCommands,state?.canary?.commandRegistry,state?.canary?.installedCommands];
  return candidates.find(Array.isArray)||[];
}
function compactActivity(record){return {id:text(record,'id'),clientId:text(record,'clientId','client_id'),title:text(record,'title','name','nombre')||'Registro',status:statusLabel(record),statusRaw:domainStatus(record),revision:Number(text(record,'revision')||0),date:domainDate(record),dateLabel:dateLabel(domainDate(record)),body:clone(record?.body||record),raw:clone(record)};}
function publicationItems(records,entity,role){return records.map((record)=>{const clientContent=clientContentView(entity,record);if(role==='client')return Object.freeze({id:clientContent.id,clientId:text(record,'clientId','client_id'),title:clientContent.title,clientContent});return Object.freeze({...compactActivity(record),publication:publicationSummary({entity,record,role}),clientContent});});}

export function createRouteViewModel(shellVm, state, now = new Date(), options = {}) {
  const area = shellVm.activeArea;
  if (area === 'hoy') {
    const overview = todayOverview(state, now);
    const clientId=routeClientId(shellVm,state);
    const alerts=clientId?deriveAdherenceAlerts(state,clientId,{now}):[];
    return Object.freeze({
      kind: 'hoy',
      role: overview.role,
      appointments: Object.freeze(overview.appointments.map(compactAppointment)),
      upcoming: Object.freeze(overview.upcoming.map(compactAppointment)),
      clients: Object.freeze(overview.summaries.map(compactSummary)),
      operations: Object.freeze(overview.operations),
      alerts:Object.freeze(alerts),alertSignal:Object.freeze(adherenceSignal(alerts)),
      serverTime: state?.hydration?.serverTime || null,
    });
  }
  if (area === 'clientes') {
    return Object.freeze({
      kind: 'clientes',
      clients: Object.freeze(clientsOverview(state).map(compactSummary)),
      selectedClientId: state.selectedClientId || null,
    });
  }
  if (area === 'expediente') {
    const summary = clientHealthSummary(state, state.selectedClientId);
    const progress=state.selectedClientId?computeProgressSummary(state,state.selectedClientId,{now}):null;
    const alerts=state.selectedClientId?deriveAdherenceAlerts(state,state.selectedClientId,{now}):[];
    return Object.freeze({ kind: 'expediente', summary: summary ? compactSummary(summary) : null, progress, alerts:Object.freeze(alerts), alertSignal:Object.freeze(adherenceSignal(alerts)) });
  }
  if(area==='progreso'){
    const clientId=routeClientId(shellVm,state);const summary=computeProgressSummary(state,clientId,{now});const alerts=deriveAdherenceAlerts(state,clientId,{now});
    return Object.freeze({kind:'progreso',clientId,summary,timeline:Object.freeze(buildProgressTimeline(state,clientId,{now})),alerts:Object.freeze(alerts),signal:Object.freeze(adherenceSignal(alerts))});
  }
  if(area==='actividad'){
    const clientId=routeClientId(shellVm,state);const role=String(shellVm.identity?.role||'');const capabilities=engagementCapabilities(installedCommands(state));
    const wearables=buildWearableViewModel({records:recordsForClient(state,'wearableDailySummaries',clientId),connections:recordsForClient(state,'wearableConnections',clientId),role,now});
    return Object.freeze({kind:'actividad',clientId,role,canManageHabits:['admin','coach'].includes(role),capabilities,wearables,checkins:Object.freeze(recordsForClient(state,'checkins',clientId).map(compactActivity)),habits:Object.freeze(recordsForClient(state,'habits',clientId).map(compactActivity)),habitLogs:Object.freeze(recordsForClient(state,'habitLogs',clientId).map(compactActivity))});
  }
  if(area==='notas'){
    const clientId=routeClientId(shellVm,state);const capabilities=engagementCapabilities(installedCommands(state));
    return Object.freeze({kind:'notas',clientId,capability:capabilities.privateNotes,notes:Object.freeze(recordsForClient(state,'privateNotes',clientId).map(compactActivity))});
  }
  if(area==='iri'){
    const clientId=routeClientId(shellVm,state);const assessments=recordsForClient(state,'iriAssessments',clientId).sort((a,b)=>String(domainDate(b)||'').localeCompare(String(domainDate(a)||'')));
    const current=assessments[0]||null;const profile=recordsForClient(state,'clientProfiles',clientId)[0]||null;
    return Object.freeze({kind:'iri',clientId,role:shellVm.identity?.role,current:clone(current),history:Object.freeze(assessments.map(compactActivity)),profile:clone(profile),canEdit:['admin','coach'].includes(String(shellVm.identity?.role||''))});
  }
  if(area==='planificacion'){
    const clientId=routeClientId(shellVm,state);const cycles=recordsForClient(state,'trainingCycles',clientId);const sessions=recordsForClient(state,'sessions',clientId);
    const role=String(shellVm.identity?.role||'');return Object.freeze({kind:'planificacion',clientId,role,canEdit:['admin','coach'].includes(role),cycles:Object.freeze(publicationItems(cycles,'planning',role)),sessions:Object.freeze(publicationItems(sessions,'session',role)),cycleCounts:publicationCounts(cycles),sessionCounts:publicationCounts(sessions),currentCycle:clone(cycles[0]||null)});
  }
  if(area==='agenda'){
    const appointments=(state?.collections?.appointments||[]).map(compactAppointment);
    return Object.freeze({kind:'agenda',role:shellVm.identity?.role,appointments:Object.freeze(appointments),clients:Object.freeze(clientsOverview(state).map(compactSummary)),selectedClientId:state.selectedClientId||null});
  }
  if(area==='sesion'){
    const clientId=routeClientId(shellVm,state);const sessions=recordsForClient(state,'sessions',clientId);const executions=recordsForClient(state,'sessionExecutions',clientId);
    const role=String(shellVm.identity?.role||'');return Object.freeze({kind:'sesion',clientId,role,canBuild:['admin','coach'].includes(role),sessions:Object.freeze(publicationItems(sessions,'session',role)),sessionCounts:publicationCounts(sessions),executions:Object.freeze(executions.map(compactActivity))});
  }
  if(area==='informes'){
    const clientId=routeClientId(shellVm,state);const reports=recordsForClient(state,'reports',clientId);
    const role=String(shellVm.identity?.role||'');const iri=recordsForClient(state,'iriAssessments',clientId).sort((a,b)=>String(domainDate(b)||'').localeCompare(String(domainDate(a)||'')))[0]||null;const reportItems=publicationItems(reports,'report',role);return Object.freeze({kind:'informes',clientId,role,canManage:['admin','coach'].includes(role),reports:Object.freeze(role==='client'?reportItems:reportItems.map((item)=>Object.freeze({...item,visibility:text(item.raw,'visibility','audience')||null}))),reportCounts:publicationCounts(reports),latestIri:clone(iri)});
  }
  if(area==='inteligencia'){
    const clientId=routeClientId(shellVm,state);const runs=recordsForClient(state,'intelligenceRuns',clientId);
    const summary=clientId?computeProgressSummary(state,clientId,{now}):null;const alerts=clientId?deriveAdherenceAlerts(state,clientId,{now}):[];
    const profile=recordsForClient(state,'clientProfiles',clientId)[0]||null;
    const birthDate=text(profile,'birthDate','birth_date');
    let ageYears=null;try{if(birthDate)ageYears=deriveAgeYears(birthDate,now.toISOString().slice(0,10));}catch{}
    return Object.freeze({kind:'inteligencia',clientId,role:shellVm.identity?.role,runs:Object.freeze(runs.map(compactActivity)),summary,alerts:Object.freeze(alerts),profile:clone(profile),ageYears,birthDate:birthDate||null,canGenerate:['admin','coach'].includes(String(shellVm.identity?.role||''))});
  }
  if(area==='biblioteca'){
    const catalog=Array.isArray(options.catalog)?options.catalog:[];
    return Object.freeze({kind:'biblioteca',role:shellVm.identity?.role,catalog:Object.freeze(catalog.map((item)=>clone(item))),total:catalog.length});
  }
  if(area==='verificacion')return Object.freeze({kind:'verificacion',center:buildVerificationCenter(state)});
  return Object.freeze({ kind: 'placeholder', area, title: shellVm.page.title });
}
