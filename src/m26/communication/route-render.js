import {buildNotificationCenter} from './notification-center.js';

const e=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const MESSAGE_TIME_FORMATTER=new Intl.DateTimeFormat('es-CL',{
  timeZone:'America/Santiago',dateStyle:'medium',timeStyle:'short',
});
function messageTime(value){
  if(!value)return '';
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))return '';
  return `<time datetime="${e(d.toISOString())}">${e(MESSAGE_TIME_FORMATTER.format(d))}</time>`;
}
function coachComposeAssists(vm){
  if(vm?.role!=='coach')return '';
  const shortcuts=[
    ['session','Después de la sesión'],
    ['recovery','Recuperación'],
    ['next','Próxima sesión'],
  ];
  return `<div class="m45-compose-assists" aria-label="Atajos de seguimiento para Coach">
    <span>Empezar con una idea</span>
    <div class="m45-compose-assist-actions">${shortcuts.map(([key,label])=>
      `<button type="button" data-m45-compose-prompt="${key}">${e(label)}</button>`
    ).join('')}</div>
    <small>El texto se puede editar; solo se envía al pulsar Enviar.</small>
  </div>`;
}
function thread(vm,t){
  const unread=Math.max(0,Math.trunc(Number(t.unreadCount)||0));
  const badge=unread?`<span class="m30-thread-unread" data-thread-unread="${e(unread)}" aria-label="${e(unread)} mensajes sin leer">${e(unread)} nuevos</span>`:'';
  const messages=Array.isArray(t.messages)?t.messages:[];
  const history=messages.length?messages.map((m)=>`<article class="m26-message is-${e(m.senderRole)}"><strong>${e(m.senderRole==='client'?'Cliente':'Coach')}</strong><p>${e(m.body)}</p>${messageTime(m.createdAt)}</article>`).join(''):'<p>Sin mensajes todavía.</p>';
  const heading=e(vm.role==='client'?t.coachName||'Tu Coach':t.clientName||'Cliente');
  const subject=t.subject?`<small class="m45-thread-subject">${e(t.subject)}</small>`:'';
  return `<details class="m26-thread" data-thread-unread-count="${e(unread)}"><summary><span class="m45-thread-identity"><strong>${heading}</strong>${subject}</span>${badge}</summary><div class="m26-thread-body">${history}<form data-communication-form="message-send" class="m30-message-compose" data-guided-required-form><input type="hidden" name="threadId" value="${e(t.id)}"><label class="m32-message-label">Escribe tu mensaje<textarea name="body" maxlength="4000" required placeholder="Escribe un mensaje…"></textarea></label>${coachComposeAssists(vm)}<small data-guided-required-progress aria-live="polite"></small><span class="m45-compose-status" role="status" aria-live="polite"></span><button type="submit" class="m26-primary-action">Enviar</button><small class="m45-response-expectation">Este canal es para el seguimiento de entrenamiento; no garantiza respuesta inmediata.</small></form><form data-communication-form="thread-read" class="m30-thread-read"><input type="hidden" name="threadId" value="${e(t.id)}"><button type="submit">Marcar como leída</button></form></div></details>`;
}
function notificationAction(item){
  const action=item?.action;
  if(!action)return '';
  if(action.type==='coach-client'&&action.entityId){
    return `<button type="button" class="m26-notification-action" data-m26-coach-action="true" data-m26-client-id="${e(action.entityId)}" data-m26-target-area="${e(action.area)}">${e(action.label||'Abrir')}</button>`;
  }
  return `<button type="button" class="m26-notification-action" data-m26-area="${e(action.area)}">${e(action.label||'Abrir')}</button>`;
}
function notificationRead(item){
  if(!item?.persistent||!item.unread||!item.sourceId)return '';
  const ids=[...new Set((Array.isArray(item.unreadSourceIds)?item.unreadSourceIds:[item.sourceId]).filter(Boolean))];
  const selected=ids.slice(0,20);
  const inputs=selected.map((id)=>`<input type="hidden" name="notificationId" value="${e(id)}">`).join('');
  const label=ids.length>20?`Marcar ${selected.length} de ${ids.length} como leídas`
    :ids.length>1?`Marcar ${ids.length} como leídas`:'Marcar leída';
  return `<form data-communication-form="notification-read" class="m26-notification-read">${inputs}<button type="submit">${e(label)}</button></form>`;
}
function notificationCard(item){
  const grouped=Number(item?.count||0)>1?`<small>${e(item.count)} avisos relacionados agrupados</small>`:'';
  return `<article class="m26-notification-card is-${e(item.priority)}" data-notification-priority="${e(item.priority)}"><div class="m26-notification-copy"><span class="m26-notification-priority">${e(item.priorityLabel)}</span><strong>${e(item.title)}</strong><p>${e(item.summary)}</p>${grouped}</div><div class="m26-notification-actions">${notificationAction(item)}${notificationRead(item)}</div></article>`;
}
function notificationGroup(center,priority,label){
  const items=(center?.items||[]).filter((item)=>item.priority===priority);
  if(!items.length)return '';
  return `<section class="m26-notification-group" aria-label="${e(label)}"><div class="m26-notification-group-head"><h4>${e(label)}</h4><span>${e(items.length)}</span></div>${items.map(notificationCard).join('')}</section>`;
}
function webPushControl(){
  return `<section class="m26-web-push-control" data-m26-web-push-control aria-label="Avisos del dispositivo"><div><strong>Avisos en este dispositivo</strong><p data-m26-web-push-status aria-live="polite">Comprobando disponibilidad…</p><small>El permiso del navegador es independiente de las categorías que elijas recibir.</small></div><div class="m26-web-push-actions"><button type="button" class="m26-primary-action" data-m26-web-push-action="enable">Activar avisos</button><button type="button" class="m26-notification-action" data-m26-web-push-action="disable-current" hidden>Desactivar en este dispositivo</button></div></section>`;
}
function notificationCenter(vm){
  const center=buildNotificationCenter({role:vm.role,notifications:vm.notifications,coachCockpit:vm.coachCockpit});
  const unread=center.counts.unread;
  const summary=unread?`${unread} sin leer`:'Al día';
  const content=center.items.length
    ?`${notificationGroup(center,'action-required','Requiere acción')}${notificationGroup(center,'important','Importante')}${notificationGroup(center,'informational','Informativo')}`
    :`<div class="m26-notification-empty"><strong>${e(center.emptyTitle)}</strong><p>${e(center.emptyBody)}</p></div>`;
  return `<aside class="m26-communication-panel m26-notification-center" aria-labelledby="m26-notification-center-title"><div class="m26-notification-center-head"><div><p class="m26-notification-eyebrow">Centro de notificaciones</p><h3 id="m26-notification-center-title">Qué necesita tu atención</h3></div><span class="m26-notification-unread" aria-label="${e(summary)}">${e(summary)}</span></div><p class="m26-notification-privacy">Vista previa protegida: el detalle se consulta dentro de la acción correspondiente.</p>${webPushControl()}${content}</aside>`;
}
function conversationFilters(vm){
  const eligible=Array.isArray(vm?.threads)&&vm.threads.length>1&&vm.role==='coach';
  if(!eligible)return '';
  return `<div class="m45-inbox-tools">
    <label class="m45-inbox-search">Buscar conversación
      <input type="search" data-m45-conversation-search autocomplete="off" autocapitalize="none"
        placeholder="Cliente o asunto" aria-label="Buscar conversación por cliente o asunto">
    </label>
    <button type="button" class="m45-unread-toggle" data-m45-unread-toggle aria-pressed="false">Solo pendientes</button>
  </div><p class="m45-filter-feedback" data-m45-filter-feedback role="status" aria-live="polite"></p>`;
}
export function renderCommunicationRoute(vm){if(!vm?.communication)return null;if(vm.kind==='communication-unavailable')return `<div class="m26-communication-route"><section class="m26-communication-hero"><h2>Mensajes temporalmente no disponibles</h2><p>No pudimos actualizar las conversaciones. Tus datos no se han modificado.</p><button type="button" data-m45-communication-retry class="m26-primary-action">Volver a intentar</button></section></div>`;const open=vm.canOpenThread?`<form data-communication-form="thread-open" class="m26-communication-panel m30-thread-open" data-guided-required-form><h3>Abrir conversación</h3><label class="m32-message-label">Cliente<select name="clientId" required><option value="">Seleccionar cliente</option>${vm.clients.map((c)=>`<option value="${e(c.id)}">${e(c.name||c.id)}</option>`).join('')}</select></label><label class="m32-message-label">Asunto<input name="subject" value="Seguimiento IBERFIT" maxlength="160"></label><small data-guided-required-progress aria-live="polite"></small><button type="submit" class="m26-primary-action">Abrir</button></form>`:'';return `<div class="m26-communication-route" data-communication-role="${e(vm.role||'unknown')}" data-communication-identity="${e(vm.communicationIdentityScope||'')}"><section class="m26-communication-hero"><h2>Mensajes</h2><p>Comunicación privada Cliente–Coach dentro de IBERFIT.</p></section>${open}<section class="m26-communication-grid m30-communication-grid">${notificationCenter(vm)}<article class="m26-communication-panel m30-conversation-panel"><h3>Conversaciones</h3>${conversationFilters(vm)}${vm.threads.length?vm.threads.map((t)=>thread(vm,t)).join(''):vm.role==='client'?'<p class="m45-conversation-empty">Todavía no tienes una conversación abierta. Tu coach podrá comunicarse contigo desde aquí.</p>':'<p class="m45-conversation-empty">Aún no hay conversaciones. Selecciona un cliente para comenzar el seguimiento.</p>'}</article></section></div>`;}
