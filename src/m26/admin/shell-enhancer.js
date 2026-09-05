function escapeHtml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function checked(value){return value?' checked':'';}
function consent(path,title,copy,value){
  return `<label class="m26-consent"><input type="checkbox" data-m26-preference="${escapeHtml(path)}"${checked(Boolean(value))}><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></span></label>`;
}
function personalSettings(vm){
  const preferences=vm?.experiencePreferences||{};
  const notifications=preferences.notifications||{};
  const social=preferences.social||{};
  const sharingEnabled=Boolean(social.sharingEnabled);
  return `<div class="m26-settings-block" data-m26-admin-personal-settings aria-labelledby="m26-admin-personal-settings-title"><div><strong id="m26-admin-personal-settings-title">Preferencias personales</strong><p>Estos ajustes pertenecen a tu usuario Admin y no modifican la configuración operativa de IBERFIT.</p></div><div class="m26-settings-stack"><p class="m26-eyebrow">Avisos</p>${consent('notifications.sessionReminders','Próxima sesión','Recordatorios de sesiones confirmadas.',notifications.sessionReminders)}${consent('notifications.scheduleChanges','Cambios de agenda','Cambios confirmados en fecha u hora.',notifications.scheduleChanges)}${consent('notifications.planPublished','Plan publicado','Avisos cuando se publica una planificación.',notifications.planPublished)}${consent('notifications.coachMessages','Mensajes','Avisos asociados a comunicaciones reales.',notifications.coachMessages)}${consent('notifications.challenges','Retos','Cambios relevantes en retos privados.',notifications.challenges)}${consent('notifications.milestones','Hitos','Hitos calculados únicamente desde datos confirmados.',notifications.milestones)}<p class="m26-data-footnote">Estas preferencias registran consentimiento. No se promete entrega push hasta que exista el servicio; los avisos esenciales de sincronización siguen visibles dentro de la app.</p></div><div class="m26-settings-stack"><p class="m26-eyebrow">Privacidad</p>${consent('social.sharingEnabled','Permitir compartir','Nada se comparte hasta que lo autorices explícitamente.',social.sharingEnabled)}<label><strong>Alcance</strong><small>Elige quién puede recibir manualmente la información autorizada.</small><select data-m26-preference="social.audience"${sharingEnabled?'':' disabled aria-disabled="true"'}><option value="private"${social.audience==='private'?' selected':''}>Solo yo</option><option value="coach"${social.audience==='coach'?' selected':''}>Mi Coach</option></select></label><label class="m26-consent"><input type="checkbox" data-m26-preference="social.shareSessionSummary"${checked(Boolean(social.shareSessionSummary))}${sharingEnabled?'':' disabled aria-disabled="true"'}><span><strong>Resumen de sesiones</strong><small>Autoriza compartirlo manualmente con el alcance elegido.</small></span></label><label class="m26-consent"><input type="checkbox" data-m26-preference="social.shareMilestones"${checked(Boolean(social.shareMilestones))}${sharingEnabled?'':' disabled aria-disabled="true"'}><span><strong>Hitos</strong><small>Solo hitos confirmados; nunca peso, IMC, dolor, IRI o datos clínicos.</small></span></label><p class="m26-data-footnote">No existe publicación automática ni ranking público. Al desactivar compartir, el alcance vuelve a privado.</p></div></div>`;
}
export function enhanceAdminShellMarkup(markup,vm){
  if(vm?.mode!=='authenticated'||vm?.identity?.role!=='admin')return markup;
  const personal=personalSettings(vm);
  return String(markup||'')
    .replace('<div class="m26-shell"','<div class="m26-shell m26-admin-shell"')
    .replace('aria-label="Navegación IBERFIT"','aria-label="Navegación de la Aplicación Admin"')
    .replace('<p class="m26-settings-hint">',`${personal}<p class="m26-settings-hint">`);
}
