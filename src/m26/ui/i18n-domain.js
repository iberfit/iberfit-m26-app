import {getIberfitLanguage,getIberfitLocale} from './i18n.js';

const DOMAIN_BUNDLES=Object.freeze({
  es:Object.freeze({
    'status.active':'Activo','status.available':'Disponible','status.authorizing':'Solicitando autorización','status.cancelled':'Cancelado','status.confirmed':'Confirmado','status.completed':'Completado','status.conflict':'Conflicto','status.connected':'Conectado','status.draft':'Borrador','status.error':'Error','status.paused':'En pausa','status.pending':'Pendiente','status.published':'Publicado','status.approved':'Aprobado','status.review':'Pendiente de aprobación','status.withdrawn':'Retirado','status.archived':'Archivado','status.ready':'Preparado','status.rejected':'Rechazado','status.revoked':'Revocado','status.syncing':'Sincronizando','status.unavailable':'No disponible','status.fallback':'Sin estado',
    'source.checkin':'Registro de bienestar','source.checkins':'Registros de bienestar','source.sessions':'Sesiones','source.session':'Sesión','source.planning':'Planificación','source.data-quality':'Calidad de los datos','source.wearable':'Datos de dispositivos','source.wearables':'Datos de dispositivos','source.fallback':'IBERFIT',
    'platform.android':'Android','platform.browser':'Navegador','platform.cloud':'Servicio en línea','platform.ios':'iOS','platform.fallback':'Plataforma externa',
    'entity.appointment':'Cita','entity.checkin':'Registro de bienestar','entity.client_access':'Acceso del cliente','entity.habit':'Hábito','entity.habit_log':'Registro de hábito','entity.intelligence':'Propuesta de inteligencia','entity.iri':'Diagnóstico IRI','entity.planning':'Planificación','entity.private_note':'Nota privada','entity.report':'Informe','entity.session':'Sesión','entity.session_execution':'Ejecución de sesión','entity.fallback':'Operación IBERFIT',
    'action.ACTUALIZAR':'Actualizar','action.ANULAR':'Anular','action.APLICAR':'Aplicar','action.APROBAR':'Aprobar','action.ARCHIVAR':'Archivar','action.CANCELAR':'Cancelar','action.CANCELAR_INVITACION':'Cancelar invitación','action.COMPLETAR':'Completar','action.CREAR':'Crear','action.DEFINIR':'Definir','action.DESCARTAR':'Descartar','action.GENERAR':'Generar','action.GUARDAR':'Guardar progreso','action.HABILITAR':'Habilitar','action.INICIAR':'Iniciar','action.INVITAR':'Invitar','action.PUBLICAR':'Publicar','action.REABRIR':'Reabrir','action.REACTIVAR':'Reactivar','action.REANUDAR':'Reanudar','action.REENVIAR':'Reenviar invitación','action.REGISTRAR':'Registrar','action.REPROGRAMAR':'Reprogramar','action.RETIRAR':'Retirar','action.REVISAR':'Revisar','action.SUSPENDER':'Suspender','action.SUSTITUIR':'Sustituir','action.VALIDAR':'Validar',
    'error.M26_NETWORK_UNAVAILABLE':'No hay conexión. Se volverá a intentar de forma segura.','error.REVISION_CONFLICT':'Existe una versión más reciente que debe revisarse.','error.ROLE_FORBIDDEN':'La cuenta actual no tiene permiso para completar esta operación.','error.REJECTED':'La operación no fue aceptada y requiere revisión.','error.review':'La operación requiere revisión antes de continuar.','error.pending':'{entity} pendiente de confirmación.',
    'coach.signal.critical':'Atención prioritaria','coach.signal.warning':'Revisar contexto','coach.signal.process':'Recorrido pendiente','coach.signal.info':'Seguimiento','coach.signal.clear':'Al día','coach.stage.active':'Seguimiento activo','coach.reason.clear':'Seguimiento al día','coach.detail.clear':'No hay señales que requieran una acción adicional.','coach.guidance.clear':'Mantener el seguimiento previsto.','coach.reason.review':'Revisión necesaria','coach.detail.adaptive':'El contexto adaptativo requiere revisión.','coach.detail.risk':'Existe una señal que requiere revisión.','coach.detail.process':'El recorrido del cliente tiene un paso pendiente.','coach.detail.info':'Existe información útil para el seguimiento.','coach.guidance.context':'Revisar el contexto con el cliente.','coach.guidance.followup':'Revisar durante el seguimiento.','coach.action.record':'Revisar expediente','coach.action.followup':'Revisar seguimiento','coach.nextStep':'Siguiente paso: {action}.','coach.client':'Cliente',
  }),
  en:Object.freeze({
    'status.active':'Active','status.available':'Available','status.authorizing':'Requesting authorisation','status.cancelled':'Cancelled','status.confirmed':'Confirmed','status.completed':'Completed','status.conflict':'Conflict','status.connected':'Connected','status.draft':'Draft','status.error':'Error','status.paused':'Paused','status.pending':'Pending','status.published':'Published','status.approved':'Approved','status.review':'Pending approval','status.withdrawn':'Withdrawn','status.archived':'Archived','status.ready':'Ready','status.rejected':'Rejected','status.revoked':'Revoked','status.syncing':'Syncing','status.unavailable':'Unavailable','status.fallback':'No status',
    'source.checkin':'Wellbeing check-in','source.checkins':'Wellbeing check-ins','source.sessions':'Sessions','source.session':'Session','source.planning':'Planning','source.data-quality':'Data quality','source.wearable':'Device data','source.wearables':'Device data','source.fallback':'IBERFIT',
    'platform.android':'Android','platform.browser':'Browser','platform.cloud':'Online service','platform.ios':'iOS','platform.fallback':'External platform',
    'entity.appointment':'Appointment','entity.checkin':'Wellbeing check-in','entity.client_access':'Client access','entity.habit':'Habit','entity.habit_log':'Habit log','entity.intelligence':'Intelligence proposal','entity.iri':'IRI Assessment','entity.planning':'Planning','entity.private_note':'Private note','entity.report':'Report','entity.session':'Session','entity.session_execution':'Session execution','entity.fallback':'IBERFIT operation',
    'action.ACTUALIZAR':'Update','action.ANULAR':'Void','action.APLICAR':'Apply','action.APROBAR':'Approve','action.ARCHIVAR':'Archive','action.CANCELAR':'Cancel','action.CANCELAR_INVITACION':'Cancel invitation','action.COMPLETAR':'Complete','action.CREAR':'Create','action.DEFINIR':'Set','action.DESCARTAR':'Discard','action.GENERAR':'Generate','action.GUARDAR':'Save progress','action.HABILITAR':'Enable','action.INICIAR':'Start','action.INVITAR':'Invite','action.PUBLICAR':'Publish','action.REABRIR':'Reopen','action.REACTIVAR':'Reactivate','action.REANUDAR':'Resume','action.REENVIAR':'Resend invitation','action.REGISTRAR':'Record','action.REPROGRAMAR':'Reschedule','action.RETIRAR':'Withdraw','action.REVISAR':'Review','action.SUSPENDER':'Suspend','action.SUSTITUIR':'Replace','action.VALIDAR':'Validate',
    'error.M26_NETWORK_UNAVAILABLE':'You are offline. IBERFIT will retry safely.','error.REVISION_CONFLICT':'A newer version exists and must be reviewed.','error.ROLE_FORBIDDEN':'The current account does not have permission to complete this operation.','error.REJECTED':'The operation was not accepted and needs review.','error.review':'The operation needs review before continuing.','error.pending':'{entity} pending confirmation.',
    'coach.signal.critical':'Priority attention','coach.signal.warning':'Review context','coach.signal.process':'Journey pending','coach.signal.info':'Follow-up','coach.signal.clear':'Up to date','coach.stage.active':'Active follow-up','coach.reason.clear':'Follow-up up to date','coach.detail.clear':'There are no signals requiring additional action.','coach.guidance.clear':'Keep the planned follow-up.','coach.reason.review':'Review needed','coach.detail.adaptive':'The adaptive context needs review.','coach.detail.risk':'A signal needs review.','coach.detail.process':'The client journey has a pending step.','coach.detail.info':'There is useful information for follow-up.','coach.guidance.context':'Review the context with the client.','coach.guidance.followup':'Review during follow-up.','coach.action.record':'Review client record','coach.action.followup':'Review follow-up','coach.nextStep':'Next step: {action}.','coach.client':'Client',
  }),
  fr:Object.freeze({
    'status.active':'Actif','status.available':'Disponible','status.authorizing':'Autorisation en cours','status.cancelled':'Annulé','status.confirmed':'Confirmé','status.completed':'Terminé','status.conflict':'Conflit','status.connected':'Connecté','status.draft':'Brouillon','status.error':'Erreur','status.paused':'En pause','status.pending':'En attente','status.published':'Publié','status.approved':'Approuvé','status.review':'En attente d’approbation','status.withdrawn':'Retiré','status.archived':'Archivé','status.ready':'Prêt','status.rejected':'Rejeté','status.revoked':'Révoqué','status.syncing':'Synchronisation','status.unavailable':'Indisponible','status.fallback':'Sans statut',
    'source.checkin':'Suivi du bien-être','source.checkins':'Suivis du bien-être','source.sessions':'Séances','source.session':'Séance','source.planning':'Planification','source.data-quality':'Qualité des données','source.wearable':'Données des appareils','source.wearables':'Données des appareils','source.fallback':'IBERFIT',
    'platform.android':'Android','platform.browser':'Navigateur','platform.cloud':'Service en ligne','platform.ios':'iOS','platform.fallback':'Plateforme externe',
    'entity.appointment':'Rendez-vous','entity.checkin':'Suivi du bien-être','entity.client_access':'Accès client','entity.habit':'Habitude','entity.habit_log':'Suivi d’habitude','entity.intelligence':'Proposition intelligente','entity.iri':'Diagnostic IRI','entity.planning':'Planification','entity.private_note':'Note privée','entity.report':'Rapport','entity.session':'Séance','entity.session_execution':'Exécution de séance','entity.fallback':'Opération IBERFIT',
    'action.ACTUALIZAR':'Mettre à jour','action.ANULAR':'Annuler','action.APLICAR':'Appliquer','action.APROBAR':'Approuver','action.ARCHIVAR':'Archiver','action.CANCELAR':'Annuler','action.CANCELAR_INVITACION':'Annuler l’invitation','action.COMPLETAR':'Terminer','action.CREAR':'Créer','action.DEFINIR':'Définir','action.DESCARTAR':'Écarter','action.GENERAR':'Générer','action.GUARDAR':'Enregistrer la progression','action.HABILITAR':'Activer','action.INICIAR':'Démarrer','action.INVITAR':'Inviter','action.PUBLICAR':'Publier','action.REABRIR':'Rouvrir','action.REACTIVAR':'Réactiver','action.REANUDAR':'Reprendre','action.REENVIAR':'Renvoyer l’invitation','action.REGISTRAR':'Enregistrer','action.REPROGRAMAR':'Reprogrammer','action.RETIRAR':'Retirer','action.REVISAR':'Réviser','action.SUSPENDER':'Suspendre','action.SUSTITUIR':'Remplacer','action.VALIDAR':'Valider',
    'error.M26_NETWORK_UNAVAILABLE':'Aucune connexion. IBERFIT réessaiera en toute sécurité.','error.REVISION_CONFLICT':'Une version plus récente existe et doit être vérifiée.','error.ROLE_FORBIDDEN':'Le compte actuel n’a pas l’autorisation d’effectuer cette opération.','error.REJECTED':'L’opération n’a pas été acceptée et doit être vérifiée.','error.review':'L’opération doit être vérifiée avant de continuer.','error.pending':'{entity} en attente de confirmation.',
    'coach.signal.critical':'Attention prioritaire','coach.signal.warning':'Vérifier le contexte','coach.signal.process':'Parcours en attente','coach.signal.info':'Suivi','coach.signal.clear':'À jour','coach.stage.active':'Suivi actif','coach.reason.clear':'Suivi à jour','coach.detail.clear':'Aucun signal ne nécessite d’action supplémentaire.','coach.guidance.clear':'Maintenir le suivi prévu.','coach.reason.review':'Vérification nécessaire','coach.detail.adaptive':'Le contexte adaptatif doit être vérifié.','coach.detail.risk':'Un signal doit être vérifié.','coach.detail.process':'Le parcours du client comporte une étape en attente.','coach.detail.info':'Des informations utiles sont disponibles pour le suivi.','coach.guidance.context':'Vérifier le contexte avec le client.','coach.guidance.followup':'Vérifier pendant le suivi.','coach.action.record':'Ouvrir le dossier client','coach.action.followup':'Vérifier le suivi','coach.nextStep':'Prochaine étape : {action}.','coach.client':'Client',
  }),
  pt:Object.freeze({
    'status.active':'Ativo','status.available':'Disponível','status.authorizing':'A solicitar autorização','status.cancelled':'Cancelado','status.confirmed':'Confirmado','status.completed':'Concluído','status.conflict':'Conflito','status.connected':'Ligado','status.draft':'Rascunho','status.error':'Erro','status.paused':'Em pausa','status.pending':'Pendente','status.published':'Publicado','status.approved':'Aprovado','status.review':'A aguardar aprovação','status.withdrawn':'Retirado','status.archived':'Arquivado','status.ready':'Preparado','status.rejected':'Rejeitado','status.revoked':'Revogado','status.syncing':'A sincronizar','status.unavailable':'Indisponível','status.fallback':'Sem estado',
    'source.checkin':'Registo de bem-estar','source.checkins':'Registos de bem-estar','source.sessions':'Sessões','source.session':'Sessão','source.planning':'Planeamento','source.data-quality':'Qualidade dos dados','source.wearable':'Dados de dispositivos','source.wearables':'Dados de dispositivos','source.fallback':'IBERFIT',
    'platform.android':'Android','platform.browser':'Navegador','platform.cloud':'Serviço online','platform.ios':'iOS','platform.fallback':'Plataforma externa',
    'entity.appointment':'Marcação','entity.checkin':'Registo de bem-estar','entity.client_access':'Acesso do cliente','entity.habit':'Hábito','entity.habit_log':'Registo de hábito','entity.intelligence':'Proposta de inteligência','entity.iri':'Diagnóstico IRI','entity.planning':'Planeamento','entity.private_note':'Nota privada','entity.report':'Relatório','entity.session':'Sessão','entity.session_execution':'Execução de sessão','entity.fallback':'Operação IBERFIT',
    'action.ACTUALIZAR':'Atualizar','action.ANULAR':'Anular','action.APLICAR':'Aplicar','action.APROBAR':'Aprovar','action.ARCHIVAR':'Arquivar','action.CANCELAR':'Cancelar','action.CANCELAR_INVITACION':'Cancelar convite','action.COMPLETAR':'Concluir','action.CREAR':'Criar','action.DEFINIR':'Definir','action.DESCARTAR':'Descartar','action.GENERAR':'Gerar','action.GUARDAR':'Guardar progresso','action.HABILITAR':'Ativar','action.INICIAR':'Iniciar','action.INVITAR':'Convidar','action.PUBLICAR':'Publicar','action.REABRIR':'Reabrir','action.REACTIVAR':'Reativar','action.REANUDAR':'Retomar','action.REENVIAR':'Reenviar convite','action.REGISTRAR':'Registar','action.REPROGRAMAR':'Reagendar','action.RETIRAR':'Retirar','action.REVISAR':'Rever','action.SUSPENDER':'Suspender','action.SUSTITUIR':'Substituir','action.VALIDAR':'Validar',
    'error.M26_NETWORK_UNAVAILABLE':'Sem ligação. O IBERFIT voltará a tentar de forma segura.','error.REVISION_CONFLICT':'Existe uma versão mais recente que deve ser revista.','error.ROLE_FORBIDDEN':'A conta atual não tem permissão para concluir esta operação.','error.REJECTED':'A operação não foi aceite e requer revisão.','error.review':'A operação requer revisão antes de continuar.','error.pending':'{entity} pendente de confirmação.',
    'coach.signal.critical':'Atenção prioritária','coach.signal.warning':'Rever contexto','coach.signal.process':'Percurso pendente','coach.signal.info':'Acompanhamento','coach.signal.clear':'Em dia','coach.stage.active':'Acompanhamento ativo','coach.reason.clear':'Acompanhamento em dia','coach.detail.clear':'Não existem sinais que exijam uma ação adicional.','coach.guidance.clear':'Manter o acompanhamento previsto.','coach.reason.review':'Revisão necessária','coach.detail.adaptive':'O contexto adaptativo requer revisão.','coach.detail.risk':'Existe um sinal que requer revisão.','coach.detail.process':'O percurso do cliente tem um passo pendente.','coach.detail.info':'Existe informação útil para o acompanhamento.','coach.guidance.context':'Rever o contexto com o cliente.','coach.guidance.followup':'Rever durante o acompanhamento.','coach.action.record':'Rever processo do cliente','coach.action.followup':'Rever acompanhamento','coach.nextStep':'Próximo passo: {action}.','coach.client':'Cliente',
  }),
});

const STATUS_ALIASES=Object.freeze({
  activo:'active',disponible:'available',cancelado:'cancelled',confirmado:'confirmed',clean:'confirmed',completado:'completed',conflicto:'conflict',conectado:'connected',borrador:'draft',pausado:'paused',pendiente:'pending',publicado:'published',aprobado:'approved',revision:'review',en_revision:'review',validado:'review',validated:'review',retirado:'withdrawn',archivado:'archived',preparado:'ready',rechazado:'rejected',rechazada:'rejected',revocado:'revoked',sincronizando:'syncing',
});
const SOURCE_ALIASES=Object.freeze({registro_bienestar:'checkin',data_quality:'data-quality'});
const ACTION_KEYS=Object.freeze(['ACTUALIZAR','ANULAR','APLICAR','APROBAR','ARCHIVAR','CANCELAR_INVITACION','CANCELAR','COMPLETAR','CREAR','DEFINIR','DESCARTAR','GENERAR','GUARDAR','HABILITAR','INICIAR','INVITAR','PUBLICAR','REABRIR','REACTIVAR','REANUDAR','REENVIAR','REGISTRAR','REPROGRAMAR','RETIRAR','REVISAR','SUSPENDER','SUSTITUIR','VALIDAR'].sort((a,b)=>b.length-a.length));

function language(value=getIberfitLanguage()){
  const normalized=String(value||'').trim().toLowerCase();
  return Object.hasOwn(DOMAIN_BUNDLES,normalized)?normalized:'es';
}
function interpolate(value,params={}){
  return String(value??'').replace(/\{([a-zA-Z0-9_.-]+)\}/g,(_,key)=>String(params?.[key]??`{${key}}`));
}
export function iberfitDomainTranslate(key,{language:requestedLanguage=getIberfitLanguage(),fallback=null,params={}}={}){
  const selected=DOMAIN_BUNDLES[language(requestedLanguage)]||DOMAIN_BUNDLES.es;
  const raw=Object.hasOwn(selected,key)?selected[key]:Object.hasOwn(DOMAIN_BUNDLES.es,key)?DOMAIN_BUNDLES.es[key]:fallback??String(key||'');
  return interpolate(raw,params);
}
export function iberfitDomainTranslationCoverage(){
  const referenceKeys=Object.keys(DOMAIN_BUNDLES.es).sort();
  return Object.freeze(Object.keys(DOMAIN_BUNDLES).map((lang)=>{
    const selected=DOMAIN_BUNDLES[lang];
    const selectedKeys=Object.keys(selected).sort();
    const selectedSet=new Set(selectedKeys),referenceSet=new Set(referenceKeys);
    const missing=referenceKeys.filter((key)=>!selectedSet.has(key));
    const extra=selectedKeys.filter((key)=>!referenceSet.has(key));
    const blank=selectedKeys.filter((key)=>String(selected[key]??'').trim()==='');
    return Object.freeze({language:lang,total:referenceKeys.length,missing:Object.freeze(missing),extra:Object.freeze(extra),blank:Object.freeze(blank),complete:missing.length===0&&extra.length===0&&blank.length===0});
  }));
}
export function iberfitStatusLabel(value,{fallback=null,language:requestedLanguage=getIberfitLanguage()}={}){
  const raw=String(value??'').trim().toLowerCase();
  if(!raw)return fallback??iberfitDomainTranslate('status.fallback',{language:requestedLanguage});
  const key=STATUS_ALIASES[raw]||raw;
  const translated=iberfitDomainTranslate(`status.${key}`,{language:requestedLanguage,fallback:null});
  if(translated!==`status.${key}`)return translated;
  return fallback??raw.replaceAll('_',' ').replace(/^./,(letter)=>letter.toUpperCase());
}
export function iberfitSourceLabel(value,{fallback=null,language:requestedLanguage=getIberfitLanguage()}={}){
  const raw=String(value??'').trim().toLowerCase();
  const key=SOURCE_ALIASES[raw]||raw;
  return iberfitDomainTranslate(`source.${key}`,{language:requestedLanguage,fallback:fallback??iberfitDomainTranslate('source.fallback',{language:requestedLanguage})});
}
export function iberfitPlatformLabel(value,{language:requestedLanguage=getIberfitLanguage()}={}){
  const key=String(value??'').trim().toLowerCase();
  return iberfitDomainTranslate(`platform.${key}`,{language:requestedLanguage,fallback:iberfitDomainTranslate('platform.fallback',{language:requestedLanguage})});
}
export function iberfitEntityLabel(value,{language:requestedLanguage=getIberfitLanguage()}={}){
  const key=String(value??'').trim().toLowerCase();
  return iberfitDomainTranslate(`entity.${key}`,{language:requestedLanguage,fallback:iberfitDomainTranslate('entity.fallback',{language:requestedLanguage})});
}
export function iberfitOperationTitle(type,entityType='',{language:requestedLanguage=getIberfitLanguage()}={}){
  const raw=String(type??'').trim().toUpperCase();
  const action=ACTION_KEYS.find((candidate)=>raw===candidate||raw.endsWith(`_${candidate}`));
  const entity=iberfitEntityLabel(entityType||raw.toLowerCase(),{language:requestedLanguage});
  const actionLabel=action?iberfitDomainTranslate(`action.${action}`,{language:requestedLanguage}):null;
  return actionLabel?`${entity} · ${actionLabel}`:entity;
}
export function iberfitOperationDetail(errorCode,entityType='',{language:requestedLanguage=getIberfitLanguage()}={}){
  const code=String(errorCode??'').trim().toUpperCase();
  if(code){
    const translated=iberfitDomainTranslate(`error.${code}`,{language:requestedLanguage,fallback:null});
    if(translated!==`error.${code}`)return translated;
    return iberfitDomainTranslate('error.review',{language:requestedLanguage});
  }
  return iberfitDomainTranslate('error.pending',{language:requestedLanguage,params:{entity:iberfitEntityLabel(entityType,{language:requestedLanguage})}});
}
export function iberfitCompareText(a,b,{language:requestedLanguage=getIberfitLanguage()}={}){
  const locale=getIberfitLocale(language(requestedLanguage));
  return String(a??'').localeCompare(String(b??''),locale,{sensitivity:'base'});
}
export function iberfitFormatNumber(value,options={},locale=getIberfitLocale()){
  const number=Number(value);
  if(!Number.isFinite(number))return '';
  try{return new Intl.NumberFormat(locale,options).format(number);}catch{return String(number);}
}
export function iberfitFormatDate(value,options={dateStyle:'medium'},locale=getIberfitLocale()){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  try{return new Intl.DateTimeFormat(locale,options).format(date);}catch{return date.toISOString();}
}
