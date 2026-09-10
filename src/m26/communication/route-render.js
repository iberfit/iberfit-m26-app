import {buildNotificationCenter} from './notification-center.js';

const e=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
function thread(vm,t){return `<details class="m26-thread"><summary><strong>${e(vm.role==='client'?t.coachName||'Tu Coach':t.clientName||'Cliente')}</strong><span class="m30-thread-unread" data-thread-unread="${e(t.unreadCount||0)}">${e(t.unreadCount||0)} nuevos</span></summary><div class="m26-thread-body">${t.messages.length?t.messages.map((m)=>`<article class="m26-message is-${e(m.senderRole)}"><strong>${e(m.senderRole==='client'?'Cliente':'Coach')}</strong><p>${e(m.body)}</p><small>${e(m.createdAt||'')}</small></article>`).join(''):'<p>Sin mensajes todavía.</p>'}<form data-communication-form="message-send" class="m30-message-compose"><input type="hidden" name="threadId" value="${e(t.id)}"><textarea name="body" maxlength="4000" required placeholder="Escribe un mensaje…"></textarea><button type="submit" class="m26-primary-action">Enviar</button></form><form data-communication-form="thread-read" class="m30-thread-read"><input type="hidden" name="threadId" value="${e(t.id)}"><button type="submit">Marcar como leída</button></form></div></details>`;}
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
  return `<form data-communication-form="notification-read" class="m26-notification-read"><input type="hidden" name="notificationId" value="${e(item.sourceId)}"><button type="submit">Marcar leída</button></form>`;
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
function notificationCenter(vm){
  const center=buildNotificationCenter({role:vm.role,notifications:vm.notifications,coachCockpit:vm.coachCockpit});
  const unread=center.counts.unread;
  const summary=unread?`${unread} ${unread===1?'sin leer':'sin leer'}`:'Al día';
  const content=center.items.length
    ?`${notificationGroup(center,'action-required','Requiere acción')}${notificationGroup(center,'important','Importante')}${notificationGroup(center,'informational','Informativo')}`
    :`<div class="m26-notification-empty"><strong>${e(center.emptyTitle)}</strong><p>${e(center.emptyBody)}</p></div>`;
  return `<aside class="m26-communication-panel m26-notification-center" aria-labelledby="m26-notification-center-title"><div class="m26-notification-center-head"><div><p class="m26-notification-eyebrow">Centro de notificaciones</p><h3 id="m26-notification-center-title">Qué necesita tu atención</h3></div><span class="m26-notification-unread" aria-label="${e(summary)}">${e(summary)}</span></div><p class="m26-notification-privacy">Vista previa protegida: el detalle se consulta dentro de la acción correspondiente.</p>${content}</aside>`;
}
export function renderCommunicationRoute(vm){if(!vm?.communication)return null;if(vm.kind==='communication-unavailable')return `<div class="m26-communication-route"><section class="m26-communication-hero"><h2>Mensajes no disponibles</h2><p>El backend de comunicación no está instalado o no respondió.</p></section></div>`;const open=vm.canOpenThread?`<form data-communication-form="thread-open" class="m26-communication-panel m30-thread-open"><h3>Abrir conversación</h3><select name="clientId" required><option value="">Cliente</option>${vm.clients.map((c)=>`<option value="${e(c.id)}">${e(c.name||c.id)}</option>`).join('')}</select><input name="subject" value="Seguimiento IBERFIT"><button type="submit" class="m26-primary-action">Abrir</button></form>`:'';return `<div class="m26-communication-route" data-communication-role="${e(vm.role||'unknown')}"><section class="m26-communication-hero"><h2>Mensajes</h2><p>Comunicación privada Cliente–Coach dentro de IBERFIT.</p></section>${open}<section class="m26-communication-grid m30-communication-grid">${notificationCenter(vm)}<article class="m26-communication-panel m30-conversation-panel"><h3>Conversaciones</h3>${vm.threads.length?vm.threads.map((t)=>thread(vm,t)).join(''):'<p>Sin conversaciones.</p>'}</article></section></div>`;}
