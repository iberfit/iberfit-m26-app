import {appointmentModalityLabel,clientModalityLabel,normalizeAppointmentModality,normalizeClientModality} from '../domain/modality.js';
import {deriveAdminOperationsTriage} from './operation-triage.js';
import {deriveAdminAuditTimeline} from './audit-experience.js';
const e=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const safeJson=(value)=>JSON.stringify(value??null).replaceAll('&','\\u0026').replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('\\u2028','\\u2028').replaceAll('\\u2029','\\u2029');
const badge=(v)=>`<span class="m26-admin-badge">${e(v||'Sin estado')}</span>`;
const empty=(t,c)=>`<section class="m26-admin-empty"><h3>${e(t)}</h3><p>${e(c)}</p></section>`;
const stat=(t,v)=>`<article class="m26-admin-stat"><span>${e(t)}</span><strong>${e(v)}</strong></article>`;
const intro=(k,t,c)=>`<section class="m26-admin-hero"><p class="m26-eyebrow">${e(k)}</p><h2>${e(t)}</h2><p>${e(c)}</p></section>`;
const rows=(headers,items,{className='',scrollLabel=''}={})=>`<div class="m26-admin-table${className?' '+e(className):''}"${scrollLabel?` role="region" aria-label="${e(scrollLabel)}" tabindex="0"`:''}><table><thead><tr>${headers.map((h)=>`<th${scrollLabel?' scope="col"':''}>${e(h)}</th>`).join('')}</tr></thead><tbody>${items.join('')}</tbody></table></div>`;
function form(kind,fields,button,{attrs='',submitAttrs=''}={}){return `<form data-admin-form="${kind}" data-guided-required-form class="m26-admin-form" ${attrs}>${fields}<p class="m26-field-help" data-guided-required-progress aria-live="polite"></p><button type="submit" ${submitAttrs}>${e(button)}</button></form>`;}
function adminStatusLabel(value){
  const key=String(value||'').trim().toLowerCase();
  return ({
    active:'Activo',
    suspended:'Suspendido',
    inactive:'Inactivo',
    pending:'Pendiente',
    ended:'Finalizado',
    paused:'En pausa',
    onboarding:'Incorporación',
    reactivation:'Reactivación',
    new:'Nuevo',
    contacted:'Contactado',
    qualified:'Cualificado',
    evaluation:'Evaluación',
    won:'Ganado',
    lost:'Perdido',
  })[key]||String(value||'Sin estado');
}
function adminAgendaModalityLabel(value){
  const raw=String(value??'').trim();
  if(!raw)return 'No indicada';
  if(normalizeAppointmentModality(raw))return appointmentModalityLabel(raw);
  if(normalizeClientModality(raw))return clientModalityLabel(raw);
  return raw;
}
function adminAgendaStatusLabel(value){
  const raw=String(value??'').trim();
  const key=raw.toLowerCase().replace(/[\s-]+/gu,'_');
  return ({
    scheduled:'Programada',
    confirmed:'Confirmada',
    completed:'Completada',
    cancelled:'Cancelada',
    canceled:'Cancelada',
    rescheduled:'Reprogramada',
    no_show:'No asistió',
  })[key]||adminStatusLabel(raw);
}
function adminRoleLabel(value){
  const key=String(value||'').trim().toLowerCase();
  return ({client:'Cliente',coach:'Coach',admin:'Admin'})[key]||String(value||'Sin rol');
}
function adminDateLabel(value,{timeZone='America/Santiago',locale='es-CL'}={}){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return String(value);
  try{
    return new Intl.DateTimeFormat(String(locale||'es-CL'),{
      timeZone:String(timeZone||'America/Santiago'),
      day:'2-digit',
      month:'short',
      year:'numeric',
      hour:'2-digit',
      minute:'2-digit',
      hour12:false,
    }).format(date).replace(/,\s*/u,' · ');
  }catch{
    return String(value);
  }
}
function commandPriority(item){
  const action=item?.action||{};
  return `<article class="m26-admin-priority is-${e(item.kind||'process')}"><div><p class="m26-eyebrow">${e(item.stageLabel||'Seguimiento')}</p><h3>${e(item.clientName||'Cliente')}</h3><p>${e(action.reason||'Revisión pendiente')}</p><small>${e(item.coachNames?.length?`Coach: ${item.coachNames.join(', ')}`:'Sin Coach asignado')}</small></div><button type="button" data-m26-area="${e(action.area||'admin-clientes')}">${e(action.label||'Revisar')}</button></article>`;
}
function coachLoadCard(item){
  const value=item.loadPercent==null?'Sin capacidad definida':`${item.loadPercent}%`;
  const detail=item.capacityHours==null?`${item.clientCount} clientes`:`${item.assignedHours} de ${item.capacityHours} h · ${item.clientCount} clientes`;
  return `<article class="m26-admin-coach-load is-${e(item.status||'unknown')}"><div><strong>${e(item.coachName)}</strong><small>${e(detail)}</small></div><span>${e(value)}</span></article>`;
}
function coachClientList(items=[]){
  return items.length
    ?`<ul class="m26-admin-coach360-clients">${items.map((client)=>`<li><div><strong>${e(client.name)}</strong><small>${e([client.modality,client.status].filter(Boolean).join(' · ')||client.email||'Cliente activo')}</small></div><span>${e(client.nextActionLabel||'Seguimiento')}</span></li>`).join('')}</ul>`
    :empty('Sin clientes asignados','Este Coach no tiene clientes activos asignados.');
}
function coachSessionList(items=[],emptyTitle='Sin sesiones programadas'){
  return items.length
    ?`<div class="m26-admin-coach360-sessions">${items.map((session)=>`<article><div><strong>${e(session.clientName||session.title||'Entrenamiento')}</strong><small>${e([session.startAt,session.modality,session.location].filter(Boolean).join(' · ')||'Fecha por confirmar')}</small></div>${badge(session.status||'Programada')}</article>`).join('')}</div>`
    :empty(emptyTitle,'La agenda del Coach no contiene sesiones visibles en este periodo.');
}
function coach360Card(coach={}){
  const load=coach.loadPercent==null?'Capacidad sin definir':`${coach.loadPercent}% de carga`;
  const hours=coach.capacityHours==null?'Horas no configuradas':`${coach.assignedHours??0} / ${coach.capacityHours} h asignadas`;
  const initial=String(coach.name||'C').trim().slice(0,1).toUpperCase();
  const progress=coach.loadPercent==null?'':`<progress class="m26-admin-coach360-progress" max="100" value="${e(Math.min(100,Math.max(0,coach.loadPercent)))}">${e(coach.loadPercent)}%</progress>`;
  return `<details class="m26-admin-coach360" data-admin-coach-id="${e(coach.coachId||coach.id||'')}">
    <summary>
      <span class="m26-admin-coach360-avatar" aria-hidden="true">${e(initial)}</span>
      <span class="m26-admin-coach360-identity"><span class="m26-eyebrow">Coach IBERFIT</span><strong>${e(coach.name||'Coach')}</strong><small>${e(coach.email||'Perfil profesional')}</small></span>
      <span class="m26-admin-coach360-summary-metric"><strong>${e(coach.clientCount||0)}</strong><small>clientes</small></span>
      <span class="m26-admin-coach360-summary-metric"><strong>${e(coach.upcomingCount||0)}</strong><small>próximas</small></span>
      <span class="m26-admin-coach360-open">Ver perfil</span>
    </summary>
    <div class="m26-admin-coach360-body">
      <header class="m26-admin-coach360-header"><div><p class="m26-eyebrow">Perfil operativo</p><h3>${e(coach.name||'Coach')}</h3><p>${e(coach.email||'Sin correo visible')}</p></div>${badge(coach.status||'Sin estado')}</header>
      <section class="m26-admin-coach360-kpis" aria-label="Indicadores del Coach">
        ${stat('Clientes activos',coach.clientCount||0)}
        ${stat('Próximas sesiones',coach.upcomingCount||0)}
        ${stat('Sesiones completadas',coach.completedCount||0)}
        ${stat('Carga',load)}
      </section>
      <section class="m26-admin-coach360-load"><div><strong>Capacidad de servicio</strong><small>${e(hours)}</small></div>${progress}</section>
      <div class="m26-admin-coach360-columns">
        <section><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Cartera</p><h4>Clientes asignados</h4></div>${badge(`${coach.clientCount||0} activos`)}</div>${coachClientList(coach.clients)}</section>
        <section><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Agenda</p><h4>Próximos entrenamientos</h4></div>${badge(`${coach.upcomingCount||0} próximos`)}</div>${coachSessionList(coach.upcomingSessions)}</section>
      </div>
      <section class="m26-admin-coach360-recent"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Histórico reciente</p><h4>Últimos entrenamientos</h4></div></div>${coachSessionList(coach.recentSessions,'Sin entrenamientos recientes')}</section>
      <footer class="m26-admin-coach360-actions"><button type="button" class="m26-primary-action" data-m26-area="admin-agenda">Abrir agenda global</button><button type="button" data-m26-area="admin-clientes">Gestionar clientes</button></footer>
    </div>
  </details>`;
}
function operationStatusLabel(status){
  return ({open:'Abierta',pending:'Pendiente',in_progress:'En curso',resolved:'Resuelta',cancelled:'Cancelada',canceled:'Cancelada',closed:'Cerrada'})[String(status||'').toLowerCase()]||String(status||'Sin estado');
}
function operationItem(item,{canManage=false}={}){
  const task=item.task||{};
  const title=task.title||task.type||'Incidencia sin título';
  const deadline=item.dueLabel?`${item.overdue?'Vencida':item.dueToday?'Vence hoy':'Límite'} · ${item.dueLabel}`:
    (task.dueAt?'Fecha límite no verificable':'Sin plazo definido');
  const outcome=!item.open&&task.resolutionNote
    ?`<p class="m26-admin-operation-outcome"><strong>Resolución:</strong> ${e(task.resolutionNote)}</p>`:'';
  const resolve=canManage&&item.open?form('task-resolve',
    `<input type="hidden" name="taskId" value="${e(task.id)}"><input type="hidden" name="baseRevision" value="${e(task.revision||0)}"><label>Motivo de resolución<input name="reason" minlength="3" required maxlength="500" placeholder="Qué se resolvió y cómo"></label>`,'Resolver incidencia'):'';
  return `<article class="m26-admin-operation-item${item.overdue?' is-overdue':''}" data-admin-operation-status="${item.open?'open':'closed'}" data-admin-operation-priority="${e(String(task.priority||'normal').toLowerCase())}">
    <div class="m26-admin-operation-top"><div class="m26-admin-operation-title"><span class="m26-eyebrow">${e(operationStatusLabel(task.status))}</span><h3>${e(title)}</h3></div><strong class="m26-admin-operation-priority" data-priority="${item.priorityRank===0?'critical':item.priorityRank===1?'high':'normal'}">${e(item.priorityLabel)}</strong></div>
    ${task.detail?`<p class="m26-admin-operation-detail">${e(task.detail)}</p>`:''}
    <div class="m26-admin-operation-meta"><span>${e(item.ownerLabel)}</span><span${item.overdue?' data-operation-overdue="true"':''}>${e(deadline)}</span></div>
    ${outcome}${resolve}
  </article>`;
}
function renderOperations(vm){
  const triage=vm.operationTriage||deriveAdminOperationsTriage({tasks:vm.tasks||[],timeZone:vm.organization?.timezone||'America/Santiago'});
  const summary=triage.summary;
  const create=vm.canManage?form('task-create',
    `<label>Prioridad<select name="priority"><option value="normal">Normal</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label><label>Tipo<input name="taskType" value="manual_review" maxlength="80" required></label><label>Título<input name="title" maxlength="200" required placeholder="Qué requiere atención"></label><label>Detalle<textarea name="detail" maxlength="2000" placeholder="Contexto verificable para resolverla"></textarea></label>`,'Crear incidencia'):'';
  const pending=triage.open.length
    ?`<div class="m26-admin-operation-list">${triage.open.map((item)=>operationItem(item,{canManage:vm.canManage})).join('')}</div>`
    :empty('Sin incidencias pendientes','No existen tareas operativas abiertas con los datos actuales.');
  const history=triage.history.length
    ?`<details class="m26-admin-operation-history"><summary>Historial de incidencias · ${summary.history}</summary><div class="m26-admin-operation-list">${triage.history.map((item)=>operationItem(item)).join('')}</div></details>`
    :'';
  return `<div class="m26-admin-route m26-admin-operations" data-admin-surface="operations">
    ${intro('Operación verificada','Centro operativo','Incidencias reales ordenadas por gravedad y plazo. Los estados resueltos permanecen consultables, pero no se presentan como pendientes.')}
    <section class="m26-admin-operation-overview" aria-label="Resumen operativo">
      ${stat('Abiertas',summary.open)}
      ${stat('Críticas',summary.critical)}
      ${stat('Vencidas',summary.overdue)}
      ${stat('Sin responsable',summary.unassigned)}
    </section>
    <section class="m26-admin-panel" aria-labelledby="m26-operations-open-title"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Acción prioritaria</p><h2 id="m26-operations-open-title">Pendientes · ${summary.open}</h2><p>Primero las críticas, después las próximas decisiones con plazo.</p></div></div>${pending}</section>
    ${create?`<details class="m26-admin-operation-create"><summary>Nueva incidencia manual</summary>${create}</details>`:''}
    ${history}
  </div>`;
}
function renderAuditEvent(item){
  const raw=item.event||{};
  const details=[
    ['Tipo de evento',raw.eventType],['ID del actor',raw.actorUserId],
    ['Tipo de entidad',raw.entityType],['ID de entidad',raw.entityId],
    ['ID de trazabilidad',raw.traceId],['Revisión',raw.revision],
  ].filter(([,value])=>value!==undefined&&value!==null&&String(value).trim()!=='');
  return `<li class="m26-admin-audit-entry">
    <article>
      <div class="m26-admin-audit-event-head"><div><p class="m26-eyebrow">${e(item.applicationLabel)}</p><h3>${e(item.title)}</h3></div><time${item.dateIso?` datetime="${e(item.dateIso)}"`:''}>${e(item.dateLabel)}</time></div>
      <div class="m26-admin-audit-event-context"><span><strong>Actor</strong> ${e(item.actorLabel)}</span><span><strong>Entidad</strong> ${e(item.entityLabel)}</span><span><strong>Resultado</strong> ${e(item.resultLabel)}</span></div>
      ${details.length?`<details class="m26-admin-audit-evidence"><summary>Ver identificadores de trazabilidad</summary><dl>${details.map(([name,value])=>`<div><dt>${e(name)}</dt><dd><code>${e(value)}</code></dd></div>`).join('')}</dl></details>`:''}
    </article>
  </li>`;
}
function renderAudit(vm){
  const timeline=vm.auditTimeline||deriveAdminAuditTimeline({
    events:vm.events||[],timeZone:vm.organization?.timezone,locale:vm.organization?.locale,
  });
  const count=timeline.summary.total;
  const content=count?`<ol class="m26-admin-audit-timeline">${timeline.events.map(renderAuditEvent).join('')}</ol>`:
    empty('Sin eventos','No hay auditoría visible en los registros autorizados.');
  return `<div class="m26-admin-route m26-admin-audit-route" data-admin-surface="audit">
    ${intro('Seguridad y responsabilidad','Auditoría','Quién intervino, sobre qué entidad y cuándo. El resultado no se presupone cuando el registro no lo contiene.')}
    <section class="m26-admin-panel" aria-labelledby="m26-admin-audit-title">
      <div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Trazabilidad</p><h2 id="m26-admin-audit-title">Actividad registrada · ${count}</h2><p>Registros recibidos del backend, sin modificaciones ni deducciones de éxito.</p></div></div>
      ${content}
    </section>
  </div>`;
}
function renderHome(vm){
  const cc=vm.commandCenter||{summary:{},priorities:[],coachLoad:[]};
  const s=cc.summary||{};
  const triage=vm.operationTriage||deriveAdminOperationsTriage({
    tasks:vm.tasks||[],timeZone:vm.organization?.timezone||'America/Santiago',
  });
  const urgent=triage.open.filter((item)=>item.priorityRank<=1||item.overdue);
  const urgentRows=urgent.slice(0,3).map((item)=>{
    const task=item.task||{};
    const context=[item.priorityLabel,item.overdue?'Vencida':item.dueToday?'Vence hoy':null,item.ownerLabel].filter(Boolean).join(' · ');
    return `<li class="m26-admin-command-urgent-row"><div><strong>${e(task.title||task.type||'Incidencia')}</strong><small>${e(context)}</small></div><button type="button" data-m26-area="admin-operaciones">Revisar incidencia</button></li>`;
  }).join('');
  const urgency=urgent.length
    ?`<section class="m26-admin-command-urgent" aria-labelledby="m26-admin-urgent-title"><header><div><p class="m26-eyebrow">Incidencias verificadas</p><h4 id="m26-admin-urgent-title">Operación que requiere atención</h4></div>${badge(urgent.length===1?'1 incidencia prioritaria':String(urgent.length)+' incidencias prioritarias')}</header><ol>${urgentRows}</ol>${urgent.length>3?'<p class="m26-admin-command-more">Se muestran 3 de '+urgent.length+'. Consulta el centro operativo para revisar todas.</p>':''}</section>`
    :'';
  const clientCount=cc.priorities?.length||0;
  const priorities=clientCount?cc.priorities.slice(0,8).map(commandPriority).join(''):empty('Recorridos sin alertas','No hay recorridos de cliente que requieran una decisión administrativa.');
  const loads=cc.coachLoad?.length?cc.coachLoad.map(coachLoadCard).join(''):empty('Sin carga registrada','La capacidad del equipo aparecerá aquí cuando exista información.');
  const tasks=triage.open.slice(0,12).map((item)=>{
    const task=item.task||{};
    const context=[item.priorityLabel,item.overdue?'Vencida':item.dueToday?'Vence hoy':null,item.ownerLabel].filter(Boolean).join(' · ');
    return `<div class="m26-admin-list-item"><div><strong>${e(task.title||task.type||'Incidencia')}</strong><small>${e(context)}</small></div>${badge(operationStatusLabel(task.status))}</div>`;
  }).join('');
  const audit=deriveAdminAuditTimeline({
    events:vm.audit||[],timeZone:vm.organization?.timezone||'America/Santiago',
    locale:vm.organization?.locale||'es-CL',
  }).events.slice(0,8);
  const recentAudit=audit.map((item)=>`<div class="m26-admin-list-item"><strong>${e(item.title)}</strong><time${item.dateIso?(' datetime="'+e(item.dateIso)+'"'):''}>${e(item.dateLabel)}</time></div>`).join('');
  return `<div class="m26-admin-route m30-admin-command-route" data-admin-surface="command-center">
    ${intro('Dirección del servicio','IBERFIT Command Center','Prioridades verificadas, capacidad de equipo y trazabilidad. Primero lo que requiere una decisión.')}
    <section class="m26-admin-panel m26-admin-command m30-admin-decision-center" data-admin-priority-center aria-labelledby="m30-admin-priority-title">
      <div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Decisiones</p><h3 id="m30-admin-priority-title">Qué requiere atención ahora</h3><p>Incidencias abiertas por gravedad y plazo; después, recorridos de cliente por etapa y asignación.</p></div>${badge(clientCount?String(clientCount)+' clientes por revisar':'Clientes al día')}</div>
      ${urgency}
      <div class="m26-admin-command-client-heading"><h4>Seguimiento de clientes</h4>${clientCount>8?'<span>Primeros 8 de '+clientCount+'</span>':''}</div>
      <div class="m26-admin-priority-list">${priorities}</div>
      ${clientCount>8?'<p class="m26-admin-command-more">El resto de clientes está disponible en CRM y clientes.</p>':''}
    </section>
    <section class="m26-admin-stats m30-admin-kpis" aria-label="Indicadores de operación">
      ${stat('Clientes activos',s.activeClients??vm.summary?.activeClients??0)}
      ${stat('En pausa',s.pausedClients??0)}
      ${stat('Sin Coach',s.unassignedClients??0)}
      ${stat('IRI pendientes',s.iriPending??0)}
      ${stat('Planificaciones',s.planningPending??0)}
      ${stat('Sin próxima cita',s.schedulingPending??0)}
    </section>
    <section class="m26-admin-grid m30-admin-operations-grid">
      <article class="m26-admin-panel"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Equipo</p><h3>Capacidad de Coaches</h3></div><button type="button" data-m26-area="admin-equipo">Ver equipo</button></div><div class="m26-admin-load-list">${loads}</div></article>
      <article class="m26-admin-panel"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Operación</p><h3>Tareas abiertas</h3><p>${triage.summary.open>12?'Mostrando 12 de '+triage.summary.open:triage.summary.open+' en total'}</p></div>${badge(s.criticalTasks?String(s.criticalTasks)+' prioritarias':String(s.openTasks??triage.summary.open)+' abiertas')}<button type="button" data-m26-area="admin-operaciones">Ver incidencias</button></div>${tasks||empty('Sin tareas','No hay incidencias abiertas.')}</article>
    </section>
    <section class="m26-admin-panel m30-admin-audit"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Trazabilidad</p><h3>Actividad administrativa reciente</h3><p>Últimos registros visibles, sin presumir resultado.</p></div><button type="button" data-m26-area="admin-auditoria">Ver auditoría</button></div>${recentAudit||empty('Sin eventos','Todavía no hay actividad administrativa visible.')}</section>
  </div>`;
}
function adminClientAccessLabel(status){
  return ({
    sin_acceso:'Sin acceso',
    invitacion_pendiente:'Invitación pendiente',
    activo:'Acceso activo',
    suspendido:'Acceso suspendido',
    revocado:'Acceso revocado',
  })[String(status||'').trim().toLowerCase()]||String(status||'Sin acceso');
}
function renderUsers(vm){
  const summary=vm.user360Summary||{total:vm.users.length,activeUsers:0,pendingInvitations:0,integrityIssueCount:0};
  const cards=vm.users.map((u)=>{
    const currentStatus=String(u.status||'').trim().toLowerCase();
    const roles=(Array.isArray(u.roles)?u.roles:[]).map((role)=>String(role||'').trim().toLowerCase()).filter(Boolean);
    const currentRole=String(u.primaryRole||roles[0]||'').trim().toLowerCase();
    const accessStatus=String(u.access?.status||'').trim().toLowerCase();
    const searchText=[u.name,u.authEmail||u.email,u.contactEmail,u.client?.name,u.client?.modality,u.primaryRole,...roles,u.status,accessStatus,...(u.assignedCoachNames||[])].filter(Boolean).join(' ').toLowerCase();
    const roleTokens=`|${[...new Set([currentRole,...roles].filter(Boolean))].join('|')}|`;
    const statusForm=vm.canManageStatus?form(
      'user-status',
      `<input type="hidden" name="userId" value="${e(u.userId||u.id)}"><input type="hidden" name="baseRevision" value="${e(u.revision||0)}"><label>Estado<select name="status"><option value="active"${currentStatus==='active'?' selected':''}>Activo</option><option value="suspended"${currentStatus==='suspended'?' selected':''}>Suspendido</option><option value="inactive"${currentStatus==='inactive'?' selected':''}>Inactivo</option></select></label><label>Motivo<textarea name="reason" minlength="3" required placeholder="Motivo del cambio"></textarea></label>`,
      'Guardar estado',
    ):'';
    const roleForm=vm.canManageRoles?form(
      'role-change',
      `<input type="hidden" name="userId" value="${e(u.userId||u.id)}"><label>Acción<select name="action"><option value="grant">Otorgar acceso</option><option value="revoke">Revocar acceso</option></select></label><label>Aplicación<select name="role"><option value="client"${currentRole==='client'?' selected':''}>Cliente</option><option value="coach"${currentRole==='coach'?' selected':''}>Coach</option><option value="admin"${currentRole==='admin'?' selected':''}>Admin</option></select></label><label>Motivo<textarea name="reason" minlength="3" required placeholder="Motivo del cambio"></textarea></label>`,
      'Actualizar acceso',
    ):'';
    const userId=String(u.userId||u.id||'');
    const deleteExpected=String(u.authEmail||u.email||userId).trim();
    const isCurrentUser=userId&&userId===String(vm.currentUserId||'');
    const activeCoachClients=Math.max(0,Number(u.coach?.activeClientCount)||0);
    const deleteImpact=activeCoachClients>0
      ?`<div class="m26-admin-notice m26-admin-delete-impact" role="status"><strong>Impacto operativo</strong><p><strong>${e(activeCoachClients)}</strong> clientes activos asignados. La baja finalizará esas asignaciones y esos clientes quedarán sin Coach hasta que reasignes uno.</p></div>`
      :'';
    const deleteForm=vm.canManageStatus&&!isCurrentUser?form(
      'user-delete',
      `<input type="hidden" name="userId" value="${e(userId)}"><input type="hidden" name="confirmUserId" value="${e(userId)}"><input type="hidden" name="baseRevision" value="${e(u.revision||0)}"><div class="m26-admin-danger-body"><p class="m26-eyebrow">Zona crítica</p><p>Da de baja la cuenta, revoca roles, sesiones privilegiadas, asignaciones y disponibilidad. IBERFIT conserva únicamente el histórico necesario y la identidad Auth queda anonimizada mediante soft-delete.</p>${deleteImpact}<label class="m26-admin-danger-check"><input type="checkbox" name="confirmAcknowledged" value="yes" required><span>Entiendo que esta cuenta perderá acceso inmediatamente.</span></label><label>Confirma el correo o identificador<input name="confirmValue" required autocomplete="off" value="" placeholder="${e(deleteExpected)}"></label><label>Escribe ELIMINAR<input name="confirmPhrase" required autocomplete="off" pattern="ELIMINAR" placeholder="ELIMINAR"></label><label>Motivo<textarea name="reason" minlength="8" maxlength="500" required placeholder="Motivo de la baja"></textarea></label></div>`,
      'Eliminar cuenta',
    ):'';
    const selfGuard=vm.canManageStatus&&isCurrentUser?'<div class="m26-admin-notice"><strong>Cuenta Admin actual protegida</strong><p>No puedes eliminar la cuenta con la que estás administrando IBERFIT.</p></div>':'';
    const management=(statusForm||roleForm||deleteForm||selfGuard)
      ?`<details class="m26-admin-user-management"><summary>Actualizar usuario</summary><div class="m26-admin-user-management-body">${statusForm}${roleForm}${deleteForm}${selfGuard}</div></details>`
      :'';
    const dateContext={timeZone:vm.organization?.timezone||'America/Santiago',locale:vm.organization?.locale||'es-CL'};
    const lastAccess=u.lastAccessAt?e(adminDateLabel(u.lastAccessAt,dateContext)):'Sin acceso registrado';
    const relation=u.client
      ?`<strong>${e(u.client.name)}</strong><small>${e([u.client.modality,u.client.lifecycleStatus?adminStatusLabel(u.client.lifecycleStatus):null].filter(Boolean).join(' · ')||'Expediente cliente')}</small>`
      :u.coach
        ?`<strong>Coach</strong><small>${e(`${u.coach.activeClientCount||0} clientes activos asignados`)}</small>`
        :'<strong>Sin relación operativa</strong><small>La identidad no está vinculada a un expediente visible.</small>';
    const access=u.access
      ?`<strong>${e(adminClientAccessLabel(accessStatus))}</strong><small>${u.access.authLinked?'Vínculo Auth confirmado':'Sin vínculo Auth confirmado'}${u.access.invitationAttemptCount?e(` · ${u.access.invitationAttemptCount} intento${u.access.invitationAttemptCount===1?'':'s'} de invitación`):''}</small>`
      :(currentRole==='client'||roles.includes('client'))
        ?'<strong>Sin vínculo de acceso</strong><small>El rol Cliente existe, pero no hay un vínculo Auth↔Cliente visible.</small>'
        :'<strong>No aplica</strong><small>Esta identidad no usa la aplicación Cliente.</small>';
    const contact=u.contactEmail
      ?`<strong>${e(u.contactEmail)}</strong><small>${u.contactEmailDiffers?'Correo de contacto distinto del correo de acceso':'Coincide con el correo de acceso'}</small>`
      :'<strong>Sin correo de contacto</strong><small>No se infiere a partir del correo de acceso.</small>';
    const coachRelation=(u.assignedCoachNames||[]).length
      ?`<strong>${e(u.assignedCoachNames.join(', '))}</strong><small>Coach asignado al expediente Cliente</small>`
      :u.coach
        ?`<strong>${e(u.coach.name)}</strong><small>Perfil Coach · ${e(u.coach.activeClientCount||0)} clientes activos</small>`
        :'<strong>Sin Coach asignado</strong><small>Sin relación Coach activa visible.</small>';
    const integrity=(u.integrityIssues||[]).length
      ?`<div class="m26-admin-user360-warning" role="status"><strong>Revisión de integridad requerida</strong><small>${e((u.integrityIssues||[]).map((issue)=>issue.code).join(' · '))}</small></div>`
      :'';
    return `<article class="m26-admin-panel m26-admin-user-card m26-admin-user360-card" data-admin-user-card data-user-id="${e(u.userId||u.id)}" data-user-search="${e(searchText)}" data-user-status="${e(currentStatus)}" data-user-roles="${e(roleTokens)}" data-user-access-state="${e(accessStatus)}" data-user-integrity="${(u.integrityIssues||[]).length>0?'true':'false'}" data-user-unlinked="${(currentRole==='client'||roles.includes('client'))&&(!u.access||(accessStatus==='activo'&&u.access.authLinked!==true))?'true':'false'}"><div class="m26-admin-user-card-head"><div><p class="m26-eyebrow">Cuenta 360</p><h3>${e(u.name||u.authEmail||u.email||'Usuario')}</h3><p>${e(u.authEmail||u.email||'')}</p></div>${badge(adminStatusLabel(u.status))}</div><div class="m26-admin-user360-roles">${roles.length?roles.map((role)=>badge(adminRoleLabel(role))).join(''):badge('Sin rol')}</div><dl class="m26-admin-user360-grid"><div><dt>Último acceso</dt><dd><strong>${lastAccess}</strong><small>Registro de autenticación disponible para esta identidad</small></dd></div><div><dt>Relación operativa</dt><dd>${relation}</dd></div><div><dt>Acceso Cliente</dt><dd>${access}</dd></div><div><dt>Correo de contacto</dt><dd>${contact}</dd></div><div><dt>Coach / cartera</dt><dd>${coachRelation}</dd></div><div><dt>Activación</dt><dd><strong>${u.access?.activatedAt?e(adminDateLabel(u.access.activatedAt,dateContext)):u.access?.invitationSentAt?'Invitación enviada':'Sin activación registrada'}</strong><small>${u.access?.invitationSentAt?e(`Invitación: ${adminDateLabel(u.access.invitationSentAt,dateContext)}`):'Sin envío de invitación visible'}</small></dd></div></dl>${integrity}${management}</article>`;
  }).join('');
  const controls=vm.users.length?`<section class="m26-admin-user-directory-tools" aria-label="Filtrar usuarios">
    <label class="m26-admin-user-search"><span>Buscar</span><input type="search" data-admin-user-search autocomplete="off" placeholder="Nombre, correo, cliente o Coach" aria-label="Buscar usuario por nombre, correo, cliente o Coach"></label>
    <label><span>Estado</span><select data-admin-user-filter="status" aria-label="Filtrar usuarios por estado"><option value="">Todos</option><option value="active">Activos</option><option value="suspended">Suspendidos</option><option value="inactive">Inactivos</option></select></label>
    <label><span>Rol</span><select data-admin-user-filter="role" aria-label="Filtrar usuarios por rol"><option value="">Todos</option><option value="client">Cliente</option><option value="coach">Coach</option><option value="admin">Admin</option></select></label>
    <label><span>Acceso y revisión</span><select data-admin-user-filter="attention" aria-label="Filtrar usuarios por acceso y revisión"><option value="">Todos</option><option value="integrity">Vínculo a revisar</option><option value="invitation">Invitación pendiente</option><option value="unlinked">Cliente sin vínculo</option></select></label>
    <div class="m26-admin-user-result-count" role="status" aria-live="polite"><strong data-admin-user-visible-count>${e(vm.users.length)}</strong><span>de ${e(vm.users.length)} usuarios</span></div>
    <button type="button" class="m26-admin-user-filter-reset" data-admin-user-filter-reset hidden>Limpiar filtros</button>
  </section>`:'';
  const overview=`<section class="m26-admin-stats m26-admin-user360-overview">${stat('Usuarios',summary.total||0)}${stat('Activos',summary.activeUsers||0)}${stat('Invitaciones pendientes',summary.pendingInvitations||0)}${stat('Vínculos a revisar',summary.integrityIssueCount||0)}</section>`;
  const affectedDirectoryUsers=vm.users.filter((user)=>(user.integrityIssues||[]).length>0).length;
  // Global Auth↔Client anomalies can reference a missing identity. Never
  // imply that a user-list filter can locate orphaned access records.
  const integritySummary=summary.integrityIssueCount
    ?`<section class="m26-admin-panel m26-admin-user360-integrity"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Integridad de acceso</p><h3>${e(summary.integrityIssueCount)} vínculo${summary.integrityIssueCount===1?'':'s'} requiere${summary.integrityIssueCount===1?'':'n'} revisión</h3><p>IBERFIT no corrige ni vincula identidades por coincidencia de correo. La relación Auth↔Cliente debe estar confirmada por el backend.</p></div>${affectedDirectoryUsers
      ?'<button type="button" class="m26-admin-user-review-cta" data-admin-user-review-filter aria-controls="m26-admin-user-results" aria-pressed="false">Revisar cuentas afectadas</button>'
      :'<p class="m26-admin-user-global-integrity-note">Hay vínculos sin una cuenta del directorio identificable. No se atribuyen a usuarios por coincidencia de correo; requiere revisión del registro de acceso de origen.</p>'}</div></section>`
    :'';
  const noResults=vm.users.length?`<section class="m26-admin-empty m26-admin-user-no-results" data-admin-user-no-results hidden><h3>Sin coincidencias</h3><p>Cambia la búsqueda o los filtros para volver a mostrar usuarios.</p></section>`:'';
  return `<div class="m26-admin-route m26-admin-user360" data-admin-user-directory>${intro('Identidad','Usuarios y accesos 360','Cuenta, roles, acceso Cliente, relación operativa y último acceso en una sola vista, sin confundir identidad de login con datos de contacto.')}${overview}${integritySummary}${controls}<section id="m26-admin-user-results" class="m26-admin-cards" data-admin-user-results>${cards||empty('Sin usuarios','No hay usuarios visibles.')}</section>${noResults}</div>`;
}
// SIGNATURE 360 U10: status is an exact account fact, not a substring of a journey label.
export function deriveAdminTeamAssignmentTriage({profiles=[],assignments=[]}={}){
  const rows=Array.isArray(assignments)?assignments:[];
  const people=Array.isArray(profiles)?profiles:[];
  const isActiveCoach=(coach)=>['active','activo'].includes(String(coach?.accountStatus||'').trim().toLowerCase());
  const isActiveAssignment=(assignment)=>String(assignment?.status||'').trim().toLowerCase()==='active';
  const active=rows.filter(isActiveAssignment);
  const history=rows.filter((item)=>!isActiveAssignment(item));
  return Object.freeze({
    activeCoaches:people.filter(isActiveCoach).length,
    active:Object.freeze(active),
    history:Object.freeze(history),
    activeAssignmentCount:active.length,
  });
}
function renderTeam(vm){
  const profiles=vm.coachProfiles360||[];
  const triage=deriveAdminTeamAssignmentTriage({profiles,assignments:vm.assignments});
  const assignedClients=new Set(profiles.flatMap((coach)=>coach.clients?.map((client)=>client.id)||[])).size;
  const upcoming=profiles.reduce((sum,coach)=>sum+Number(coach.upcomingCount||0),0);
  const assign=vm.canManage?form('assignment-create',
    `<label>Coach<select name="coachUserId" required><option value="">Seleccionar Coach</option>${vm.coaches.map((x)=>`<option value="${e(x.userId||x.id)}">${e(x.name||x.email)}</option>`).join('')}</select></label>
     <label>Cliente<select name="clientId" required><option value="">Seleccionar cliente</option>${vm.clients.map((x)=>`<option value="${e(x.id)}">${e(x.name)}</option>`).join('')}</select></label>
     <label>Fecha de inicio<input type="date" name="startsAt" required></label>
     <label>Motivo<textarea name="reason" minlength="3" required maxlength="500" placeholder="Motivo"></textarea></label>`,'Crear asignación'):'';
  const renderAssignment=(a,canEnd=false)=>`<tr data-admin-assignment-state="${canEnd?'active':'history'}"><td>${e(a.coachName||'Coach sin identificar')}</td><td>${e(a.clientName||'Cliente sin identificar')}</td><td>${badge(a.status)}</td><td>${canEnd&&vm.canManage?form('assignment-end',`<input type="hidden" name="assignmentId" value="${e(a.id)}"><input type="hidden" name="baseRevision" value="${e(a.revision||0)}"><label>Motivo de finalización<input name="reason" minlength="3" maxlength="500" required placeholder="Motivo"></label>`,'Finalizar'):'—'}</td></tr>`;
  const activeTable=rows(['Coach','Cliente','Estado','Acción'],triage.active.map((a)=>renderAssignment(a,true)),{className:'m26-admin-team-table',scrollLabel:'Relaciones activas de Coach y cliente'});
  const historyTable=rows(['Coach','Cliente','Estado','Acción'],triage.history.map((a)=>renderAssignment(a,false)),{className:'m26-admin-team-table',scrollLabel:'Historial de asignaciones Coach y cliente'});
  return `<div class="m26-admin-route m26-admin-team360">
    ${intro('Dirección de equipo','Coach 360','Consulta el perfil operativo de cada Coach, su cartera, carga y entrenamientos desde una sola vista.')}
    <section class="m26-admin-stats m26-admin-team-overview">
      ${stat('Coaches',profiles.length)}
      ${stat('Activos',triage.activeCoaches)}
      ${stat('Clientes asignados',assignedClients)}
      ${stat('Próximas sesiones',upcoming)}
    </section>
    <section class="m26-admin-panel m26-admin-team-directory"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Equipo profesional</p><h3>Perfiles de Coach</h3><p>Abre cada perfil para revisar carga, clientes y agenda sin abandonar Admin.</p></div>${badge(`${profiles.length} perfiles`)}</div><div class="m26-admin-coach360-grid">${profiles.length?profiles.map(coach360Card).join(''):empty('Sin Coaches','No hay perfiles de Coach visibles.')}</div></section>
    ${vm.canManage?`<section class="m26-admin-panel m26-admin-assignment-create"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Asignación</p><h3>Vincular Coach y cliente</h3><p>La relación queda trazada y puede finalizarse sin borrar el histórico.</p></div></div>${assign}</section>`:''}
    <section class="m26-admin-panel m26-admin-team-active"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Relaciones vigentes</p><h3>Asignaciones Coach–Cliente activas</h3></div>${badge(`${triage.activeAssignmentCount} activas`)}</div>${triage.active.length?activeTable:empty('Sin asignaciones activas','No existen relaciones Coach–Cliente activas verificadas.')}</section>
    ${triage.history.length?`<details class="m26-admin-team-history"><summary>Historial de asignaciones <span aria-label="Cantidad">${triage.history.length}</span></summary>${historyTable}</details>`:''}
  </div>`;
}
function clientDelete(c){
  const expected=String(c.email||c.name||'').trim();
  const identity=c.email?`Correo: ${c.email}`:`Nombre: ${c.name}`;
  return `<details class="m26-admin-danger"><summary>Eliminar cliente</summary><div class="m26-admin-danger-body"><p class="m26-eyebrow">Zona crítica</p><h4>Eliminar ${e(c.name)} de forma permanente</h4><p>Esta acción elimina el expediente operativo asociado y no se puede deshacer. Si existen registros legales, fiscales o de gobierno protegidos, IBERFIT bloqueará la operación y no borrará nada.</p><dl><div><dt>Cliente</dt><dd>${e(c.name)}</dd></div><div><dt>${c.email?'Correo':'Identificador'}</dt><dd>${e(c.email||c.id)}</dd></div><div><dt>ID</dt><dd>${e(c.id)}</dd></div></dl>${form('client-delete',`<input type="hidden" name="clientId" value="${e(c.id)}"><label class="m26-admin-danger-check"><input type="checkbox" name="confirmAcknowledged" value="yes" required><span>Entiendo que la eliminación es permanente y que la identidad de acceso puede conservarse por seguridad.</span></label><label>Confirma ${e(identity)}<input name="confirmValue" required autocomplete="off" placeholder="${e(expected)}"></label><label>Escribe ELIMINAR<input name="confirmPhrase" required autocomplete="off" pattern="ELIMINAR" placeholder="ELIMINAR"></label><label>Motivo<textarea name="reason" minlength="8" maxlength="500" required placeholder="Motivo de la eliminación"></textarea></label>`,'Eliminar definitivamente')}</div></details>`;
}
function clientLifecycleLabel(value){
  const status=String(value||'').toLowerCase();
  if(status==='iri_only')return 'Evaluación registrada';
  if(status==='onboarding')return 'Onboarding';
  if(status==='active')return 'Activo';
  if(status==='paused')return 'Pausa';
  if(status==='inactive')return 'Baja';
  if(status==='reactivation')return 'Reactivación';
  return value||'Sin estado';
}
function clientTrainingServiceLabel(c){
  const status=String(c?.trainingServiceStatus||'none').trim().toLowerCase();
  if(status==='active')return 'Entrenamiento activo';
  if(status==='paused')return 'Entrenamiento en pausa';
  if(status==='ended')return 'Entrenamiento finalizado';
  return 'Sin entrenamiento activo';
}
function clientAccessLabel(c){
  const access=c?.lifecycle?.access||null;
  if(!access)return 'Sin acceso';
  if(String(access.status||'').toLowerCase()==='activo')return 'Acceso activo';
  const delivery=String(access.invitationDeliveryStatus||'').toLowerCase();
  if(delivery==='sent')return 'Invitación enviada';
  if(delivery==='error')return 'Error de invitación';
  if(delivery==='pending')return 'Invitación pendiente';
  return String(access.status||'').toLowerCase()==='invitacion_pendiente'?'Invitación pendiente':'Sin acceso';
}
function clientInvitationRetry(c){
  const access=c?.lifecycle?.access||null;
  const delivery=String(access?.invitationDeliveryStatus||'').toLowerCase();
  if(delivery!=='error')return '';
  return form(
    'client-invite-resend',
    `<input type="hidden" name="clientId" value="${e(c.id)}">`,
    'Reintentar invitación',
    {attrs:'data-client-invite-resend'},
  );
}
function clientCreateWizardForm(vm={}){
  const currentUserId=String(vm?.currentUserId||'').trim();
  const eligibleCoaches=(Array.isArray(vm?.coaches)?vm.coaches:[])
    .filter((coach)=>!/(?:suspended|inactive|blocked|suspendido|inactivo|bloqueado)/iu.test(String(coach?.status||'')))
    .map((coach)=>({
      id:String(coach?.userId||coach?.id||'').trim(),
      name:String(coach?.name||coach?.email||'Coach').trim()||'Coach',
    }))
    .filter((coach)=>coach.id);
  const selfCoach=eligibleCoaches.find((coach)=>coach.id===currentUserId)||null;
  const defaultCoach=selfCoach||(eligibleCoaches.length===1?eligibleCoaches[0]:null);
  const coachOptions=`<option value=""${defaultCoach?'':' selected'}>Asignar después</option>${eligibleCoaches.map((coach)=>`<option value="${e(coach.id)}"${defaultCoach?.id===coach.id?' selected':''}>${e(coach.name)}</option>`).join('')}`;
  const steps=`
    <header class="m26-client-create-wizard-head">
      <div>
        <p class="m26-eyebrow">Alta guiada</p>
        <h4 data-client-create-heading>Crear cliente</h4>
        <p data-client-create-intro>Completa el expediente por etapas. Puedes volver atrás y el borrador se conserva de forma temporal durante esta sesión de IBERFIT.</p>
      </div>
      <span data-client-draft-status class="m26-client-draft-status">Borrador temporal listo</span>
    </header>
    <nav class="m26-client-create-progress" aria-label="Pasos del alta">
      <span data-client-step-indicator="1" aria-current="step"><b>1</b><em>Datos</em></span>
      <span data-client-step-indicator="2"><b>2</b><em>Servicio</em></span>
      <span data-client-step-indicator="3"><b>3</b><em>Objetivo</em></span>
      <span data-client-step-indicator="4"><b>4</b><em>Seguridad</em></span>
      <span data-client-step-indicator="5"><b>5</b><em>Revisión</em></span>
    </nav>

    <input type="hidden" name="accessModeExplicit" value="">

    <fieldset class="m26-client-create-step" data-client-step="1">
      <legend tabindex="-1" data-client-step-title>1 · Datos personales y contacto</legend>
      <div class="m26-client-create-grid">
        <label>Nombre completo<input name="name" maxlength="200" required autocomplete="name" placeholder="Nombre y apellidos"></label>
        <label>Correo de contacto e informe<input type="email" name="email" maxlength="254" required autocomplete="email" placeholder="persona@correo.com"><small>Se usa para identificar el expediente y entregar documentación. No implica acceso a la app.</small></label>
        <label>Teléfono<input name="phone" maxlength="80" autocomplete="tel" inputmode="tel" placeholder="+56 9 ..."></label>
        <label>Fecha de nacimiento<input type="date" name="birthDate" autocomplete="bday" data-client-iri-required><small data-client-iri-required-copy hidden>Necesaria para interpretar el IRI con contexto de edad.</small></label>
        <label>Sexo para baremos IRI<select name="sexForNorms" data-client-iri-required><option value="">Completar después</option><option value="female">Mujer</option><option value="male">Hombre</option></select><small data-client-iri-required-copy hidden>Necesario cuando se utilicen baremos dependientes de sexo.</small></label>
        <label>Canal preferido<select name="preferredContactChannel"><option value="">Sin preferencia</option><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="phone">Teléfono</option></select></label>
        <label class="m26-client-create-wide">Horario preferido de contacto<input name="preferredContactTime" maxlength="120" placeholder="Ej. tardes, después de las 18:00"></label>
      </div>
      <div class="m26-client-create-actions"><span></span><button type="button" class="m26-primary-action" data-client-wizard-next>Continuar</button></div>
    </fieldset>

    <fieldset class="m26-client-create-step" data-client-step="2" hidden>
      <legend tabindex="-1" data-client-step-title>2 · Servicio y logística</legend>
      <div class="m26-client-create-grid">
        <label>Punto de entrada<select name="serviceIntent" required><option value="iri" selected>Diagnóstico IRI · recomendado</option><option value="training">Iniciar entrenamiento</option></select><small>El IRI es el inicio recomendado, pero nunca bloquea el entrenamiento.</small></label>
        <label>Modalidad<select name="modality" required><option value="">Selecciona</option><option value="Presencial">Presencial</option><option value="Híbrido">Híbrido</option><option value="Online">Online</option></select></label>
        <label data-client-training-only>Frecuencia semanal<input type="number" name="weeklyFrequency" min="1" max="14" step="1" required inputmode="numeric" placeholder="2"></label>
        <label data-client-training-only>Duración habitual de sesión<input type="number" name="sessionDurationMinutes" min="20" max="240" step="5" required inputmode="numeric" placeholder="60"></label>
        <label>Diagnóstico inicial<select name="initialAssessmentMode" required><option value="">Seleccionar situación del IRI</option><option value="iri">Realizar Diagnóstico IRI</option><option value="deferred">Posponer IRI</option></select></label>
        <label>Coach responsable<select name="coachUserId">${coachOptions}</select><small>La asignación identifica al profesional responsable. No activa por sí sola un servicio de entrenamiento.</small></label>
        <label>Acceso del usuario<select name="accessMode" required><option value="app">Acceso IBERFIT · enviar invitación</option><option value="internal">Expediente interno · no enviar invitación</option></select><small data-client-access-copy>El acceso se enviará mediante autenticación alojada.</small></label>
        <label>Comuna / zona<input name="zone" maxlength="120" autocomplete="address-level2" placeholder="Las Condes"></label>
        <label><span data-client-address-label>Dirección de entrenamiento</span><input name="address" maxlength="300" autocomplete="street-address" placeholder="Dirección o lugar habitual"></label>
        <label class="m26-client-create-wide"><span data-client-schedule-label>Disponibilidad recurrente / horario</span><input name="preferredSchedule" maxlength="240" placeholder="Ej. lunes y jueves 19:00–21:00"></label>
        <label>Tipo de lugar<input name="locationType" maxlength="80" placeholder="Domicilio, gimnasio, exterior…"></label>
        <label class="m26-client-create-wide">Indicaciones de acceso<textarea name="accessInstructions" maxlength="500" placeholder="Conserjería, estacionamiento, acceso, etc."></textarea></label>
      </div>
      <section class="m26-admin-notice" data-client-service-mode-notice>
        <strong>Diagnóstico IRI · evaluación e informe</strong>
        <p>Se creará una persona con su evaluación IRI. El entrenamiento permanecerá independiente y podrá activarse después sin duplicar el expediente.</p>
      </section>
      <div class="m26-client-create-actions"><button type="button" data-client-wizard-prev>Volver</button><button type="button" class="m26-primary-action" data-client-wizard-next>Continuar</button></div>
    </fieldset>

    <fieldset class="m26-client-create-step" data-client-step="3" hidden>
      <legend tabindex="-1" data-client-step-title>3 · Objetivo y contexto de actividad</legend>
      <div class="m26-client-create-grid">
        <label class="m26-client-create-wide"><span data-client-objective-label>Objetivo principal</span><textarea name="objective" maxlength="1000" required placeholder="Qué quiere conseguir y por qué es importante"></textarea></label>
        <label class="m26-client-create-wide">Objetivos o motivos secundarios<textarea name="secondaryObjectives" maxlength="1000" placeholder="Separados por coma o una línea por objetivo"></textarea></label>
        <label>Nivel / experiencia<input name="level" maxlength="100" placeholder="Principiante, intermedio…"></label>
        <label class="m26-client-create-wide">Historial de actividad / entrenamiento<textarea name="history" maxlength="1500" placeholder="Experiencia previa, deportes, periodos de inactividad…"></textarea></label>
        <label class="m26-client-create-wide">Actividad o entrenamiento actual<textarea name="currentTraining" maxlength="1000" placeholder="Qué está haciendo actualmente"></textarea></label>
      </div>
      <div class="m26-client-create-actions"><button type="button" data-client-wizard-prev>Volver</button><button type="button" class="m26-primary-action" data-client-wizard-next>Continuar</button></div>
    </fieldset>

    <fieldset class="m26-client-create-step" data-client-step="4" hidden>
      <legend tabindex="-1" data-client-step-title>4 · Contexto y seguridad</legend>
      <div class="m26-client-create-grid">
        <label class="m26-client-create-wide">Restricciones relevantes<textarea name="restrictions" maxlength="1000" placeholder="Limitaciones o indicaciones relevantes para una evaluación física segura"></textarea></label>
        <label class="m26-client-create-wide">Dolor o molestias actuales<textarea name="pain" maxlength="1000" placeholder="Localización, situación y aquello que deba conocer el Coach"></textarea></label>
        <label class="m26-client-create-wide"><span data-client-equipment-label>Material disponible</span><textarea name="equipment" maxlength="1200" placeholder="Mancuernas, TRX, bandas, banco, cinta, colchoneta, sin material…"></textarea></label>
        <label class="m26-client-create-wide"><span data-client-preferences-label>Preferencias / observaciones</span><textarea name="preferences" maxlength="1200" placeholder="Contexto útil para realizar la evaluación o el entrenamiento"></textarea></label>
        <label>Contacto de emergencia<input name="emergencyContactName" maxlength="160" autocomplete="off" placeholder="Nombre"></label>
        <label>Relación<input name="emergencyContactRelation" maxlength="120" placeholder="Pareja, familiar…"></label>
        <label>Teléfono de emergencia<input name="emergencyContactPhone" maxlength="80" inputmode="tel" placeholder="+56 9 ..."></label>
      </div>
      <div class="m26-client-create-actions"><button type="button" data-client-wizard-prev>Volver</button><button type="button" class="m26-primary-action" data-client-wizard-next>Revisar alta</button></div>
    </fieldset>

    <fieldset class="m26-client-create-step" data-client-step="5" hidden>
      <legend tabindex="-1" data-client-step-title>5 · Revisión antes de crear</legend>
      <p class="m26-client-review-lead">Comprueba lo esencial. Puedes volver a cualquier paso sin perder lo escrito.</p>
      <div class="m26-client-create-review">
        <button type="button" data-client-wizard-jump="1"><span>Persona</span><strong data-client-review="identity">Sin completar</strong><small>Editar datos</small></button>
        <button type="button" data-client-wizard-jump="2"><span>Servicio</span><strong data-client-review="service">Sin completar</strong><small>Editar servicio</small></button>
        <button type="button" data-client-wizard-jump="3"><span>Objetivo</span><strong data-client-review="objective">Sin completar</strong><small>Editar objetivo</small></button>
        <button type="button" data-client-wizard-jump="4"><span>Seguridad</span><strong data-client-review="safety">Sin completar</strong><small>Editar contexto</small></button>
      </div>
      <div class="m26-admin-notice" data-client-create-outcome><strong>Qué ocurrirá al confirmar</strong><p>IBERFIT creará el expediente y conservará los datos. El acceso sólo se enviará si lo has elegido expresamente.</p></div>
      <div class="m26-client-create-actions"><button type="button" data-client-wizard-prev>Volver</button><button type="button" data-client-wizard-discard>Descartar borrador</button></div>
    </fieldset>
  `;
  return form('client-create',steps,'Crear persona y preparar acceso',{
    attrs:'data-client-create-wizard data-client-current-step="1" data-client-service-intent="iri" autocomplete="on"',
    submitAttrs:'class="m26-primary-action" data-client-create-submit'
  });
}
function clientEditPayload(client={}){
  const p=client?.profile||{};
  return {
    clientId:String(client.id||''),
    baseRevision:Number(client.revision||0)||0,
    serviceKind:String(client.serviceKind||'none'),
    trainingServiceStatus:String(client.trainingServiceStatus||'none'),
    name:String(client.name||''),
    email:String(client.email||''),
    phone:String(p.phone||''),
    birthDate:String(p.birthDate||''),
    sexForNorms:String(p.sexForNorms||''),
    preferredContactChannel:String(p.preferredContactChannel||''),
    preferredContactTime:String(p.preferredContactTime||''),
    modality:String(client.modality||p.modality||''),
    weeklyFrequency:p.weeklyFrequency==null?'':String(p.weeklyFrequency),
    sessionDurationMinutes:p.sessionDurationMinutes==null?'':String(p.sessionDurationMinutes),
    initialAssessmentMode:String(p.initialAssessmentMode||'iri'),
    zone:String(p.commune||''),
    address:String(p.trainingAddress||''),
    preferredSchedule:String(p.preferredSchedule||''),
    locationType:String(p.locationType||''),
    accessInstructions:String(p.accessInstructions||''),
    objective:String(client.objective||p.primaryObjective||''),
    secondaryObjectives:String(p.secondaryObjectives||''),
    level:String(p.experienceLevel||''),
    history:String(p.trainingHistory||''),
    currentTraining:String(p.currentTraining||''),
    restrictions:String(p.restrictions||''),
    pain:String(p.pain||''),
    equipment:String(p.equipment||p.equipmentAvailable||''),
    preferences:String(p.preferences||''),
    emergencyContactName:String(p.emergencyContactName||''),
    emergencyContactRelation:String(p.emergencyContactRelation||''),
    emergencyContactPhone:String(p.emergencyContactPhone||''),
  };
}
function clientEditDialog(vm={}){
  const records=(vm.clients||[]).map(clientEditPayload);
  return `<dialog class="m26-admin-client-edit-dialog" data-admin-client-edit-dialog aria-labelledby="m26-client-edit-title">
    <div class="m26-admin-client-edit-shell">
      <header>
        <div><p class="m26-eyebrow">Expediente real</p><h3 id="m26-client-edit-title">Editar ficha de persona</h3><p>Actualiza datos operativos sin alterar el historial IRI ni activar entrenamiento de forma implícita.</p></div>
        <button type="button" class="m26-icon-button" data-admin-client-edit-close aria-label="Cerrar editor">×</button>
      </header>
      <form data-admin-form="client-profile-update" data-guided-required-form class="m26-admin-form m26-admin-client-edit-form" autocomplete="on">
        <input type="hidden" name="clientId">
        <input type="hidden" name="baseRevision">
        <section class="m26-admin-client-edit-access">
          <div><span>Correo de acceso</span><strong data-admin-client-edit-email>—</strong></div>
          <small>El correo de acceso está vinculado a la identidad y a la invitación. Se gestiona por un flujo de seguridad separado.</small>
        </section>
        <div class="m26-client-create-grid">
          <label>Nombre completo<input name="name" maxlength="200" required autocomplete="name"></label>
          <label>Teléfono<input name="phone" maxlength="80" autocomplete="tel" inputmode="tel"></label>
          <label>Fecha de nacimiento<input type="date" name="birthDate" autocomplete="bday"></label>
          <label>Sexo para baremos IRI<select name="sexForNorms"><option value="">Completar después</option><option value="female">Mujer</option><option value="male">Hombre</option></select></label>
          <label>Canal preferido<select name="preferredContactChannel"><option value="">Sin preferencia</option><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="phone">Teléfono</option></select></label>
          <label>Horario preferido de contacto<input name="preferredContactTime" maxlength="120"></label>
          <label>Modalidad<select name="modality" required><option value="">Seleccionar modalidad</option><option value="Presencial">Presencial</option><option value="Híbrido">Híbrido</option><option value="Online">Online</option></select></label>
          <label data-client-edit-training-only>Frecuencia semanal<input type="number" name="weeklyFrequency" min="1" max="14" step="1" inputmode="numeric"></label>
          <label data-client-edit-training-only>Duración por sesión<input type="number" name="sessionDurationMinutes" min="20" max="240" step="5" inputmode="numeric"></label>
          <label>Diagnóstico inicial<select name="initialAssessmentMode" required><option value="">Seleccionar situación del IRI</option><option value="iri">Realizar Diagnóstico IRI</option><option value="deferred">Posponer IRI</option></select></label>
          <label>Comuna / zona<input name="zone" maxlength="120" autocomplete="address-level2"></label>
          <label>Dirección de entrenamiento<input name="address" maxlength="300" autocomplete="street-address"></label>
          <label class="m26-client-create-wide">Disponibilidad / horario<input name="preferredSchedule" maxlength="240"></label>
          <label>Tipo de lugar<input name="locationType" maxlength="80"></label>
          <label class="m26-client-create-wide">Indicaciones de acceso<textarea name="accessInstructions" maxlength="500"></textarea></label>
          <label class="m26-client-create-wide">Objetivo principal<textarea name="objective" maxlength="1000" required></textarea></label>
          <label class="m26-client-create-wide">Objetivos secundarios<textarea name="secondaryObjectives" maxlength="1000"></textarea></label>
          <label>Nivel / experiencia<input name="level" maxlength="100"></label>
          <label class="m26-client-create-wide">Historial de entrenamiento<textarea name="history" maxlength="1500"></textarea></label>
          <label class="m26-client-create-wide">Entrenamiento actual<textarea name="currentTraining" maxlength="1000"></textarea></label>
          <label class="m26-client-create-wide">Restricciones relevantes<textarea name="restrictions" maxlength="1000"></textarea></label>
          <label class="m26-client-create-wide">Dolor o molestias actuales<textarea name="pain" maxlength="1000"></textarea></label>
          <label class="m26-client-create-wide">Material disponible<textarea name="equipment" maxlength="1200"></textarea></label>
          <label class="m26-client-create-wide">Preferencias<textarea name="preferences" maxlength="1200"></textarea></label>
          <label>Contacto de emergencia<input name="emergencyContactName" maxlength="160" autocomplete="off"></label>
          <label>Relación<input name="emergencyContactRelation" maxlength="120"></label>
          <label>Teléfono de emergencia<input name="emergencyContactPhone" maxlength="80" inputmode="tel"></label>
        </div>
        <p class="m26-field-help" data-guided-required-progress aria-live="polite"></p>
        <footer class="m26-admin-client-edit-actions">
          <button type="button" data-admin-client-edit-close>Cancelar</button>
          <button type="submit" class="m26-primary-action">Guardar cambios</button>
        </footer>
      </form>
    </div>
  </dialog><div data-admin-client-edit-data hidden aria-hidden="true">${e(safeJson(records))}</div>`;
}
function renderClients(vm){
  const create=vm.canManage?clientCreateWizardForm(vm):'';
  const lead=vm.canManage?`<details class="m26-admin-panel m26-admin-lead-capture m26-admin-lead-disclosure" data-admin-lead-disclosure><summary class="m26-admin-lead-summary"><div><p class="m26-eyebrow">Prospección</p><h3>Registrar lead</h3><p>Guarda un contacto inicial para seguimiento comercial. Todavía no crea un expediente de cliente ni envía acceso a la app.</p></div><span class="m26-admin-lead-summary-meta">${badge('Contacto inicial')}<span class="m26-admin-lead-toggle" aria-hidden="true">＋</span></span></summary><div class="m26-admin-lead-disclosure-body">${form('lead-create',`<input name="name" maxlength="200" required placeholder="Nombre"><input type="email" name="email" maxlength="254" placeholder="Correo"><input name="phone" maxlength="80" placeholder="Teléfono"><input name="source" maxlength="120" placeholder="Origen"><textarea name="objective" maxlength="1000" placeholder="Objetivo o necesidad principal"></textarea>`,'Registrar lead')}</div></details>`:'';
  const leadTable=rows(['Lead','Origen','Estado','Gestión'],vm.leads.map((l)=>`<tr><td><strong>${e(l.name)}</strong><small>${e(l.email||l.phone||'')}</small></td><td>${e(l.source||'')}</td><td>${badge(l.status)}</td><td>${vm.canManage?form('lead-update',`<input type="hidden" name="leadId" value="${e(l.id)}"><input type="hidden" name="baseRevision" value="${e(l.revision||0)}"><label>Estado del lead<select name="status"><option value="new">Nuevo</option><option value="contacted">Contactado</option><option value="qualified">Cualificado</option><option value="evaluation">Evaluación</option><option value="won">Ganado</option><option value="lost">Perdido</option></select></label><label>Próxima acción<input type="datetime-local" name="nextActionAt"></label><label>Motivo<input name="reason" minlength="3" required placeholder="Motivo"></label>`,'Actualizar'):'—'}</td></tr>`),{className:'m26-admin-lead-table',scrollLabel:'Leads y seguimiento'});
  const clients=rows(['Persona','Servicio de entrenamiento','Acceso','Coach','Gestión'],vm.clients.map((c)=>{
    const training=String(c.serviceKind||'none')==='training';
    const serviceStatus=String(c.trainingServiceStatus||'none').toLowerCase();
    const primaryArea=training?'expediente':(c.nextAction?.area||'iri');
    const primaryLabel=training?'Abrir expediente':(c.nextAction?.label||'Abrir / completar IRI');
    const contextActions=training
      ?`<button type="button" data-m26-open-client-area="expediente" data-m26-client-id="${e(c.id)}">Abrir expediente</button>`
      :`<button type="button" class="m26-primary-action" data-m26-open-client-area="${e(primaryArea)}" data-m26-client-id="${e(c.id)}">${e(primaryLabel)}</button><button type="button" data-m26-open-client-area="informes" data-m26-client-id="${e(c.id)}">Informe IRI</button>`;
    const serviceForm=form('client-training-service',
      `<input type="hidden" name="clientId" value="${e(c.id)}"><label>Estado del servicio<select name="status">${[
        ['active','Activo'],
        ['paused','Pausa'],
        ['ended','Finalizado'],
      ].map(([value,label])=>`<option value="${value}"${serviceStatus===value?' selected':''}>${label}</option>`).join('')}</select></label><label>Motivo del cambio<input name="reason" minlength="3" maxlength="500" required placeholder="Motivo del cambio"></label>`,
      training?'Actualizar servicio':'Activar entrenamiento'
    );
    return `<tr data-admin-client-id="${e(c.id)}" data-admin-person-status="${e(c.lifecycle?.status||c.status)}" data-service-kind="${training?'training':'none'}" data-training-service-status="${e(serviceStatus)}"><td><div class="m26-admin-client-identity"><span class="m26-admin-client-avatar" data-iberfit-avatar-client="${e(c.id)}" aria-hidden="true">${e(String(c.name||'C').slice(0,1).toUpperCase())}</span><span class="m26-admin-client-name"><strong>${e(c.name)}</strong><small>${e(c.email||c.id)}</small></span></div></td><td>${badge(clientTrainingServiceLabel(c))}<small>${e(clientLifecycleLabel(c.lifecycle?.status||c.status))}</small></td><td>${badge(clientAccessLabel(c))}</td><td>${e(c.coachNames?.join(', ')||'Sin coach')}${!training&&c.coachNames?.length?'<small>Responsable técnico del IRI</small>':''}</td><td>${vm.canManage?`<div class="m26-admin-client-row-actions">${contextActions}<button type="button" data-admin-client-edit-open="${e(c.id)}">Editar ficha</button>${clientInvitationRetry(c)}${serviceForm}${clientDelete(c)}</div>`:'—'}</td></tr>`;
  }),{className:'m26-admin-client-table',scrollLabel:'Personas con expediente y gestión'});
  return `<div class="m26-admin-route">${intro('Servicio','Personas y clientes','Acompaña el recorrido desde el primer contacto hasta la reactivación.')}${vm.canManage?`<section class="m26-admin-panel"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Alta segura</p><h3>Nueva persona</h3><p>IBERFIT crea el expediente con el servicio correcto. El acceso a la app es una decisión separada: puede enviarse una invitación o mantenerse como expediente interno.</p></div></div>${create}</section>`:''}${lead}<section class="m26-admin-panel"><h3>Leads</h3>${vm.leads.length?`<p class="m26-admin-table-scroll-hint">Desplaza la tabla lateralmente para ver todas las columnas y acciones.</p>${leadTable}`:empty('Sin leads','Los contactos aparecerán aquí.')}</section><section class="m26-admin-panel"><h3>Personas con expediente</h3><label>Filtrar relación<select data-admin-person-filter><option value="all">Todas las personas</option><option value="training">Con entrenamiento</option><option value="no-training">Sin entrenamiento activo</option><option value="onboarding">En incorporación</option><option value="inactive">Relación inactiva</option></select></label><p data-admin-person-filter-status role="status" aria-live="polite"></p><p class="m26-data-footnote">Persona, evaluación IRI y servicio de entrenamiento son dimensiones distintas. Una evaluación no activa entrenamiento y el entrenamiento no exige un IRI previo.</p>${vm.clients.length?`<p class="m26-admin-table-scroll-hint">Desplaza la tabla lateralmente para ver todas las columnas y acciones.</p>${clients}`:empty('Sin personas','No hay expedientes visibles.')}</section>${vm.canManage&&vm.clients.length?clientEditDialog(vm):''}</div>`;
}
function adminAgendaTimestamp(item){
  const raw=item.startAt??item.start_at??item.startsAt??item.starts_at??item.scheduledAt??item.scheduled_at??item.date;
  const timestamp=raw?new Date(raw).getTime():NaN;
  return Number.isFinite(timestamp)?timestamp:Number.MAX_SAFE_INTEGER;
}
function renderSimple(vm){if(vm.kind==='admin-agenda'){
  const ordered=[...vm.appointments].sort((a,b)=>adminAgendaTimestamp(a)-adminAgendaTimestamp(b));
  return `<div class="m26-admin-route">${intro('Capacidad','Agenda global','Supervisa todas las citas y modalidades.')}<section class="m26-admin-panel">${ordered.length?rows(['Cliente','Fecha y hora','Coach','Modalidad','Estado'],ordered.map((x)=>`<tr><td><strong>${e(x.clientName||x.client_name||'Cliente sin identificar')}</strong><small>${e(!x.clientName&&!x.client_name?(x.clientId||x.client_id||''):'')}</small></td><td>${e(adminDateLabel(x.startAt||x.start_at||x.startsAt||x.starts_at||x.scheduledAt||x.scheduled_at||x.date||'',{timeZone:vm.organization?.timezone,locale:vm.organization?.locale})||'Fecha por confirmar')}</td><td>${e(x.coachName||x.coach_name||'Sin Coach indicado')}</td><td>${e(adminAgendaModalityLabel(x.modality||x.modalidad||x.mode))}</td><td>${badge(adminAgendaStatusLabel(x.status))}</td></tr>`),{className:'m26-admin-agenda-table',scrollLabel:'Agenda global'}):empty('Agenda vacía','No hay citas visibles.')}</section></div>`;}
  if(vm.kind==='admin-operaciones')return renderOperations(vm);
  if(vm.kind==='admin-comunicacion'){const create=vm.canManage?form('template-save',`<input name="key" pattern="[a-z0-9_.:-]{3,80}" required placeholder="Clave"><input name="name" required placeholder="Nombre"><select name="channel"><option value="in_app">In-app</option><option value="email">Email</option><option value="push">Push</option></select><input name="subject" placeholder="Asunto"><textarea name="body" required placeholder="Contenido"></textarea>`,'Guardar plantilla'):'';return `<div class="m26-admin-route">${intro('Relación','Comunicación','Gestiona plantillas y revisa entregas.')}${create}<section class="m26-admin-panel">${vm.templates.length?vm.templates.map((x)=>`<div class="m26-admin-list-item"><strong>${e(x.name||x.key)}</strong>${badge(x.status)}</div>`).join(''):empty('Sin plantillas','Crea la primera plantilla.')}</section></div>`;}
  if(vm.kind==='admin-automatizaciones'){const create=vm.canManage?form('automation-save',`<input name="key" pattern="[a-z0-9_.:-]{3,80}" required placeholder="Clave"><input name="name" required placeholder="Nombre"><select name="triggerType"><option value="appointment_window_open">Cita</option><option value="client_inactive">Inactividad</option><option value="checkin_due">Check-in</option><option value="iri_review_due">Revisión IRI</option></select><select name="actionType"><option value="notification">Notificación</option><option value="operational_task">Tarea</option></select><select name="status"><option value="draft">Borrador</option><option value="active">Activa</option><option value="paused">Pausada</option></select><textarea name="configuration" placeholder='{"templateKey":"appointment.reminder"}'></textarea>`,'Guardar regla'):'';return `<div class="m26-admin-route">${intro('Eficiencia','Automatizaciones','Automatiza tareas, nunca decisiones profesionales.')}${create}<section class="m26-admin-panel">${vm.rules.length?vm.rules.map((x)=>`<div class="m26-admin-list-item"><strong>${e(x.name||x.key)}</strong>${badge(x.status)}</div>`).join(''):empty('Sin reglas','No hay automatizaciones.')}</section></div>`;}
  if(vm.kind==='admin-analitica'){const evaluatedWithoutTraining=(vm.clients||[]).filter((client)=>String(client?.serviceKind||'none')!=='training'&&client?.experience?.readiness?.iriConfirmed===true).length;return `<div class="m26-admin-route">${intro('Decisiones','Analítica del servicio','Datos operativos sin mezclar personas evaluadas con clientes de entrenamiento.')}<section class="m26-admin-stats">${stat('Clientes activos',vm.analytics?.activeClients??'Sin datos')}${stat('Evaluadas sin entrenamiento',evaluatedWithoutTraining)}${stat('Adherencia',vm.analytics?.averageAdherence??'Sin datos')}${stat('Bajas 30 días',vm.analytics?.churn30d??'Sin datos')}${stat('Conversión',vm.analytics?.conversionRate??'Sin datos')}</section></div>`;}
  if(vm.kind==='admin-auditoria')return renderAudit(vm);
  const org=vm.organization||{};return `<div class="m26-admin-route">${intro('Sistema','Configuración de IBERFIT','Parámetros comunes de las tres aplicaciones.')}<section class="m26-admin-stats">${stat('Organización',org.name||'IBERFIT')}${stat('Zona horaria',org.timezone||'America/Santiago')}${stat('Idioma',org.locale||'es-CL')}</section>${vm.canManage?form('settings-save',`<input type="hidden" name="organizationId" value="${e(org.id)}"><input type="hidden" name="baseRevision" value="${e(org.revision||0)}"><input name="name" value="${e(org.name||'IBERFIT')}" required><input name="timezone" value="${e(org.timezone||'America/Santiago')}" required><input name="locale" value="${e(org.locale||'es-CL')}" required><textarea name="reason" minlength="3" required placeholder="Motivo"></textarea>`,'Guardar configuración'):''}<section class="m26-admin-notice"><strong>Pagos no incluidos</strong><p>Se implementarán al final y únicamente en Admin.</p></section></div>`;}
export function renderAdminRoute(vm){if(!vm?.admin)return null;if(vm.kind==='admin-unavailable')return `<div class="m26-admin-route">${intro('Aplicación Admin','Administración no disponible','El backend RC40 no está instalado o no respondió. Cliente y Coach continúan funcionando.')}</div>`;if(vm.kind==='admin-forbidden')return `<div class="m26-admin-route">${intro('Acceso protegido','Permiso insuficiente','La interfaz no puede conceder capacidades.')}</div>`;if(vm.kind==='admin-inicio')return renderHome(vm);if(vm.kind==='admin-usuarios')return renderUsers(vm);if(vm.kind==='admin-equipo')return renderTeam(vm);if(vm.kind==='admin-clientes')return renderClients(vm);return renderSimple(vm);}
