// RC74_4_I18N_WORKSPACE_V2_BEGIN
export const IBERFIT_LANGUAGE_STORAGE_KEY='iberfit:m26:ui-language';
export const IBERFIT_LOCALE_STORAGE_KEY='iberfit:m26:ui-locale';

export const IBERFIT_LANGUAGE_CATALOG=Object.freeze([
  Object.freeze({
    value:'es',
    label:'Español',
    nativeLabel:'Español',
    flag:'🇪🇸',
    defaultLocale:'es-CL',
    locales:Object.freeze(['es-CL','es-ES']),
  }),
  Object.freeze({
    value:'en',
    label:'English',
    nativeLabel:'English',
    flag:'🇬🇧',
    defaultLocale:'en-GB',
    locales:Object.freeze(['en-GB','en-US']),
  }),
  Object.freeze({
    value:'fr',
    label:'Français',
    nativeLabel:'Français',
    flag:'🇫🇷',
    defaultLocale:'fr-FR',
    locales:Object.freeze(['fr-FR']),
  }),
  Object.freeze({
    value:'pt',
    label:'Português',
    nativeLabel:'Português',
    flag:'🇵🇹',
    defaultLocale:'pt-PT',
    locales:Object.freeze(['pt-PT','pt-BR']),
  }),
]);

const LOCALE_LABELS=Object.freeze({
  'es-CL':'Chile',
  'es-ES':'España',
  'en-GB':'United Kingdom',
  'en-US':'United States',
  'fr-FR':'France',
  'pt-PT':'Portugal',
  'pt-BR':'Brasil',
});

const BUNDLES=Object.freeze({
  es:Object.freeze({
    'common.more':'Más',
    'common.logout':'Cerrar sesión',
    'common.logoutClear':'Cerrar sesión y borrar datos de este dispositivo',
    'common.search':'Buscar y acciones',
    'common.close':'Cerrar',
    'common.selectedClient':'Expediente activo',
    'common.selectClient':'Selecciona un cliente',
    'common.noClient':'Sin expediente seleccionado',
    'common.pendingClear':'Sin cambios locales pendientes',
    'common.clientRequired':'Selecciona un cliente para abrir esta función',
    'common.quickAccess':'Acceso rápido',
    'common.allTools':'Todas las herramientas',
    'settings.title':'Ajustes',
    'settings.open':'Ajustes',
    'settings.subtitle':'Personaliza tu experiencia IBERFIT',
    'settings.language':'Idioma de la aplicación',
    'settings.languageCopy':'Elige el idioma de menús, navegación y espacios de trabajo.',
    'settings.region':'Región y formato',
    'settings.regionCopy':'Ajusta formatos regionales sin cambiar tu idioma.',
    'settings.savedLocal':'La preferencia se guarda en este dispositivo.',
    'settings.fullSettings':'Abrir todos los ajustes',
    'settings.privacy':'Privacidad',
    'nav.admin.direction':'Dirección',
    'nav.admin.people':'Personas',
    'nav.admin.operation':'Operación',
    'nav.admin.control':'Control y sistema',
    'nav.coach.day':'Mi día',
    'nav.coach.clients':'Clientes y entrenamiento',
    'nav.coach.resources':'Comunicación y recursos',
    'nav.coach.control':'Control',
    'nav.client.main':'Mi entrenamiento',
    'nav.client.followup':'Mi seguimiento',
    'nav.client.account':'Mi cuenta',
    'workspace.admin.eyebrow':'Centro de mando',
    'workspace.admin.title':'Todo IBERFIT, claro y bajo control',
    'workspace.admin.copy':'Empieza por personas, agenda u operación. Las áreas avanzadas quedan agrupadas para encontrarlas sin perderte.',
    'workspace.admin.primary':'Acciones principales',
    'workspace.admin.map':'Mapa de administración',
    'workspace.coach.eyebrow':'Centro Coach',
    'workspace.coach.title':'Tu trabajo de hoy, en el orden correcto',
    'workspace.coach.copy':'Prioriza clientes, agenda y entrenamiento. El expediente reúne evaluación, planificación, progreso y seguimiento.',
    'workspace.coach.primary':'Atajos de trabajo',
    'workspace.coach.map':'Todo lo que puedes hacer',
    'workspace.action.open':'Abrir',
    'workspace.action.clients':'Gestionar clientes',
    'workspace.action.clients.copy':'Alta, seguimiento, estado y próximo paso de cada cliente.',
    'workspace.action.agenda':'Revisar agenda',
    'workspace.action.agenda.copy':'Sesiones, disponibilidad y capacidad de trabajo.',
    'workspace.action.team':'Gestionar equipo',
    'workspace.action.team.copy':'Coaches, asignaciones y responsabilidades.',
    'workspace.action.analytics':'Ver analítica',
    'workspace.action.analytics.copy':'Evolución operativa y señales del servicio.',
    'workspace.action.today':'Ver prioridades de hoy',
    'workspace.action.today.copy':'Empieza por lo que requiere decisión o seguimiento.',
    'workspace.action.library':'Abrir biblioteca',
    'workspace.action.library.copy':'Ejercicios y recursos para preparar sesiones.',
    'workspace.action.messages':'Abrir mensajes',
    'workspace.action.messages.copy':'Conversaciones y seguimiento con clientes.',
    'workspace.action.plan':'Preparar entrenamiento',
    'workspace.action.plan.copy':'Planificación y sesiones del cliente seleccionado.',
    'area.hoy.label':'Hoy','area.hoy.title':'Hoy en IBERFIT',
    'area.clientes.label':'Clientes','area.clientes.title':'Clientes',
    'area.expediente.label':'Expediente','area.expediente.title':'Expediente IBERFIT',
    'area.iri.label':'Diagnóstico IRI','area.iri.title':'Diagnóstico IRI',
    'area.informes.label':'Informes','area.informes.title':'Informes',
    'area.planificacion.label':'Planificación','area.planificacion.title':'Planificación',
    'area.agenda.label':'Agenda','area.agenda.title':'Agenda',
    'area.sesion.label':'Sesiones','area.sesion.title':'Sesiones',
    'area.progreso.label':'Progreso','area.progreso.title':'Progreso',
    'area.actividad.label':'Actividad y dispositivos','area.actividad.title':'Actividad, hábitos y dispositivos',
    'area.notas.label':'Notas privadas','area.notas.title':'Notas privadas del entrenador',
    'area.inteligencia.label':'Copilot','area.inteligencia.title':'Inteligencia IBERFIT',
    'area.biblioteca.label':'Biblioteca','area.biblioteca.title':'Biblioteca visual',
    'area.retos.label':'Retos','area.retos.title':'Retos y comunidad',
    'area.ajustes.label':'Ajustes','area.ajustes.title':'Ajustes',
    'area.verificacion.label':'Sincronización','area.verificacion.title':'Estado de cambios',
    'area.mensajes.label':'Mensajes','area.mensajes.title':'Mensajes IBERFIT',
    'area.admin-inicio.label':'Resumen','area.admin-inicio.title':'Centro de control',
    'area.admin-usuarios.label':'Usuarios y accesos','area.admin-usuarios.title':'Usuarios y accesos',
    'area.admin-equipo.label':'Equipo y asignaciones','area.admin-equipo.title':'Equipo y asignaciones',
    'area.admin-clientes.label':'CRM y clientes','area.admin-clientes.title':'CRM y ciclo de vida',
    'area.admin-agenda.label':'Agenda y capacidad','area.admin-agenda.title':'Agenda y capacidad',
    'area.admin-operaciones.label':'Operaciones','area.admin-operaciones.title':'Centro operativo',
    'area.admin-comunicacion.label':'Comunicación','area.admin-comunicacion.title':'Comunicación y plantillas',
    'area.admin-automatizaciones.label':'Automatizaciones','area.admin-automatizaciones.title':'Reglas automáticas',
    'area.admin-analitica.label':'Analítica','area.admin-analitica.title':'Analítica del servicio',
    'area.admin-auditoria.label':'Auditoría','area.admin-auditoria.title':'Auditoría y trazabilidad',
    'area.admin-configuracion.label':'Configuración','area.admin-configuracion.title':'Configuración de IBERFIT',
  }),
  en:Object.freeze({
    'common.more':'More','common.logout':'Sign out','common.logoutClear':'Sign out and clear data from this device','common.search':'Search and actions','common.close':'Close','common.selectedClient':'Active client record','common.selectClient':'Select a client','common.noClient':'No client record selected','common.pendingClear':'No pending local changes','common.clientRequired':'Select a client to open this feature','common.quickAccess':'Quick access','common.allTools':'All tools',
    'settings.title':'Settings','settings.open':'Settings','settings.subtitle':'Personalise your IBERFIT experience','settings.language':'App language','settings.languageCopy':'Choose the language for menus, navigation and workspaces.','settings.region':'Region and formats','settings.regionCopy':'Adjust regional formats without changing your language.','settings.savedLocal':'Your preference is stored on this device.','settings.fullSettings':'Open all settings','settings.privacy':'Privacy',
    'nav.admin.direction':'Management','nav.admin.people':'People','nav.admin.operation':'Operations','nav.admin.control':'Control & system','nav.coach.day':'My day','nav.coach.clients':'Clients & training','nav.coach.resources':'Communication & resources','nav.coach.control':'Control','nav.client.main':'My training','nav.client.followup':'My progress','nav.client.account':'My account',
    'workspace.admin.eyebrow':'Command centre','workspace.admin.title':'All of IBERFIT, clear and under control','workspace.admin.copy':'Start with people, schedule or operations. Advanced areas are grouped so you can find them without getting lost.','workspace.admin.primary':'Main actions','workspace.admin.map':'Administration map','workspace.coach.eyebrow':'Coach centre','workspace.coach.title':'Today’s work, in the right order','workspace.coach.copy':'Prioritise clients, schedule and training. Each client record brings assessment, planning, progress and follow-up together.','workspace.coach.primary':'Work shortcuts','workspace.coach.map':'Everything you can do','workspace.action.open':'Open','workspace.action.clients':'Manage clients','workspace.action.clients.copy':'Onboarding, follow-up, status and next step for every client.','workspace.action.agenda':'Review schedule','workspace.action.agenda.copy':'Sessions, availability and workload capacity.','workspace.action.team':'Manage team','workspace.action.team.copy':'Coaches, assignments and responsibilities.','workspace.action.analytics':'View analytics','workspace.action.analytics.copy':'Operational evolution and service signals.','workspace.action.today':'View today’s priorities','workspace.action.today.copy':'Start with what needs a decision or follow-up.','workspace.action.library':'Open library','workspace.action.library.copy':'Exercises and resources to prepare sessions.','workspace.action.messages':'Open messages','workspace.action.messages.copy':'Conversations and follow-up with clients.','workspace.action.plan':'Prepare training','workspace.action.plan.copy':'Planning and sessions for the selected client.',
    'area.hoy.label':'Today','area.hoy.title':'Today at IBERFIT','area.clientes.label':'Clients','area.clientes.title':'Clients','area.expediente.label':'Client record','area.expediente.title':'IBERFIT client record','area.iri.label':'IRI Assessment','area.iri.title':'IRI Assessment','area.informes.label':'Reports','area.informes.title':'Reports','area.planificacion.label':'Planning','area.planificacion.title':'Planning','area.agenda.label':'Schedule','area.agenda.title':'Schedule','area.sesion.label':'Sessions','area.sesion.title':'Sessions','area.progreso.label':'Progress','area.progreso.title':'Progress','area.actividad.label':'Activity & devices','area.actividad.title':'Activity, habits and devices','area.notas.label':'Private notes','area.notas.title':'Coach private notes','area.inteligencia.label':'Copilot','area.inteligencia.title':'IBERFIT Intelligence','area.biblioteca.label':'Library','area.biblioteca.title':'Visual library','area.retos.label':'Challenges','area.retos.title':'Challenges & community','area.ajustes.label':'Settings','area.ajustes.title':'Settings','area.verificacion.label':'Sync','area.verificacion.title':'Change status','area.mensajes.label':'Messages','area.mensajes.title':'IBERFIT Messages',
    'area.admin-inicio.label':'Overview','area.admin-inicio.title':'Control centre','area.admin-usuarios.label':'Users & access','area.admin-usuarios.title':'Users & access','area.admin-equipo.label':'Team & assignments','area.admin-equipo.title':'Team & assignments','area.admin-clientes.label':'CRM & clients','area.admin-clientes.title':'CRM & lifecycle','area.admin-agenda.label':'Schedule & capacity','area.admin-agenda.title':'Schedule & capacity','area.admin-operaciones.label':'Operations','area.admin-operaciones.title':'Operations centre','area.admin-comunicacion.label':'Communication','area.admin-comunicacion.title':'Communication & templates','area.admin-automatizaciones.label':'Automations','area.admin-automatizaciones.title':'Automation rules','area.admin-analitica.label':'Analytics','area.admin-analitica.title':'Service analytics','area.admin-auditoria.label':'Audit','area.admin-auditoria.title':'Audit & traceability','area.admin-configuracion.label':'Configuration','area.admin-configuracion.title':'IBERFIT configuration',
  }),
  fr:Object.freeze({
    'common.more':'Plus','common.logout':'Se déconnecter','common.logoutClear':'Se déconnecter et effacer les données de cet appareil','common.search':'Recherche et actions','common.close':'Fermer','common.selectedClient':'Dossier actif','common.selectClient':'Sélectionner un client','common.noClient':'Aucun dossier sélectionné','common.pendingClear':'Aucune modification locale en attente','common.clientRequired':'Sélectionnez un client pour ouvrir cette fonction','common.quickAccess':'Accès rapide','common.allTools':'Tous les outils',
    'settings.title':'Réglages','settings.open':'Réglages','settings.subtitle':'Personnalisez votre expérience IBERFIT','settings.language':'Langue de l’application','settings.languageCopy':'Choisissez la langue des menus, de la navigation et des espaces de travail.','settings.region':'Région et formats','settings.regionCopy':'Adaptez les formats régionaux sans changer de langue.','settings.savedLocal':'Votre préférence est enregistrée sur cet appareil.','settings.fullSettings':'Ouvrir tous les réglages','settings.privacy':'Confidentialité',
    'nav.admin.direction':'Direction','nav.admin.people':'Personnes','nav.admin.operation':'Opérations','nav.admin.control':'Contrôle et système','nav.coach.day':'Ma journée','nav.coach.clients':'Clients et entraînement','nav.coach.resources':'Communication et ressources','nav.coach.control':'Contrôle','nav.client.main':'Mon entraînement','nav.client.followup':'Mon suivi','nav.client.account':'Mon compte',
    'workspace.admin.eyebrow':'Centre de pilotage','workspace.admin.title':'Tout IBERFIT, clair et sous contrôle','workspace.admin.copy':'Commencez par les personnes, l’agenda ou les opérations. Les fonctions avancées sont regroupées pour rester faciles à trouver.','workspace.admin.primary':'Actions principales','workspace.admin.map':'Carte de l’administration','workspace.coach.eyebrow':'Espace Coach','workspace.coach.title':'Votre travail du jour, dans le bon ordre','workspace.coach.copy':'Priorisez les clients, l’agenda et l’entraînement. Le dossier réunit évaluation, planification, progrès et suivi.','workspace.coach.primary':'Raccourcis','workspace.coach.map':'Tout ce que vous pouvez faire','workspace.action.open':'Ouvrir','workspace.action.clients':'Gérer les clients','workspace.action.clients.copy':'Inscription, suivi, statut et prochaine étape de chaque client.','workspace.action.agenda':'Voir l’agenda','workspace.action.agenda.copy':'Séances, disponibilités et capacité de travail.','workspace.action.team':'Gérer l’équipe','workspace.action.team.copy':'Coachs, affectations et responsabilités.','workspace.action.analytics':'Voir les analyses','workspace.action.analytics.copy':'Évolution opérationnelle et indicateurs du service.','workspace.action.today':'Voir les priorités du jour','workspace.action.today.copy':'Commencez par ce qui demande une décision ou un suivi.','workspace.action.library':'Ouvrir la bibliothèque','workspace.action.library.copy':'Exercices et ressources pour préparer les séances.','workspace.action.messages':'Ouvrir les messages','workspace.action.messages.copy':'Conversations et suivi avec les clients.','workspace.action.plan':'Préparer l’entraînement','workspace.action.plan.copy':'Planification et séances du client sélectionné.',
    'area.hoy.label':'Aujourd’hui','area.hoy.title':'Aujourd’hui chez IBERFIT','area.clientes.label':'Clients','area.clientes.title':'Clients','area.expediente.label':'Dossier','area.expediente.title':'Dossier IBERFIT','area.iri.label':'Diagnostic IRI','area.iri.title':'Diagnostic IRI','area.informes.label':'Rapports','area.informes.title':'Rapports','area.planificacion.label':'Planification','area.planificacion.title':'Planification','area.agenda.label':'Agenda','area.agenda.title':'Agenda','area.sesion.label':'Séances','area.sesion.title':'Séances','area.progreso.label':'Progression','area.progreso.title':'Progression','area.actividad.label':'Activité et appareils','area.actividad.title':'Activité, habitudes et appareils','area.notas.label':'Notes privées','area.notas.title':'Notes privées du coach','area.inteligencia.label':'Copilot','area.inteligencia.title':'Intelligence IBERFIT','area.biblioteca.label':'Bibliothèque','area.biblioteca.title':'Bibliothèque visuelle','area.retos.label':'Défis','area.retos.title':'Défis et communauté','area.ajustes.label':'Réglages','area.ajustes.title':'Réglages','area.verificacion.label':'Synchronisation','area.verificacion.title':'État des modifications','area.mensajes.label':'Messages','area.mensajes.title':'Messages IBERFIT',
    'area.admin-inicio.label':'Vue d’ensemble','area.admin-inicio.title':'Centre de contrôle','area.admin-usuarios.label':'Utilisateurs et accès','area.admin-usuarios.title':'Utilisateurs et accès','area.admin-equipo.label':'Équipe et affectations','area.admin-equipo.title':'Équipe et affectations','area.admin-clientes.label':'CRM et clients','area.admin-clientes.title':'CRM et cycle de vie','area.admin-agenda.label':'Agenda et capacité','area.admin-agenda.title':'Agenda et capacité','area.admin-operaciones.label':'Opérations','area.admin-operaciones.title':'Centre opérationnel','area.admin-comunicacion.label':'Communication','area.admin-comunicacion.title':'Communication et modèles','area.admin-automatizaciones.label':'Automatisations','area.admin-automatizaciones.title':'Règles automatiques','area.admin-analitica.label':'Analyses','area.admin-analitica.title':'Analyses du service','area.admin-auditoria.label':'Audit','area.admin-auditoria.title':'Audit et traçabilité','area.admin-configuracion.label':'Configuration','area.admin-configuracion.title':'Configuration IBERFIT',
  }),
  pt:Object.freeze({
    'common.more':'Mais','common.logout':'Terminar sessão','common.logoutClear':'Terminar sessão e apagar os dados deste dispositivo','common.search':'Pesquisa e ações','common.close':'Fechar','common.selectedClient':'Processo ativo','common.selectClient':'Selecionar cliente','common.noClient':'Nenhum processo selecionado','common.pendingClear':'Sem alterações locais pendentes','common.clientRequired':'Selecione um cliente para abrir esta função','common.quickAccess':'Acesso rápido','common.allTools':'Todas as ferramentas',
    'settings.title':'Definições','settings.open':'Definições','settings.subtitle':'Personalize a sua experiência IBERFIT','settings.language':'Idioma da aplicação','settings.languageCopy':'Escolha o idioma dos menus, da navegação e dos espaços de trabalho.','settings.region':'Região e formatos','settings.regionCopy':'Ajuste os formatos regionais sem alterar o idioma.','settings.savedLocal':'A preferência fica guardada neste dispositivo.','settings.fullSettings':'Abrir todas as definições','settings.privacy':'Privacidade',
    'nav.admin.direction':'Direção','nav.admin.people':'Pessoas','nav.admin.operation':'Operação','nav.admin.control':'Controlo e sistema','nav.coach.day':'O meu dia','nav.coach.clients':'Clientes e treino','nav.coach.resources':'Comunicação e recursos','nav.coach.control':'Controlo','nav.client.main':'O meu treino','nav.client.followup':'O meu acompanhamento','nav.client.account':'A minha conta',
    'workspace.admin.eyebrow':'Centro de comando','workspace.admin.title':'Todo o IBERFIT, claro e sob controlo','workspace.admin.copy':'Comece pelas pessoas, agenda ou operação. As áreas avançadas ficam agrupadas para serem fáceis de encontrar.','workspace.admin.primary':'Ações principais','workspace.admin.map':'Mapa da administração','workspace.coach.eyebrow':'Centro Coach','workspace.coach.title':'O trabalho de hoje, pela ordem certa','workspace.coach.copy':'Priorize clientes, agenda e treino. O processo reúne avaliação, planeamento, progresso e acompanhamento.','workspace.coach.primary':'Atalhos de trabalho','workspace.coach.map':'Tudo o que pode fazer','workspace.action.open':'Abrir','workspace.action.clients':'Gerir clientes','workspace.action.clients.copy':'Admissão, acompanhamento, estado e próximo passo de cada cliente.','workspace.action.agenda':'Rever agenda','workspace.action.agenda.copy':'Sessões, disponibilidade e capacidade de trabalho.','workspace.action.team':'Gerir equipa','workspace.action.team.copy':'Coaches, atribuições e responsabilidades.','workspace.action.analytics':'Ver análises','workspace.action.analytics.copy':'Evolução operacional e sinais do serviço.','workspace.action.today':'Ver prioridades de hoje','workspace.action.today.copy':'Comece pelo que exige decisão ou acompanhamento.','workspace.action.library':'Abrir biblioteca','workspace.action.library.copy':'Exercícios e recursos para preparar sessões.','workspace.action.messages':'Abrir mensagens','workspace.action.messages.copy':'Conversas e acompanhamento com clientes.','workspace.action.plan':'Preparar treino','workspace.action.plan.copy':'Planeamento e sessões do cliente selecionado.',
    'area.hoy.label':'Hoje','area.hoy.title':'Hoje no IBERFIT','area.clientes.label':'Clientes','area.clientes.title':'Clientes','area.expediente.label':'Processo','area.expediente.title':'Processo IBERFIT','area.iri.label':'Diagnóstico IRI','area.iri.title':'Diagnóstico IRI','area.informes.label':'Relatórios','area.informes.title':'Relatórios','area.planificacion.label':'Planeamento','area.planificacion.title':'Planeamento','area.agenda.label':'Agenda','area.agenda.title':'Agenda','area.sesion.label':'Sessões','area.sesion.title':'Sessões','area.progreso.label':'Progresso','area.progreso.title':'Progresso','area.actividad.label':'Atividade e dispositivos','area.actividad.title':'Atividade, hábitos e dispositivos','area.notas.label':'Notas privadas','area.notas.title':'Notas privadas do coach','area.inteligencia.label':'Copilot','area.inteligencia.title':'Inteligência IBERFIT','area.biblioteca.label':'Biblioteca','area.biblioteca.title':'Biblioteca visual','area.retos.label':'Desafios','area.retos.title':'Desafios e comunidade','area.ajustes.label':'Definições','area.ajustes.title':'Definições','area.verificacion.label':'Sincronização','area.verificacion.title':'Estado das alterações','area.mensajes.label':'Mensagens','area.mensajes.title':'Mensagens IBERFIT',
    'area.admin-inicio.label':'Resumo','area.admin-inicio.title':'Centro de controlo','area.admin-usuarios.label':'Utilizadores e acessos','area.admin-usuarios.title':'Utilizadores e acessos','area.admin-equipo.label':'Equipa e atribuições','area.admin-equipo.title':'Equipa e atribuições','area.admin-clientes.label':'CRM e clientes','area.admin-clientes.title':'CRM e ciclo de vida','area.admin-agenda.label':'Agenda e capacidade','area.admin-agenda.title':'Agenda e capacidade','area.admin-operaciones.label':'Operações','area.admin-operaciones.title':'Centro operacional','area.admin-comunicacion.label':'Comunicação','area.admin-comunicacion.title':'Comunicação e modelos','area.admin-automatizaciones.label':'Automações','area.admin-automatizaciones.title':'Regras automáticas','area.admin-analitica.label':'Análises','area.admin-analitica.title':'Análises do serviço','area.admin-auditoria.label':'Auditoria','area.admin-auditoria.title':'Auditoria e rastreabilidade','area.admin-configuracion.label':'Configuração','area.admin-configuracion.title':'Configuração do IBERFIT',
  }),
});

const REFERENCE_LANGUAGE='es';
function translationCoverage(value){
  const language=String(value||'').trim().toLowerCase();
  const reference=BUNDLES[REFERENCE_LANGUAGE]||{};
  const selected=BUNDLES[language]||{};
  const referenceKeys=Object.keys(reference).sort();
  const selectedKeys=Object.keys(selected).sort();
  const referenceSet=new Set(referenceKeys);
  const selectedSet=new Set(selectedKeys);
  const missing=referenceKeys.filter((key)=>!selectedSet.has(key));
  const extra=selectedKeys.filter((key)=>!referenceSet.has(key));
  const blank=selectedKeys.filter((key)=>String(selected[key]??'').trim()==='');
  return Object.freeze({
    language,
    reference:REFERENCE_LANGUAGE,
    total:referenceKeys.length,
    translated:referenceKeys.length-missing.length-blank.filter((key)=>referenceSet.has(key)).length,
    missing:Object.freeze(missing),
    extra:Object.freeze(extra),
    blank:Object.freeze(blank),
    complete:missing.length===0&&extra.length===0&&blank.length===0,
  });
}
export function iberfitTranslationCoverage(){
  return Object.freeze(IBERFIT_LANGUAGE_CATALOG.map((item)=>translationCoverage(item.value)));
}

function storage(){
  try{return globalThis?.localStorage||null;}catch{return null;}
}
function languageDefinition(value){
  const key=String(value||'').trim().toLowerCase();
  const metadata=IBERFIT_LANGUAGE_CATALOG.find((item)=>item.value===key)||null;
  if(!metadata)return null;
  const coverage=translationCoverage(key);
  return {...metadata,complete:coverage.complete,coverage};
}
export function iberfitPlannedLanguages(){
  return IBERFIT_LANGUAGE_CATALOG.map((item)=>{
    const definition=languageDefinition(item.value);
    return {...definition,locales:[...definition.locales]};
  });
}
export function iberfitLanguageOptions(){
  return iberfitPlannedLanguages().filter((item)=>item.complete).map((item)=>({value:item.value,label:item.nativeLabel,flag:item.flag,defaultLocale:item.defaultLocale}));
}
export function getIberfitLanguage(){
  const saved=String(storage()?.getItem?.(IBERFIT_LANGUAGE_STORAGE_KEY)||'').trim().toLowerCase();
  const definition=languageDefinition(saved);
  return definition?.complete?saved:'es';
}
export function setIberfitLanguage(value){
  const next=String(value||'').trim().toLowerCase();
  const definition=languageDefinition(next);
  if(!definition)throw new Error('M26_UI_LANGUAGE_UNSUPPORTED');
  if(!definition.complete)throw new Error('M26_UI_LANGUAGE_INCOMPLETE');
  try{storage()?.setItem?.(IBERFIT_LANGUAGE_STORAGE_KEY,next);}catch{}
  const currentLocale=getIberfitLocale(next);
  if(!definition.locales.includes(currentLocale))setIberfitLocale(definition.defaultLocale,{language:next});
  applyIberfitDocumentLanguage(next);
  return next;
}
export function iberfitLocaleOptions(language=getIberfitLanguage()){
  const definition=languageDefinition(language)||languageDefinition('es');
  return definition.locales.map((value)=>({value,label:LOCALE_LABELS[value]||value}));
}
export function getIberfitLocale(language=getIberfitLanguage()){
  const definition=languageDefinition(language)||languageDefinition('es');
  const saved=String(storage()?.getItem?.(IBERFIT_LOCALE_STORAGE_KEY)||'').trim();
  return definition.locales.includes(saved)?saved:definition.defaultLocale;
}
export function setIberfitLocale(value,{language=getIberfitLanguage()}={}){
  const next=String(value||'').trim();
  const definition=languageDefinition(language)||languageDefinition('es');
  if(!definition.locales.includes(next))throw new Error('M26_UI_LOCALE_UNSUPPORTED');
  try{storage()?.setItem?.(IBERFIT_LOCALE_STORAGE_KEY,next);}catch{}
  applyIberfitDocumentLanguage(language);
  return next;
}
export function applyIberfitDocumentLanguage(language=getIberfitLanguage()){
  const definition=languageDefinition(language)||languageDefinition('es');
  const locale=getIberfitLocale(definition.value);
  try{globalThis?.document?.documentElement?.setAttribute?.('lang',locale);}catch{}
  return locale;
}
export function iberfitTranslate(key,{language=getIberfitLanguage(),fallback=null}={}){
  const selected=BUNDLES[language]||BUNDLES.es;
  if(Object.hasOwn(selected,key))return selected[key];
  if(Object.hasOwn(BUNDLES.es,key))return BUNDLES.es[key];
  return fallback??String(key||'');
}
// RC74_4_I18N_WORKSPACE_V2_END
