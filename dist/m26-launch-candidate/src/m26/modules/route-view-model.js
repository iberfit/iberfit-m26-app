import { clientsOverview, clientHealthSummary, todayOverview, domainValue, domainDate, domainStatus, recordsForClient } from './domain-selectors.js';
import { computeProgressSummary, buildProgressTimeline, deriveAdherenceAlerts, adherenceSignal, buildVerificationCenter, engagementCapabilities } from '../engagement/index.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function dateLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function text(record, ...keys) { return domainValue(record, ...keys); }
function statusLabel(record, fallback = 'Sin estado') {
  const status = domainStatus(record);
  if (!status) return fallback;
  const labels = {
    activo: 'Activo', active: 'Activo', borrador: 'Borrador', draft: 'Borrador',
    publicado: 'Publicado', published: 'Publicado', completado: 'Completado', completed: 'Completado',
    confirmado: 'Confirmado', confirmed: 'Confirmado', pendiente: 'Pendiente', pending: 'Pendiente',
    sin_acceso: 'Sin acceso', invitacion_pendiente: 'Invitación pendiente', suspendido: 'Suspendido', revocado: 'Revocado',
  };
  return labels[status] || status.replaceAll('_', ' ');
}
function compactAppointment(record) {
  return {
    id: text(record, 'id') || null,
    title: text(record, 'title', 'titulo', 'name', 'nombre') || 'Sesión IBERFIT',
    date: domainDate(record),
    dateLabel: dateLabel(domainDate(record)),
    status: statusLabel(record),
    location: text(record, 'location', 'ubicacion', 'modalidad') || null,
  };
}
function compactSummary(summary) {
  const client = summary.client || {};
  return {
    id: client.id,
    name: text(client, 'name', 'nombre') || 'Cliente sin nombre',
    modality: text(client, 'modality', 'modalidad') || 'Sin modalidad',
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
function compactActivity(record){return {id:text(record,'id'),title:text(record,'title','name','nombre')||'Registro',status:statusLabel(record),date:domainDate(record),dateLabel:dateLabel(domainDate(record)),body:clone(record?.body||record)};}

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
    const clientId=routeClientId(shellVm,state);const capabilities=engagementCapabilities(installedCommands(state));
    return Object.freeze({kind:'actividad',clientId,role:shellVm.identity?.role,canManageHabits:['admin','coach'].includes(String(shellVm.identity?.role||'')),capabilities,checkins:Object.freeze(recordsForClient(state,'checkins',clientId).map(compactActivity)),habits:Object.freeze(recordsForClient(state,'habits',clientId).map(compactActivity)),habitLogs:Object.freeze(recordsForClient(state,'habitLogs',clientId).map(compactActivity))});
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
    return Object.freeze({kind:'planificacion',clientId,role:shellVm.identity?.role,canEdit:['admin','coach'].includes(String(shellVm.identity?.role||'')),cycles:Object.freeze(cycles.map(compactActivity)),sessions:Object.freeze(sessions.map(compactActivity)),currentCycle:clone(cycles[0]||null)});
  }
  if(area==='agenda'){
    const appointments=(state?.collections?.appointments||[]).map((item)=>({...compactAppointment(item),clientId:text(item,'clientId','client_id')}));
    return Object.freeze({kind:'agenda',role:shellVm.identity?.role,appointments:Object.freeze(appointments),clients:Object.freeze(clientsOverview(state).map(compactSummary)),selectedClientId:state.selectedClientId||null});
  }
  if(area==='sesion'){
    const clientId=routeClientId(shellVm,state);const sessions=recordsForClient(state,'sessions',clientId);const executions=recordsForClient(state,'sessionExecutions',clientId);
    return Object.freeze({kind:'sesion',clientId,role:shellVm.identity?.role,canBuild:['admin','coach'].includes(String(shellVm.identity?.role||'')),sessions:Object.freeze(sessions.map(compactActivity)),executions:Object.freeze(executions.map(compactActivity))});
  }
  if(area==='informes'){
    const clientId=routeClientId(shellVm,state);const reports=recordsForClient(state,'reports',clientId);
    return Object.freeze({kind:'informes',clientId,role:shellVm.identity?.role,reports:Object.freeze(reports.map((item)=>({...compactActivity(item),visibility:text(item,'visibility','audience')||null})))});
  }
  if(area==='inteligencia'){
    const clientId=routeClientId(shellVm,state);const runs=recordsForClient(state,'intelligenceRuns',clientId);
    const summary=clientId?computeProgressSummary(state,clientId,{now}):null;const alerts=clientId?deriveAdherenceAlerts(state,clientId,{now}):[];
    return Object.freeze({kind:'inteligencia',clientId,role:shellVm.identity?.role,runs:Object.freeze(runs.map(compactActivity)),summary,alerts:Object.freeze(alerts),canGenerate:['admin','coach'].includes(String(shellVm.identity?.role||''))});
  }
  if(area==='biblioteca'){
    const catalog=Array.isArray(options.catalog)?options.catalog:[];
    return Object.freeze({kind:'biblioteca',role:shellVm.identity?.role,catalog:Object.freeze(catalog.slice(0,120).map((item)=>clone(item))),total:catalog.length});
  }
  if(area==='verificacion')return Object.freeze({kind:'verificacion',center:buildVerificationCenter(state)});
  return Object.freeze({ kind: 'placeholder', area, title: shellVm.page.title });
}
