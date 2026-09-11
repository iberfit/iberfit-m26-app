const e=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const badge=(v)=>`<span class="m26-admin-badge">${e(v||'Sin estado')}</span>`;
const empty=(t,c)=>`<section class="m26-admin-empty"><h3>${e(t)}</h3><p>${e(c)}</p></section>`;
const stat=(t,v)=>`<article class="m26-admin-stat"><span>${e(t)}</span><strong>${e(v)}</strong></article>`;
const intro=(k,t,c)=>`<section class="m26-admin-hero"><p class="m26-eyebrow">${e(k)}</p><h2>${e(t)}</h2><p>${e(c)}</p></section>`;
const rows=(headers,items)=>`<div class="m26-admin-table"><table><thead><tr>${headers.map((h)=>`<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${items.join('')}</tbody></table></div>`;
function form(kind,fields,button,{attrs='',submitAttrs=''}={}){return `<form data-admin-form="${kind}" class="m26-admin-form" ${attrs}>${fields}<button type="submit" ${submitAttrs}>${e(button)}</button></form>`;}
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
function renderHome(vm){
  const cc=vm.commandCenter||{summary:{},priorities:[],coachLoad:[],criticalTasks:[]};
  const s=cc.summary||{};
  const priorities=cc.priorities?.length?cc.priorities.slice(0,8).map(commandPriority).join(''):empty('Servicio al día','No hay recorridos de cliente que requieran una decisión administrativa.');
  const loads=cc.coachLoad?.length?cc.coachLoad.map(coachLoadCard).join(''):empty('Sin carga registrada','La capacidad del equipo aparecerá aquí cuando exista información.');
  return `<div class="m26-admin-route m30-admin-command-route" data-admin-surface="command-center">
    ${intro('Dirección del servicio','IBERFIT Command Center','Una única vista para decidir qué necesita atención en clientes, equipo y operación.')}
    <section class="m26-admin-panel m26-admin-command m30-admin-decision-center" data-admin-priority-center aria-labelledby="m30-admin-priority-title">
      <div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Decisiones</p><h3 id="m30-admin-priority-title">Qué requiere atención ahora</h3><p>Priorizado por asignación y etapa del recorrido IBERFIT.</p></div>${badge(cc.priorities?.length?`${cc.priorities.length} por revisar`:'Al día')}</div>
      <div class="m26-admin-priority-list">${priorities}</div>
    </section>
    <section class="m26-admin-stats m30-admin-kpis" aria-label="Indicadores de operación">
      ${stat('Clientes',s.totalClients??vm.summary.activeClients??0)}
      ${stat('Sin Coach',s.unassignedClients??0)}
      ${stat('IRI pendientes',s.iriPending??0)}
      ${stat('Planificaciones',s.planningPending??0)}
      ${stat('Sin próxima cita',s.schedulingPending??0)}
      ${stat('Coaches ≥85%',s.coachesNearCapacity??0)}
    </section>
    <section class="m26-admin-grid m30-admin-operations-grid">
      <article class="m26-admin-panel"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Equipo</p><h3>Capacidad de Coaches</h3></div></div><div class="m26-admin-load-list">${loads}</div></article>
      <article class="m26-admin-panel"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Operación</p><h3>Tareas abiertas</h3></div>${badge(s.criticalTasks?`${s.criticalTasks} prioritarias`:`${s.openTasks||0} abiertas`)}</div>${vm.tasks.length?vm.tasks.map((x)=>`<div class="m26-admin-list-item"><div><strong>${e(x.title||x.type)}</strong><small>${e(x.detail||'')}</small></div>${badge(x.status)}</div>`).join(''):empty('Sin tareas','No hay incidencias abiertas.')}</article>
    </section>
    <section class="m26-admin-panel m30-admin-audit"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Trazabilidad</p><h3>Actividad administrativa reciente</h3></div></div>${vm.audit.length?vm.audit.slice(0,8).map((x)=>`<div class="m26-admin-list-item"><strong>${e(x.summary||x.eventType)}</strong><small>${e(x.occurredAt||'')}</small></div>`).join(''):empty('Sin eventos','Todavía no hay actividad administrativa.')}</section>
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
    const management=(statusForm||roleForm)
      ?`<details class="m26-admin-user-management"><summary>Actualizar usuario</summary><div class="m26-admin-user-management-body">${statusForm}${roleForm}</div></details>`
      :'';
    const lastAccess=u.lastAccessAt?e(u.lastAccessAt):'Sin acceso registrado';
    const relation=u.client
      ?`<strong>${e(u.client.name)}</strong><small>${e([u.client.modality,u.client.lifecycleStatus].filter(Boolean).join(' · ')||'Expediente cliente')}</small>`
      :u.coach
        ?`<strong>Coach</strong><small>${e(`${u.coach.activeClientCount||0} clientes activos asignados`)}</small>`
        :'<strong>Sin relación operativa</strong><small>La identidad no está vinculada a un expediente visible.</small>';
    const access=u.access
      ?`<strong>${e(adminClientAccessLabel(accessStatus))}</strong><small>${u.access.authLinked?'Vínculo Auth confirmado':'Sin vínculo Auth confirmado'}${u.access.invitationAttemptCount?e(` · ${u.access.invitationAttemptCount} intento${u.access.invitationAttemptCount===1?'':'s'} de invitación`):''}</small>`
      :roles.includes('client')
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
    return `<article class="m26-admin-panel m26-admin-user-card m26-admin-user360-card" data-admin-user-card data-user-id="${e(u.userId||u.id)}" data-user-search="${e(searchText)}" data-user-status="${e(currentStatus)}" data-user-roles="${e(roleTokens)}"><div class="m26-admin-user-card-head"><div><p class="m26-eyebrow">Cuenta 360</p><h3>${e(u.name||u.authEmail||u.email||'Usuario')}</h3><p>${e(u.authEmail||u.email||'')}</p></div>${badge(u.status)}</div><div class="m26-admin-user360-roles">${roles.length?roles.map((role)=>badge(role)).join(''):badge('Sin rol')}</div><dl class="m26-admin-user360-grid"><div><dt>Último acceso</dt><dd><strong>${lastAccess}</strong><small>Registro de autenticación disponible para esta identidad</small></dd></div><div><dt>Relación operativa</dt><dd>${relation}</dd></div><div><dt>Acceso Cliente</dt><dd>${access}</dd></div><div><dt>Correo de contacto</dt><dd>${contact}</dd></div><div><dt>Coach / cartera</dt><dd>${coachRelation}</dd></div><div><dt>Activación</dt><dd><strong>${u.access?.activatedAt?e(u.access.activatedAt):u.access?.invitationSentAt?'Invitación enviada':'Sin activación registrada'}</strong><small>${u.access?.invitationSentAt?e(`Invitación: ${u.access.invitationSentAt}`):'Sin envío de invitación visible'}</small></dd></div></dl>${integrity}${management}</article>`;
  }).join('');
  const controls=vm.users.length?`<section class="m26-admin-user-directory-tools" aria-label="Filtrar usuarios">
    <label class="m26-admin-user-search"><span>Buscar</span><input type="search" data-admin-user-search autocomplete="off" placeholder="Nombre, correo, cliente o Coach" aria-label="Buscar usuario por nombre, correo, cliente o Coach"></label>
    <label><span>Estado</span><select data-admin-user-filter="status" aria-label="Filtrar usuarios por estado"><option value="">Todos</option><option value="active">Activos</option><option value="suspended">Suspendidos</option><option value="inactive">Inactivos</option></select></label>
    <label><span>Rol</span><select data-admin-user-filter="role" aria-label="Filtrar usuarios por rol"><option value="">Todos</option><option value="client">Cliente</option><option value="coach">Coach</option><option value="admin">Admin</option></select></label>
    <div class="m26-admin-user-result-count" role="status" aria-live="polite"><strong data-admin-user-visible-count>${e(vm.users.length)}</strong><span>de ${e(vm.users.length)} usuarios</span></div>
  </section>`:'';
  const overview=`<section class="m26-admin-stats m26-admin-user360-overview">${stat('Usuarios',summary.total||0)}${stat('Activos',summary.activeUsers||0)}${stat('Invitaciones pendientes',summary.pendingInvitations||0)}${stat('Vínculos a revisar',summary.integrityIssueCount||0)}</section>`;
  const integritySummary=summary.integrityIssueCount
    ?`<section class="m26-admin-panel m26-admin-user360-integrity"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Integridad de acceso</p><h3>${e(summary.integrityIssueCount)} vínculo${summary.integrityIssueCount===1?'':'s'} requiere${summary.integrityIssueCount===1?'':'n'} revisión</h3><p>IBERFIT no corrige ni vincula identidades por coincidencia de correo. La relación Auth↔Cliente debe estar confirmada por el backend.</p></div></div></section>`
    :'';
  const noResults=vm.users.length?`<section class="m26-admin-empty m26-admin-user-no-results" data-admin-user-no-results hidden><h3>Sin coincidencias</h3><p>Cambia la búsqueda o los filtros para volver a mostrar usuarios.</p></section>`:'';
  return `<div class="m26-admin-route m26-admin-user360" data-admin-user-directory>${intro('Identidad','Usuarios y accesos 360','Cuenta, roles, acceso Cliente, relación operativa y último acceso en una sola vista, sin confundir identidad de login con datos de contacto.')}${overview}${integritySummary}${controls}<section class="m26-admin-cards" data-admin-user-results>${cards||empty('Sin usuarios','No hay usuarios visibles.')}</section>${noResults}</div>`;
}
function renderTeam(vm){
  const profiles=vm.coachProfiles360||[];
  const activeCoaches=profiles.filter((coach)=>/active|activo/i.test(coach.status)).length;
  const assignedClients=new Set(profiles.flatMap((coach)=>coach.clients?.map((client)=>client.id)||[])).size;
  const upcoming=profiles.reduce((sum,coach)=>sum+Number(coach.upcomingCount||0),0);
  const assign=vm.canManage?form('assignment-create',`<select name="coachUserId" required><option value="">Coach</option>${vm.coaches.map((x)=>`<option value="${e(x.userId||x.id)}">${e(x.name||x.email)}</option>`).join('')}</select><select name="clientId" required><option value="">Cliente</option>${vm.clients.map((x)=>`<option value="${e(x.id)}">${e(x.name)}</option>`).join('')}</select><input type="date" name="startsAt" required><textarea name="reason" minlength="3" required placeholder="Motivo"></textarea>`,'Crear asignación'):'';
  const table=rows(['Coach','Cliente','Estado','Acción'],vm.assignments.map((a)=>`<tr><td>${e(a.coachName||'Coach')}</td><td>${e(a.clientName||'Cliente')}</td><td>${badge(a.status)}</td><td>${a.status==='active'&&vm.canManage?form('assignment-end',`<input type="hidden" name="assignmentId" value="${e(a.id)}"><input type="hidden" name="baseRevision" value="${e(a.revision||0)}"><input name="reason" minlength="3" required placeholder="Motivo">`,'Finalizar'):'—'}</td></tr>`));
  return `<div class="m26-admin-route m26-admin-team360">
    ${intro('Dirección de equipo','Coach 360','Consulta el perfil operativo de cada Coach, su cartera, carga y entrenamientos desde una sola vista.')}
    <section class="m26-admin-stats m26-admin-team-overview">
      ${stat('Coaches',profiles.length)}
      ${stat('Activos',activeCoaches)}
      ${stat('Clientes asignados',assignedClients)}
      ${stat('Próximas sesiones',upcoming)}
    </section>
    <section class="m26-admin-panel m26-admin-team-directory"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Equipo profesional</p><h3>Perfiles de Coach</h3><p>Abre cada perfil para revisar carga, clientes y agenda sin abandonar Admin.</p></div>${badge(`${profiles.length} perfiles`)}</div><div class="m26-admin-coach360-grid">${profiles.length?profiles.map(coach360Card).join(''):empty('Sin Coaches','No hay perfiles de Coach visibles.')}</div></section>
    ${vm.canManage?`<section class="m26-admin-panel m26-admin-assignment-create"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Asignación</p><h3>Vincular Coach y cliente</h3><p>La relación queda trazada y puede finalizarse sin borrar el histórico.</p></div></div>${assign}</section>`:''}
    <section class="m26-admin-panel"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Relaciones activas</p><h3>Asignaciones Coach–Cliente</h3></div>${badge(`${vm.assignments.length} registros`)}</div>${vm.assignments.length?table:empty('Sin asignaciones','No hay relaciones Coach–Cliente registradas.')}</section>
  </div>`;
}
function clientDelete(c){
  const expected=String(c.email||c.name||'').trim();
  const identity=c.email?`Correo: ${c.email}`:`Nombre: ${c.name}`;
  return `<details class="m26-admin-danger"><summary>Eliminar cliente</summary><div class="m26-admin-danger-body"><p class="m26-eyebrow">Zona crítica</p><h4>Eliminar ${e(c.name)} de forma permanente</h4><p>Esta acción elimina el expediente operativo asociado y no se puede deshacer. Si existen registros legales, fiscales o de gobierno protegidos, IBERFIT bloqueará la operación y no borrará nada.</p><dl><div><dt>Cliente</dt><dd>${e(c.name)}</dd></div><div><dt>${c.email?'Correo':'Identificador'}</dt><dd>${e(c.email||c.id)}</dd></div><div><dt>ID</dt><dd>${e(c.id)}</dd></div></dl>${form('client-delete',`<input type="hidden" name="clientId" value="${e(c.id)}"><label class="m26-admin-danger-check"><input type="checkbox" name="confirmAcknowledged" value="yes" required><span>Entiendo que la eliminación es permanente y que la identidad de acceso puede conservarse por seguridad.</span></label><label>Confirma ${e(identity)}<input name="confirmValue" required autocomplete="off" placeholder="${e(expected)}"></label><label>Escribe ELIMINAR<input name="confirmPhrase" required autocomplete="off" pattern="ELIMINAR" placeholder="ELIMINAR"></label><label>Motivo<textarea name="reason" minlength="8" maxlength="500" required placeholder="Motivo de la eliminación"></textarea></label>`,'Eliminar definitivamente')}</div></details>`;
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
function clientCreateWizardForm(){
  const steps=`
    <header class="m26-client-create-wizard-head">
      <div>
        <p class="m26-eyebrow">Alta guiada</p>
        <h4>Crear cliente</h4>
        <p>Completa el expediente por etapas. Puedes volver atrás y el borrador se conserva de forma temporal durante esta sesión de IBERFIT.</p>
      </div>
      <span data-client-draft-status class="m26-client-draft-status">Borrador temporal listo</span>
    </header>
    <nav class="m26-client-create-progress" aria-label="Pasos del alta">
      <span data-client-step-indicator="1" aria-current="step"><b>1</b><em>Datos</em></span>
      <span data-client-step-indicator="2"><b>2</b><em>Servicio</em></span>
      <span data-client-step-indicator="3"><b>3</b><em>Objetivos</em></span>
      <span data-client-step-indicator="4"><b>4</b><em>Contexto</em></span>
      <span data-client-step-indicator="5"><b>5</b><em>Revisión</em></span>
    </nav>

    <fieldset class="m26-client-create-step" data-client-step="1">
      <legend tabindex="-1" data-client-step-title>1 · Datos personales y contacto</legend>
      <div class="m26-client-create-grid">
        <label>Nombre completo<input name="name" maxlength="200" required autocomplete="name" placeholder="Nombre y apellidos"></label>
        <label>Correo de acceso<input type="email" name="email" maxlength="254" required autocomplete="email" placeholder="cliente@correo.com"></label>
        <label>Teléfono<input name="phone" maxlength="80" required autocomplete="tel" inputmode="tel" placeholder="+56 9 ..."></label>
        <label>Fecha de nacimiento<input type="date" name="birthDate" autocomplete="bday"></label>
        <label>Sexo para baremos IRI<select name="sexForNorms"><option value="">Completar después</option><option value="female">Mujer</option><option value="male">Hombre</option></select></label>
        <label>Canal preferido<select name="preferredContactChannel"><option value="">Sin preferencia</option><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="phone">Teléfono</option></select></label>
        <label class="m26-client-create-wide">Horario preferido de contacto<input name="preferredContactTime" maxlength="120" placeholder="Ej. tardes, después de las 18:00"></label>
      </div>
      <div class="m26-client-create-actions"><span></span><button type="button" class="m26-primary-action" data-client-wizard-next>Continuar</button></div>
    </fieldset>

    <fieldset class="m26-client-create-step" data-client-step="2" hidden>
      <legend tabindex="-1" data-client-step-title>2 · Servicio y logística</legend>
      <div class="m26-client-create-grid">
        <label>Modalidad<select name="modality" required><option value="">Selecciona</option><option value="Presencial">Presencial</option><option value="Híbrido">Híbrido</option><option value="Online">Online</option></select></label>
        <label>Frecuencia semanal<input type="number" name="weeklyFrequency" min="1" max="14" step="1" required inputmode="numeric" placeholder="2"></label>
        <label>Duración por sesión<input type="number" name="sessionDurationMinutes" min="20" max="240" step="5" required inputmode="numeric" placeholder="60"></label>
        <label>Diagnóstico inicial<select name="initialAssessmentMode" required><option value="iri">Realizar Diagnóstico IRI</option><option value="deferred">Posponer IRI</option></select></label>
        <label>Comuna / zona<input name="zone" maxlength="120" autocomplete="address-level2" placeholder="Las Condes"></label>
        <label>Dirección de entrenamiento<input name="address" maxlength="300" autocomplete="street-address" placeholder="Dirección o lugar habitual"></label>
        <label class="m26-client-create-wide">Disponibilidad / horario<input name="preferredSchedule" maxlength="240" placeholder="Ej. lunes y jueves 19:00–21:00"></label>
        <label>Tipo de lugar<input name="locationType" maxlength="80" placeholder="Domicilio, gimnasio, exterior…"></label>
        <label class="m26-client-create-wide">Indicaciones de acceso<textarea name="accessInstructions" maxlength="500" placeholder="Conserjería, estacionamiento, acceso, etc."></textarea></label>
      </div>
      <div class="m26-client-create-actions"><button type="button" data-client-wizard-prev>Volver</button><button type="button" class="m26-primary-action" data-client-wizard-next>Continuar</button></div>
    </fieldset>

    <fieldset class="m26-client-create-step" data-client-step="3" hidden>
      <legend tabindex="-1" data-client-step-title>3 · Objetivos y experiencia</legend>
      <div class="m26-client-create-grid">
        <label class="m26-client-create-wide">Objetivo principal<textarea name="objective" maxlength="1000" required placeholder="Qué quiere conseguir y por qué es importante"></textarea></label>
        <label class="m26-client-create-wide">Objetivos secundarios<textarea name="secondaryObjectives" maxlength="1000" placeholder="Separados por coma o una línea por objetivo"></textarea></label>
        <label>Nivel / experiencia<input name="level" maxlength="100" placeholder="Principiante, intermedio…"></label>
        <label class="m26-client-create-wide">Historial de entrenamiento<textarea name="history" maxlength="1500" placeholder="Experiencia previa, deportes, periodos de inactividad…"></textarea></label>
        <label class="m26-client-create-wide">Entrenamiento actual<textarea name="currentTraining" maxlength="1000" placeholder="Qué está haciendo actualmente"></textarea></label>
      </div>
      <div class="m26-client-create-actions"><button type="button" data-client-wizard-prev>Volver</button><button type="button" class="m26-primary-action" data-client-wizard-next>Continuar</button></div>
    </fieldset>

    <fieldset class="m26-client-create-step" data-client-step="4" hidden>
      <legend tabindex="-1" data-client-step-title>4 · Contexto para entrenar mejor</legend>
      <div class="m26-client-create-grid">
        <label class="m26-client-create-wide">Restricciones relevantes<textarea name="restrictions" maxlength="1000" placeholder="Limitaciones o indicaciones relevantes para el entrenamiento"></textarea></label>
        <label class="m26-client-create-wide">Dolor o molestias actuales<textarea name="pain" maxlength="1000" placeholder="Localización, situación y aquello que deba conocer el Coach"></textarea></label>
        <label class="m26-client-create-wide">Material disponible<textarea name="equipment" maxlength="1200" placeholder="Mancuernas, TRX, bandas, gimnasio, sin material…"></textarea></label>
        <label class="m26-client-create-wide">Preferencias<textarea name="preferences" maxlength="1200" placeholder="Preferencias, ejercicios que disfruta, contexto útil para adherencia"></textarea></label>
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
        <button type="button" data-client-wizard-jump="1"><span>Cliente</span><strong data-client-review="identity">Sin completar</strong><small>Editar datos</small></button>
        <button type="button" data-client-wizard-jump="2"><span>Servicio</span><strong data-client-review="service">Sin completar</strong><small>Editar servicio</small></button>
        <button type="button" data-client-wizard-jump="3"><span>Objetivo</span><strong data-client-review="objective">Sin completar</strong><small>Editar objetivos</small></button>
        <button type="button" data-client-wizard-jump="4"><span>Contexto</span><strong data-client-review="safety">Sin completar</strong><small>Editar contexto</small></button>
      </div>
      <div class="m26-admin-notice"><strong>Qué ocurrirá al confirmar</strong><p>IBERFIT creará el expediente, conservará estos datos en el perfil del cliente y preparará su invitación segura de acceso.</p></div>
      <div class="m26-client-create-actions"><button type="button" data-client-wizard-prev>Volver</button><button type="button" data-client-wizard-discard>Descartar borrador</button></div>
    </fieldset>
  `;
  return form('client-create',steps,'Crear cliente y enviar invitación',{
    attrs:'data-client-create-wizard data-client-current-step="1" autocomplete="on"',
    submitAttrs:'class="m26-primary-action" data-client-create-submit'
  });
}
function renderClients(vm){
  const create=vm.canManage?clientCreateWizardForm():'';
  const lead=vm.canManage?form('lead-create',`<input name="name" maxlength="200" required placeholder="Nombre"><input type="email" name="email" maxlength="254" placeholder="Correo"><input name="phone" maxlength="80" placeholder="Teléfono"><input name="source" maxlength="120" placeholder="Origen"><textarea name="objective" maxlength="1000" placeholder="Objetivo"></textarea>`,'Registrar lead'):'';
  const leadTable=rows(['Lead','Origen','Estado','Gestión'],vm.leads.map((l)=>`<tr><td><strong>${e(l.name)}</strong><small>${e(l.email||l.phone||'')}</small></td><td>${e(l.source||'')}</td><td>${badge(l.status)}</td><td>${vm.canManage?form('lead-update',`<input type="hidden" name="leadId" value="${e(l.id)}"><input type="hidden" name="baseRevision" value="${e(l.revision||0)}"><select name="status"><option value="new">Nuevo</option><option value="contacted">Contactado</option><option value="qualified">Cualificado</option><option value="evaluation">Evaluación</option><option value="won">Ganado</option><option value="lost">Perdido</option></select><input type="datetime-local" name="nextActionAt"><input name="reason" minlength="3" required placeholder="Motivo">`,'Actualizar'):'—'}</td></tr>`));
  const clients=rows(['Cliente','Ciclo','Acceso','Coach','Gestión'],vm.clients.map((c)=>`<tr><td><strong>${e(c.name)}</strong><small>${e(c.email||c.id)}</small></td><td>${badge(c.lifecycle?.status||c.status)}</td><td>${badge(clientAccessLabel(c))}</td><td>${e(c.coachNames?.join(', ')||'Sin coach')}</td><td>${vm.canManage?`${form('client-lifecycle',`<input type="hidden" name="clientId" value="${e(c.id)}"><select name="status"><option value="onboarding">Onboarding</option><option value="active">Activo</option><option value="paused">Pausa</option><option value="inactive">Baja</option><option value="reactivation">Reactivación</option></select><input name="reason" minlength="3" required placeholder="Motivo">`,'Actualizar')}${clientDelete(c)}`:'—'}</td></tr>`));
  const dangerStyle=`<style>.m26-admin-danger{margin-top:.7rem;border:1px solid color-mix(in srgb,#9f2d2d 40%,transparent);border-radius:14px;background:color-mix(in srgb,#9f2d2d 6%,transparent);overflow:hidden}.m26-admin-danger>summary{cursor:pointer;padding:.7rem .85rem;font-weight:700;color:#8f2424;list-style:none}.m26-admin-danger>summary::-webkit-details-marker{display:none}.m26-admin-danger-body{padding:.1rem .85rem .85rem;display:grid;gap:.65rem}.m26-admin-danger-body h4,.m26-admin-danger-body p{margin:0}.m26-admin-danger-body dl{display:grid;gap:.35rem;margin:.2rem 0}.m26-admin-danger-body dl div{display:grid;grid-template-columns:minmax(72px,.4fr) 1fr;gap:.5rem}.m26-admin-danger-body dt{font-weight:700}.m26-admin-danger-body dd{margin:0;overflow-wrap:anywhere}.m26-admin-danger-body .m26-admin-form{display:grid;gap:.55rem}.m26-admin-danger-body label{display:grid;gap:.28rem;font-size:.9rem}.m26-admin-danger-check{grid-template-columns:auto 1fr!important;align-items:start}.m26-admin-danger-body button[type=submit]{background:#9f2d2d!important;border-color:#9f2d2d!important;color:#fff!important}</style>`;
  return `<div class="m26-admin-route">${dangerStyle}${intro('Servicio','Personas y clientes','Acompaña el recorrido desde el primer contacto hasta la reactivación.')}${vm.canManage?`<section class="m26-admin-panel"><div class="m26-admin-section-heading"><div><p class="m26-eyebrow">Alta segura</p><h3>Nuevo cliente</h3><p>IBERFIT crea el expediente y envía el acceso mediante autenticación alojada. El estado queda trazado hasta la activación.</p></div></div>${create}</section>`:''}${lead}<section class="m26-admin-panel"><h3>Leads</h3>${vm.leads.length?leadTable:empty('Sin leads','Los contactos aparecerán aquí.')}</section><section class="m26-admin-panel"><h3>Clientes</h3>${vm.clients.length?clients:empty('Sin clientes','No hay expedientes visibles.')}</section></div>`;
}
function renderSimple(vm){if(vm.kind==='admin-agenda')return `<div class="m26-admin-route">${intro('Capacidad','Agenda global','Supervisa todas las citas y modalidades.')}<section class="m26-admin-panel">${vm.appointments.length?rows(['Fecha','Cliente','Estado'],vm.appointments.map((x)=>`<tr><td>${e(x.startAt||x.start_at||x.date||'')}</td><td>${e(x.clientId||x.client_id||'')}</td><td>${badge(x.status)}</td></tr>`)):empty('Agenda vacía','No hay citas visibles.')}</section></div>`;
  if(vm.kind==='admin-operaciones'){const create=vm.canManage?form('task-create',`<select name="priority"><option value="normal">Normal</option><option value="high">Alta</option><option value="critical">Crítica</option></select><input name="taskType" value="manual_review"><input name="title" required placeholder="Título"><textarea name="detail" placeholder="Detalle"></textarea>`,'Crear tarea'):'';return `<div class="m26-admin-route">${intro('Control','Centro operativo','Centraliza incidencias y excepciones.')}${create}<section class="m26-admin-panel">${vm.tasks.length?vm.tasks.map((x)=>`<div class="m26-admin-list-item"><div><strong>${e(x.title||x.type)}</strong><p>${e(x.detail||'')}</p></div>${badge(x.status)}${vm.canManage&&!['resolved','cancelled'].includes(x.status)?form('task-resolve',`<input type="hidden" name="taskId" value="${e(x.id)}"><input type="hidden" name="baseRevision" value="${e(x.revision||0)}"><input name="reason" minlength="3" required placeholder="Resolución">`,'Resolver'):''}</div>`).join(''):empty('Sin tareas','No hay incidencias abiertas.')}</section></div>`;}
  if(vm.kind==='admin-comunicacion'){const create=vm.canManage?form('template-save',`<input name="key" pattern="[a-z0-9_.:-]{3,80}" required placeholder="Clave"><input name="name" required placeholder="Nombre"><select name="channel"><option value="in_app">In-app</option><option value="email">Email</option><option value="push">Push</option></select><input name="subject" placeholder="Asunto"><textarea name="body" required placeholder="Contenido"></textarea>`,'Guardar plantilla'):'';return `<div class="m26-admin-route">${intro('Relación','Comunicación','Gestiona plantillas y revisa entregas.')}${create}<section class="m26-admin-panel">${vm.templates.length?vm.templates.map((x)=>`<div class="m26-admin-list-item"><strong>${e(x.name||x.key)}</strong>${badge(x.status)}</div>`).join(''):empty('Sin plantillas','Crea la primera plantilla.')}</section></div>`;}
  if(vm.kind==='admin-automatizaciones'){const create=vm.canManage?form('automation-save',`<input name="key" pattern="[a-z0-9_.:-]{3,80}" required placeholder="Clave"><input name="name" required placeholder="Nombre"><select name="triggerType"><option value="appointment_window_open">Cita</option><option value="client_inactive">Inactividad</option><option value="checkin_due">Check-in</option><option value="iri_review_due">Revisión IRI</option></select><select name="actionType"><option value="notification">Notificación</option><option value="operational_task">Tarea</option></select><select name="status"><option value="draft">Borrador</option><option value="active">Activa</option><option value="paused">Pausada</option></select><textarea name="configuration" placeholder='{"templateKey":"appointment.reminder"}'></textarea>`,'Guardar regla'):'';return `<div class="m26-admin-route">${intro('Eficiencia','Automatizaciones','Automatiza tareas, nunca decisiones profesionales.')}${create}<section class="m26-admin-panel">${vm.rules.length?vm.rules.map((x)=>`<div class="m26-admin-list-item"><strong>${e(x.name||x.key)}</strong>${badge(x.status)}</div>`).join(''):empty('Sin reglas','No hay automatizaciones.')}</section></div>`;}
  if(vm.kind==='admin-analitica')return `<div class="m26-admin-route">${intro('Decisiones','Analítica del servicio','Datos operativos sin inventar métricas ausentes.')}<section class="m26-admin-stats">${stat('Clientes activos',vm.analytics?.activeClients??'Sin datos')}${stat('Adherencia',vm.analytics?.averageAdherence??'Sin datos')}${stat('Bajas 30 días',vm.analytics?.churn30d??'Sin datos')}${stat('Conversión',vm.analytics?.conversionRate??'Sin datos')}</section></div>`;
  if(vm.kind==='admin-auditoria')return `<div class="m26-admin-route">${intro('Seguridad','Auditoría','Historial minimizado e inmutable.')}<section class="m26-admin-panel">${vm.events.length?rows(['Fecha','Evento','Actor','Resumen'],vm.events.map((x)=>`<tr><td>${e(x.occurredAt||'')}</td><td>${e(x.eventType||'')}</td><td>${e(x.actorUserId||'')}</td><td>${e(x.summary||'')}</td></tr>`)):empty('Sin eventos','No hay auditoría visible.')}</section></div>`;
  const org=vm.organization||{};return `<div class="m26-admin-route">${intro('Sistema','Configuración de IBERFIT','Parámetros comunes de las tres aplicaciones.')}<section class="m26-admin-stats">${stat('Organización',org.name||'IBERFIT')}${stat('Zona horaria',org.timezone||'America/Santiago')}${stat('Idioma',org.locale||'es-CL')}</section>${vm.canManage?form('settings-save',`<input type="hidden" name="organizationId" value="${e(org.id)}"><input type="hidden" name="baseRevision" value="${e(org.revision||0)}"><input name="name" value="${e(org.name||'IBERFIT')}" required><input name="timezone" value="${e(org.timezone||'America/Santiago')}" required><input name="locale" value="${e(org.locale||'es-CL')}" required><textarea name="reason" minlength="3" required placeholder="Motivo"></textarea>`,'Guardar configuración'):''}<section class="m26-admin-notice"><strong>Pagos no incluidos</strong><p>Se implementarán al final y únicamente en Admin.</p></section></div>`;}
export function renderAdminRoute(vm){if(!vm?.admin)return null;if(vm.kind==='admin-unavailable')return `<div class="m26-admin-route">${intro('Aplicación Admin','Administración no disponible','El backend RC40 no está instalado o no respondió. Cliente y Coach continúan funcionando.')}</div>`;if(vm.kind==='admin-forbidden')return `<div class="m26-admin-route">${intro('Acceso protegido','Permiso insuficiente','La interfaz no puede conceder capacidades.')}</div>`;if(vm.kind==='admin-inicio')return renderHome(vm);if(vm.kind==='admin-usuarios')return renderUsers(vm);if(vm.kind==='admin-equipo')return renderTeam(vm);if(vm.kind==='admin-clientes')return renderClients(vm);return renderSimple(vm);}
