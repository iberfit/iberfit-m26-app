import {getIberfitLanguage} from '../ui/i18n.js';

export const GUIDED_ONBOARDING_VERSION=1;
export const GUIDED_ONBOARDING_SCHEMA_VERSION='iberfit.guided-onboarding.v1';

const ROLES=new Set(['client','coach','admin']);
const STATUS=new Set(['never','in-progress','completed','skipped']);
const COPY_LANGUAGES=Object.freeze(['es','en','fr','pt']);

const ROLE_TOURS=Object.freeze({
  client:Object.freeze({
    role:'client',
    home:'hoy',
    settingsArea:'ajustes',
    steps:Object.freeze([
      Object.freeze({id:'client-today',area:'hoy',selectors:Object.freeze(['[data-m26-area="hoy"]'])}),
      Object.freeze({id:'client-plan',area:'planificacion',selectors:Object.freeze(['[data-m26-area="planificacion"]'])}),
      Object.freeze({id:'client-session',area:'sesion',selectors:Object.freeze(['[data-m26-area="sesion"]'])}),
      Object.freeze({id:'client-progress',area:'progreso',selectors:Object.freeze(['[data-m26-area="progreso"]'])}),
      Object.freeze({id:'client-activity',area:'actividad',selectors:Object.freeze(['[data-m26-area="actividad"]'])}),
      Object.freeze({id:'client-messages',area:'mensajes',selectors:Object.freeze(['[data-m26-area="mensajes"]'])}),
      Object.freeze({id:'client-settings',area:'ajustes',selectors:Object.freeze(['[data-m26-area="ajustes"]'])}),
    ]),
  }),
  coach:Object.freeze({
    role:'coach',
    home:'hoy',
    settingsArea:'ajustes',
    steps:Object.freeze([
      Object.freeze({id:'coach-today',area:'hoy',selectors:Object.freeze(['[data-m26-area="hoy"]'])}),
      Object.freeze({id:'coach-action-center',area:'hoy',selectors:Object.freeze(['[data-m26-coach-action-center]','[data-m26-area="hoy"]'])}),
      Object.freeze({id:'coach-clients',area:'clientes',selectors:Object.freeze(['[data-m26-area="clientes"]'])}),
      Object.freeze({id:'coach-planning',area:'planificacion',selectors:Object.freeze(['[data-m26-area="planificacion"]'])}),
      Object.freeze({id:'coach-progress',area:'progreso',selectors:Object.freeze(['[data-m26-area="progreso"]'])}),
      Object.freeze({id:'coach-agenda',area:'agenda',selectors:Object.freeze(['[data-m26-area="agenda"]'])}),
      Object.freeze({id:'coach-settings',area:'ajustes',selectors:Object.freeze(['[data-m26-area="ajustes"]'])}),
    ]),
  }),
  admin:Object.freeze({
    role:'admin',
    home:'admin-inicio',
    settingsArea:'admin-configuracion',
    steps:Object.freeze([
      Object.freeze({id:'admin-home',area:'admin-inicio',selectors:Object.freeze(['[data-m26-area="admin-inicio"]'])}),
      Object.freeze({id:'admin-users',area:'admin-usuarios',selectors:Object.freeze(['[data-m26-area="admin-usuarios"]'])}),
      Object.freeze({id:'admin-team',area:'admin-equipo',selectors:Object.freeze(['[data-m26-area="admin-equipo"]'])}),
      Object.freeze({id:'admin-clients',area:'admin-clientes',selectors:Object.freeze(['[data-m26-area="admin-clientes"]'])}),
      Object.freeze({id:'admin-operations',area:'admin-operaciones',selectors:Object.freeze(['[data-m26-area="admin-operaciones"]'])}),
      Object.freeze({id:'admin-audit',area:'admin-auditoria',selectors:Object.freeze(['[data-m26-area="admin-auditoria"]'])}),
      Object.freeze({id:'admin-settings',area:'admin-configuracion',selectors:Object.freeze(['[data-m26-area="admin-configuracion"]'])}),
    ]),
  }),
});

const COPY=Object.freeze({
  es:Object.freeze({
    'chrome.eyebrow':'Guía IBERFIT',
    'chrome.progress':'Paso {current} de {total}',
    'chrome.previous':'Anterior',
    'chrome.next':'Siguiente',
    'chrome.finish':'Terminar',
    'chrome.skip':'Saltar guía',
    'chrome.close':'Cerrar y continuar después',
    'chrome.reopen':'Ver guía de la app',
    'chrome.reopenTitle':'Guía de la app',
    'chrome.reopenBody':'Repite el recorrido cuando quieras. No cambia datos, permisos ni planificación.',
    'chrome.completed':'Recorrido completado',
    'chrome.targetMissing':'Esta parte no está disponible en este contexto; continuamos con el siguiente paso.',
    'role.client.title':'Tu IBERFIT, en pocos pasos',
    'role.coach.title':'Tu centro Coach, sin perder tiempo',
    'role.admin.title':'Control IBERFIT, de principio a fin',
    'step.client-today.title':'Empieza por Hoy',
    'step.client-today.body':'Aquí ves lo importante del día y el siguiente paso de tu acompañamiento.',
    'step.client-plan.title':'Tu planificación',
    'step.client-plan.body':'Consulta el entrenamiento que tu Coach ha preparado y publicado para ti.',
    'step.client-session.title':'Entrena desde Sesiones',
    'step.client-session.body':'Abre tu sesión guiada, sigue ejercicios, series, repeticiones, carga y descansos, y registra el feedback al terminar.',
    'step.client-progress.title':'Comprueba tu progreso',
    'step.client-progress.body':'Revisa evolución, adherencia y resultados sin convertir datos ausentes en cero.',
    'step.client-activity.title':'Actividad y mediciones',
    'step.client-activity.body':'Consulta hábitos y datos de dispositivos o mediciones cuando estén disponibles y autorizados.',
    'step.client-messages.title':'Tu Coach está a un toque',
    'step.client-messages.body':'Usa Mensajes para el seguimiento y para mantener el contexto entre sesiones.',
    'step.client-settings.title':'Ajustes y ayuda',
    'step.client-settings.body':'Cambia idioma y preferencias, y vuelve a abrir esta guía cuando lo necesites.',
    'step.coach-today.title':'Empieza por Coach Today',
    'step.coach-today.body':'Tu día se ordena por prioridades, sesiones y señales que requieren criterio.',
    'step.coach-action-center.title':'Action Center',
    'step.coach-action-center.body':'Aquí ves qué necesita atención, por qué y cuál es la siguiente acción. La prioridad sigue viniendo del cockpit real.',
    'step.coach-clients.title':'Clientes y expediente',
    'step.coach-clients.body':'Abre la cartera y entra al expediente para evaluación, IRI, contexto y seguimiento del cliente.',
    'step.coach-planning.title':'Planificación y sesiones',
    'step.coach-planning.body':'Organiza ciclos y planificación, prepara sesiones y publica solo cuando corresponda.',
    'step.coach-progress.title':'Feedback, carga y progreso',
    'step.coach-progress.body':'Revisa adherencia, feedback, cambios de carga y evolución antes de decidir el siguiente paso.',
    'step.coach-agenda.title':'Agenda y check-ins',
    'step.coach-agenda.body':'Consulta citas y próximos contactos para mantener el seguimiento en fecha.',
    'step.coach-settings.title':'Ajustes',
    'step.coach-settings.body':'Gestiona idioma y preferencias y repite este recorrido cuando cambie tu forma de trabajo.',
    'step.admin-home.title':'Centro de control',
    'step.admin-home.body':'Empieza por la visión global del servicio y sus señales operativas.',
    'step.admin-users.title':'Usuarios y accesos',
    'step.admin-users.body':'Revisa identidades y accesos dentro del alcance administrativo autorizado.',
    'step.admin-team.title':'Equipo y asignaciones',
    'step.admin-team.body':'Consulta Coaches, responsabilidades y asignaciones antes de cambiar alcance.',
    'step.admin-clients.title':'CRM y clientes',
    'step.admin-clients.body':'Sigue el ciclo de vida de clientes desde la superficie administrativa real.',
    'step.admin-operations.title':'Operaciones',
    'step.admin-operations.body':'Distingue estados confirmados, pendientes, conflictos y rechazos antes de actuar.',
    'step.admin-audit.title':'Auditoría y trazabilidad',
    'step.admin-audit.body':'Comprueba qué ocurrió, cuándo y bajo qué autorización.',
    'step.admin-settings.title':'Configuración',
    'step.admin-settings.body':'Vuelve a esta guía y revisa la configuración global sin duplicar superficies.',
  }),
  en:Object.freeze({
    'chrome.eyebrow':'IBERFIT guide',
    'chrome.progress':'Step {current} of {total}',
    'chrome.previous':'Back',
    'chrome.next':'Next',
    'chrome.finish':'Finish',
    'chrome.skip':'Skip guide',
    'chrome.close':'Close and continue later',
    'chrome.reopen':'View app guide',
    'chrome.reopenTitle':'App guide',
    'chrome.reopenBody':'Repeat the tour whenever you need it. It does not change data, permissions or planning.',
    'chrome.completed':'Tour completed',
    'chrome.targetMissing':'This part is not available in the current context; continuing to the next step.',
    'role.client.title':'Your IBERFIT, in a few steps',
    'role.coach.title':'Your Coach centre, without wasting time',
    'role.admin.title':'IBERFIT control, end to end',
    'step.client-today.title':'Start with Today',
    'step.client-today.body':'See what matters today and the next step in your coaching journey.',
    'step.client-plan.title':'Your planning',
    'step.client-plan.body':'Review the training your Coach has prepared and published for you.',
    'step.client-session.title':'Train from Sessions',
    'step.client-session.body':'Open your guided session, follow exercises, sets, reps, load and rest, then leave feedback when you finish.',
    'step.client-progress.title':'Check your progress',
    'step.client-progress.body':'Review trends, adherence and results without treating missing data as zero.',
    'step.client-activity.title':'Activity and measurements',
    'step.client-activity.body':'Review habits and device or measurement data when it is available and authorised.',
    'step.client-messages.title':'Your Coach is one tap away',
    'step.client-messages.body':'Use Messages for follow-up and to keep context between sessions.',
    'step.client-settings.title':'Settings and help',
    'step.client-settings.body':'Change language and preferences, and reopen this guide whenever you need it.',
    'step.coach-today.title':'Start with Coach Today',
    'step.coach-today.body':'Your day is ordered around priorities, sessions and signals that need judgement.',
    'step.coach-action-center.title':'Action Center',
    'step.coach-action-center.body':'See what needs attention, why, and the next action. Priority still comes from the real cockpit.',
    'step.coach-clients.title':'Clients and records',
    'step.coach-clients.body':'Open your client list and record for assessment, IRI, context and follow-up.',
    'step.coach-planning.title':'Planning and sessions',
    'step.coach-planning.body':'Organise cycles and planning, prepare sessions and publish only when appropriate.',
    'step.coach-progress.title':'Feedback, load and progress',
    'step.coach-progress.body':'Review adherence, feedback, load changes and progress before deciding what comes next.',
    'step.coach-agenda.title':'Schedule and check-ins',
    'step.coach-agenda.body':'Review appointments and upcoming contacts so follow-up stays on time.',
    'step.coach-settings.title':'Settings',
    'step.coach-settings.body':'Manage language and preferences and repeat this tour when your workflow changes.',
    'step.admin-home.title':'Control centre',
    'step.admin-home.body':'Start with the service overview and its operational signals.',
    'step.admin-users.title':'Users and access',
    'step.admin-users.body':'Review identities and access within the authorised administrative scope.',
    'step.admin-team.title':'Team and assignments',
    'step.admin-team.body':'Review Coaches, responsibilities and assignments before changing scope.',
    'step.admin-clients.title':'CRM and clients',
    'step.admin-clients.body':'Follow the client lifecycle from the real administrative surface.',
    'step.admin-operations.title':'Operations',
    'step.admin-operations.body':'Separate confirmed, pending, conflict and rejected states before acting.',
    'step.admin-audit.title':'Audit and traceability',
    'step.admin-audit.body':'Check what happened, when, and under which authorisation.',
    'step.admin-settings.title':'Configuration',
    'step.admin-settings.body':'Return to this guide and review global configuration without duplicating surfaces.',
  }),
  fr:Object.freeze({
    'chrome.eyebrow':'Guide IBERFIT',
    'chrome.progress':'Étape {current} sur {total}',
    'chrome.previous':'Précédent',
    'chrome.next':'Suivant',
    'chrome.finish':'Terminer',
    'chrome.skip':'Passer le guide',
    'chrome.close':'Fermer et continuer plus tard',
    'chrome.reopen':'Voir le guide de l’application',
    'chrome.reopenTitle':'Guide de l’application',
    'chrome.reopenBody':'Refaites le parcours quand vous le souhaitez. Il ne modifie ni les données, ni les autorisations, ni la planification.',
    'chrome.completed':'Parcours terminé',
    'chrome.targetMissing':'Cette partie n’est pas disponible dans ce contexte ; nous passons à l’étape suivante.',
    'role.client.title':'Votre IBERFIT, en quelques étapes',
    'role.coach.title':'Votre espace Coach, sans perdre de temps',
    'role.admin.title':'Le contrôle IBERFIT, de bout en bout',
    'step.client-today.title':'Commencez par Aujourd’hui',
    'step.client-today.body':'Retrouvez l’essentiel du jour et la prochaine étape de votre accompagnement.',
    'step.client-plan.title':'Votre planification',
    'step.client-plan.body':'Consultez l’entraînement préparé et publié par votre Coach.',
    'step.client-session.title':'Entraînez-vous depuis Séances',
    'step.client-session.body':'Ouvrez la séance guidée, suivez exercices, séries, répétitions, charge et repos, puis laissez votre feedback.',
    'step.client-progress.title':'Suivez vos progrès',
    'step.client-progress.body':'Consultez évolution, adhésion et résultats sans transformer les données absentes en zéro.',
    'step.client-activity.title':'Activité et mesures',
    'step.client-activity.body':'Consultez habitudes et données des appareils ou mesures lorsqu’elles sont disponibles et autorisées.',
    'step.client-messages.title':'Votre Coach à portée de main',
    'step.client-messages.body':'Utilisez Messages pour le suivi et pour garder le contexte entre les séances.',
    'step.client-settings.title':'Réglages et aide',
    'step.client-settings.body':'Changez la langue et les préférences, puis rouvrez ce guide quand vous le souhaitez.',
    'step.coach-today.title':'Commencez par Coach Today',
    'step.coach-today.body':'Votre journée est ordonnée par priorités, séances et signaux nécessitant votre jugement.',
    'step.coach-action-center.title':'Action Center',
    'step.coach-action-center.body':'Voyez ce qui demande une attention, pourquoi et quelle action suivre. La priorité vient toujours du cockpit réel.',
    'step.coach-clients.title':'Clients et dossiers',
    'step.coach-clients.body':'Ouvrez la liste puis le dossier pour l’évaluation, l’IRI, le contexte et le suivi.',
    'step.coach-planning.title':'Planification et séances',
    'step.coach-planning.body':'Organisez cycles et planification, préparez les séances et publiez uniquement lorsque c’est pertinent.',
    'step.coach-progress.title':'Feedback, charge et progrès',
    'step.coach-progress.body':'Vérifiez adhésion, feedback, changements de charge et évolution avant la prochaine décision.',
    'step.coach-agenda.title':'Agenda et check-ins',
    'step.coach-agenda.body':'Consultez rendez-vous et prochains contacts pour garder le suivi à jour.',
    'step.coach-settings.title':'Réglages',
    'step.coach-settings.body':'Gérez langue et préférences et refaites ce parcours lorsque votre manière de travailler évolue.',
    'step.admin-home.title':'Centre de contrôle',
    'step.admin-home.body':'Commencez par la vue globale du service et ses signaux opérationnels.',
    'step.admin-users.title':'Utilisateurs et accès',
    'step.admin-users.body':'Vérifiez identités et accès dans le périmètre administratif autorisé.',
    'step.admin-team.title':'Équipe et affectations',
    'step.admin-team.body':'Consultez Coaches, responsabilités et affectations avant de modifier le périmètre.',
    'step.admin-clients.title':'CRM et clients',
    'step.admin-clients.body':'Suivez le cycle de vie client depuis la surface administrative réelle.',
    'step.admin-operations.title':'Opérations',
    'step.admin-operations.body':'Distinguez états confirmés, en attente, en conflit et rejetés avant d’agir.',
    'step.admin-audit.title':'Audit et traçabilité',
    'step.admin-audit.body':'Vérifiez ce qui s’est passé, quand et avec quelle autorisation.',
    'step.admin-settings.title':'Configuration',
    'step.admin-settings.body':'Revenez à ce guide et consultez la configuration globale sans dupliquer les surfaces.',
  }),
  pt:Object.freeze({
    'chrome.eyebrow':'Guia IBERFIT',
    'chrome.progress':'Passo {current} de {total}',
    'chrome.previous':'Anterior',
    'chrome.next':'Seguinte',
    'chrome.finish':'Terminar',
    'chrome.skip':'Saltar guia',
    'chrome.close':'Fechar e continuar depois',
    'chrome.reopen':'Ver guia da aplicação',
    'chrome.reopenTitle':'Guia da aplicação',
    'chrome.reopenBody':'Repita o percurso quando quiser. Não altera dados, permissões nem planeamento.',
    'chrome.completed':'Percurso concluído',
    'chrome.targetMissing':'Esta parte não está disponível neste contexto; continuamos para o passo seguinte.',
    'role.client.title':'O seu IBERFIT, em poucos passos',
    'role.coach.title':'O seu centro Coach, sem perder tempo',
    'role.admin.title':'Controlo IBERFIT, de ponta a ponta',
    'step.client-today.title':'Comece pelo Hoje',
    'step.client-today.body':'Veja o que importa hoje e o próximo passo do seu acompanhamento.',
    'step.client-plan.title':'O seu planeamento',
    'step.client-plan.body':'Consulte o treino que o seu Coach preparou e publicou para si.',
    'step.client-session.title':'Treine em Sessões',
    'step.client-session.body':'Abra a sessão guiada, siga exercícios, séries, repetições, carga e descanso e deixe feedback no final.',
    'step.client-progress.title':'Veja o seu progresso',
    'step.client-progress.body':'Consulte evolução, adesão e resultados sem transformar dados ausentes em zero.',
    'step.client-activity.title':'Atividade e medições',
    'step.client-activity.body':'Consulte hábitos e dados de dispositivos ou medições quando estejam disponíveis e autorizados.',
    'step.client-messages.title':'O seu Coach está a um toque',
    'step.client-messages.body':'Use Mensagens para acompanhamento e para manter contexto entre sessões.',
    'step.client-settings.title':'Definições e ajuda',
    'step.client-settings.body':'Altere idioma e preferências e volte a abrir este guia quando precisar.',
    'step.coach-today.title':'Comece pelo Coach Today',
    'step.coach-today.body':'O seu dia é ordenado por prioridades, sessões e sinais que exigem critério.',
    'step.coach-action-center.title':'Action Center',
    'step.coach-action-center.body':'Veja o que precisa de atenção, porquê e qual é a próxima ação. A prioridade continua a vir do cockpit real.',
    'step.coach-clients.title':'Clientes e processo',
    'step.coach-clients.body':'Abra a carteira e o processo para avaliação, IRI, contexto e acompanhamento.',
    'step.coach-planning.title':'Planeamento e sessões',
    'step.coach-planning.body':'Organize ciclos e planeamento, prepare sessões e publique apenas quando fizer sentido.',
    'step.coach-progress.title':'Feedback, carga e progresso',
    'step.coach-progress.body':'Reveja adesão, feedback, alterações de carga e evolução antes de decidir o passo seguinte.',
    'step.coach-agenda.title':'Agenda e check-ins',
    'step.coach-agenda.body':'Consulte marcações e próximos contactos para manter o acompanhamento em dia.',
    'step.coach-settings.title':'Definições',
    'step.coach-settings.body':'Gira idioma e preferências e repita este percurso quando a sua forma de trabalho mudar.',
    'step.admin-home.title':'Centro de controlo',
    'step.admin-home.body':'Comece pela visão global do serviço e pelos seus sinais operacionais.',
    'step.admin-users.title':'Utilizadores e acessos',
    'step.admin-users.body':'Reveja identidades e acessos dentro do âmbito administrativo autorizado.',
    'step.admin-team.title':'Equipa e atribuições',
    'step.admin-team.body':'Consulte Coaches, responsabilidades e atribuições antes de alterar o âmbito.',
    'step.admin-clients.title':'CRM e clientes',
    'step.admin-clients.body':'Acompanhe o ciclo de vida dos clientes na superfície administrativa real.',
    'step.admin-operations.title':'Operações',
    'step.admin-operations.body':'Separe estados confirmados, pendentes, conflitos e rejeições antes de agir.',
    'step.admin-audit.title':'Auditoria e rastreabilidade',
    'step.admin-audit.body':'Verifique o que aconteceu, quando e sob que autorização.',
    'step.admin-settings.title':'Configuração',
    'step.admin-settings.body':'Volte a este guia e reveja a configuração global sem duplicar superfícies.',
  }),
});

const STYLE_TEXT=`
.m26-guided-tour-target{outline:3px solid var(--iberfit-color-accent);outline-offset:4px;border-radius:var(--iberfit-radius-md);scroll-margin:7rem 1rem}
.m26-guided-tour{position:fixed;z-index:1600;right:max(1rem,env(safe-area-inset-right));bottom:max(1rem,env(safe-area-inset-bottom));display:grid;gap:var(--iberfit-space-4);width:min(27rem,calc(100vw - 2rem));max-height:min(78vh,42rem);overflow:auto;padding:var(--iberfit-space-5);border:1px solid var(--iberfit-color-border-strong);border-radius:var(--iberfit-radius-xl);color:var(--iberfit-color-text-primary);background:var(--iberfit-color-surface-overlay);box-shadow:var(--iberfit-shadow-floating)}
.m26-guided-tour-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--iberfit-space-3)}
.m26-guided-tour-head h2{margin:.2rem 0 0;font-size:var(--iberfit-font-size-xl)}
.m26-guided-tour-copy{display:grid;gap:var(--iberfit-space-2)}
.m26-guided-tour-copy h3,.m26-guided-tour-copy p{margin:0}.m26-guided-tour-copy p{color:var(--iberfit-color-text-secondary);line-height:var(--iberfit-line-height-normal)}
.m26-guided-tour-meter{display:grid;gap:var(--iberfit-space-2)}.m26-guided-tour-meter span{color:var(--iberfit-color-text-secondary);font-size:var(--iberfit-font-size-sm);font-weight:var(--iberfit-font-weight-semibold)}.m26-guided-tour-meter progress{width:100%;min-height:.7rem;accent-color:var(--iberfit-color-accent)}
.m26-guided-tour-actions{display:flex;align-items:center;flex-wrap:wrap;gap:var(--iberfit-space-2)}.m26-guided-tour-actions .m26-primary-action{margin-left:auto}
.m26-guided-tour-close{min-width:var(--iberfit-size-touch-target);min-height:var(--iberfit-size-touch-target)}
.m26-guided-tour-settings{display:grid;gap:var(--iberfit-space-3);margin-top:var(--iberfit-space-4)}.m26-guided-tour-settings h2,.m26-guided-tour-settings p{margin:0}.m26-guided-tour-settings p{color:var(--iberfit-color-text-secondary)}
.m26-guided-tour button:focus-visible,.m26-guided-tour-settings button:focus-visible{outline:3px solid color-mix(in srgb,var(--iberfit-color-focus) 72%,transparent);outline-offset:3px}
@media(max-width:719px){.m26-guided-tour{right:.75rem;bottom:max(.75rem,env(safe-area-inset-bottom));left:.75rem;width:auto;max-height:64vh;padding:var(--iberfit-space-4)}.m26-guided-tour-actions{align-items:stretch}.m26-guided-tour-actions .m26-primary-action{margin-left:0}.m26-guided-tour-actions>button{flex:1 1 auto}}
@media(prefers-reduced-motion:reduce){.m26-guided-tour,.m26-guided-tour-target{scroll-behavior:auto!important;transition:none!important}}
@media(forced-colors:active){.m26-guided-tour-target{outline:3px solid Highlight}.m26-guided-tour{border-color:CanvasText}}
@media print{.m26-guided-tour,.m26-guided-tour-settings{display:none!important}}
`;

function text(value,max=240){
  return String(value??'').replace(/\s+/gu,' ').trim().slice(0,max);
}

function hashIdentity(value){
  let hash=0x811c9dc5;
  for(const char of String(value||'')){
    hash^=char.charCodeAt(0);
    hash=Math.imul(hash,0x01000193);
  }
  return (hash>>>0).toString(16).padStart(8,'0');
}

function interpolate(value,params={}){
  return String(value??'').replace(/\{([a-zA-Z0-9_.-]+)\}/g,(_,key)=>String(params?.[key]??`{${key}}`));
}

function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function safeLanguage(value=getIberfitLanguage()){
  const normalized=text(value,10).toLowerCase();
  return COPY_LANGUAGES.includes(normalized)?normalized:'es';
}

export function guidedOnboardingCopy(key,{language=getIberfitLanguage(),params={}}={}){
  const selected=COPY[safeLanguage(language)]||COPY.es;
  const raw=Object.hasOwn(selected,key)?selected[key]:Object.hasOwn(COPY.es,key)?COPY.es[key]:String(key||'');
  return interpolate(raw,params);
}

export function guidedOnboardingTranslationCoverage(){
  const reference=Object.keys(COPY.es).sort();
  return Object.freeze(COPY_LANGUAGES.map((language)=>{
    const bundle=COPY[language];
    const keys=Object.keys(bundle).sort();
    const missing=reference.filter((key)=>!Object.hasOwn(bundle,key));
    const extra=keys.filter((key)=>!Object.hasOwn(COPY.es,key));
    const blank=keys.filter((key)=>String(bundle[key]??'').trim()==='');
    return Object.freeze({language,total:reference.length,missing:Object.freeze(missing),extra:Object.freeze(extra),blank:Object.freeze(blank),complete:missing.length===0&&extra.length===0&&blank.length===0});
  }));
}

export function guidedOnboardingTrack(role){
  return ROLE_TOURS[text(role,40).toLowerCase()]||null;
}

export function guidedOnboardingSettingsArea(role){
  return guidedOnboardingTrack(role)?.settingsArea||null;
}

export function guidedOnboardingScopeKey({userId,role}={}){
  const tour=guidedOnboardingTrack(role);
  const subject=text(userId,240);
  if(!tour||!subject)return null;
  return `iberfit.m26.guided-onboarding.v1:${tour.role}:${hashIdentity(`${subject}|${tour.role}`)}`;
}

export function normalizeGuidedOnboardingState(value={},role){
  const tour=guidedOnboardingTrack(role);
  if(!tour)return null;
  const validIds=new Set(tour.steps.map((step)=>step.id));
  const completedVersion=Math.max(0,Math.min(GUIDED_ONBOARDING_VERSION,Number(value?.onboardingCompletedVersion)||0));
  const skippedVersion=Math.max(0,Math.min(GUIDED_ONBOARDING_VERSION,Number(value?.onboardingSkippedVersion)||0));
  let status=STATUS.has(value?.status)?value.status:'never';
  const activeStepId=validIds.has(text(value?.activeStepId,80))?text(value.activeStepId,80):null;
  if(completedVersion>=GUIDED_ONBOARDING_VERSION)status='completed';
  else if(skippedVersion>=GUIDED_ONBOARDING_VERSION)status='skipped';
  else if(status==='completed'||status==='skipped')status='never';
  return Object.freeze({
    schemaVersion:GUIDED_ONBOARDING_SCHEMA_VERSION,
    role:tour.role,
    onboardingVersion:GUIDED_ONBOARDING_VERSION,
    onboardingCompletedVersion:completedVersion,
    onboardingSkippedVersion:skippedVersion,
    status,
    activeStepId,
  });
}

export function createGuidedOnboardingRepository({storage=globalThis.localStorage}={}){
  const memory=new Map();
  function readRaw(key){
    if(!key)return null;
    try{
      const raw=storage?.getItem?.(key);
      if(raw)return JSON.parse(raw);
    }catch{}
    return memory.get(key)||null;
  }
  function writeRaw(key,state){
    if(!key||!state)return false;
    const safe={
      schemaVersion:GUIDED_ONBOARDING_SCHEMA_VERSION,
      role:state.role,
      onboardingVersion:GUIDED_ONBOARDING_VERSION,
      onboardingCompletedVersion:Number(state.onboardingCompletedVersion)||0,
      onboardingSkippedVersion:Number(state.onboardingSkippedVersion)||0,
      status:state.status,
      activeStepId:state.activeStepId||null,
    };
    memory.set(key,Object.freeze({...safe}));
    try{storage?.setItem?.(key,JSON.stringify(safe));}catch{}
    return true;
  }
  return Object.freeze({
    read(key,role){return normalizeGuidedOnboardingState(readRaw(key)||{},role);},
    write(key,value){
      const normalized=normalizeGuidedOnboardingState(value,value?.role);
      return normalized?writeRaw(key,normalized):false;
    },
    reset(key,role){
      const normalized=normalizeGuidedOnboardingState({},role);
      return normalized?writeRaw(key,normalized):false;
    },
  });
}

function findTarget(root,step){
  for(const selector of step?.selectors||[]){
    const target=root?.querySelector?.(selector);
    if(target)return target;
  }
  return null;
}

export function resolveGuidedOnboardingSteps({role,root}={}){
  const tour=guidedOnboardingTrack(role);
  if(!tour||!root?.querySelector)return Object.freeze([]);
  return Object.freeze(tour.steps.flatMap((step)=>{
    const target=findTarget(root,step);
    return target?[Object.freeze({step,target})]:[];
  }));
}

export function shouldAutoOpenGuidedOnboarding(state){
  if(!state)return false;
  return state.onboardingCompletedVersion<GUIDED_ONBOARDING_VERSION&&
    state.onboardingSkippedVersion<GUIDED_ONBOARDING_VERSION;
}

function prefersReducedMotion(scope=globalThis){
  try{return Boolean(scope?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);}catch{return false;}
}

function ensureStyle(documentLike){
  if(!documentLike?.createElement)return null;
  let style=documentLike.querySelector?.('[data-m26-guided-tour-style]');
  if(style)return style;
  style=documentLike.createElement('style');
  style.setAttribute('data-m26-guided-tour-style','');
  style.textContent=STYLE_TEXT;
  documentLike.head?.append?.(style);
  return style;
}

function removeTarget(target){
  target?.classList?.remove?.('m26-guided-tour-target');
  target?.removeAttribute?.('data-m26-guided-tour-target-active');
}

function scrollTarget(target,scope){
  try{
    target?.scrollIntoView?.({
      block:'center',
      inline:'nearest',
      behavior:prefersReducedMotion(scope)?'auto':'smooth',
    });
  }catch{}
}

function roleTitle(role,language){
  return guidedOnboardingCopy(`role.${role}.title`,{language});
}

function stepCopy(step,language){
  return Object.freeze({
    title:guidedOnboardingCopy(`step.${step.id}.title`,{language}),
    body:guidedOnboardingCopy(`step.${step.id}.body`,{language}),
  });
}

export function renderGuidedOnboardingDialog({role,step,index,total,language=getIberfitLanguage()}={}){
  const copy=stepCopy(step,language);
  const last=index===total-1;
  return `<section class="m26-guided-tour" data-m26-guided-tour role="dialog" aria-modal="false" aria-labelledby="m26-guided-tour-title" aria-describedby="m26-guided-tour-copy" tabindex="-1"><div class="m26-guided-tour-head"><div><p class="m26-eyebrow">${escapeHtml(guidedOnboardingCopy('chrome.eyebrow',{language}))}</p><h2 id="m26-guided-tour-title">${escapeHtml(roleTitle(role,language))}</h2></div><button type="button" class="m26-icon-button m26-guided-tour-close" data-m26-guided-tour-close aria-label="${escapeHtml(guidedOnboardingCopy('chrome.close',{language}))}">×</button></div><div class="m26-guided-tour-meter" role="status" aria-live="polite"><span>${escapeHtml(guidedOnboardingCopy('chrome.progress',{language,params:{current:index+1,total}}))}</span><progress max="${total}" value="${index+1}">${index+1}/${total}</progress></div><div class="m26-guided-tour-copy" id="m26-guided-tour-copy"><h3>${escapeHtml(copy.title)}</h3><p>${escapeHtml(copy.body)}</p></div><div class="m26-guided-tour-actions"><button type="button" class="m26-text-action" data-m26-guided-tour-skip>${escapeHtml(guidedOnboardingCopy('chrome.skip',{language}))}</button>${index>0?`<button type="button" class="m26-text-action" data-m26-guided-tour-previous>${escapeHtml(guidedOnboardingCopy('chrome.previous',{language}))}</button>`:''}<button type="button" class="m26-primary-action" data-m26-guided-tour-next>${escapeHtml(guidedOnboardingCopy(last?'chrome.finish':'chrome.next',{language}))}</button></div></section>`;
}

export function renderGuidedOnboardingSettings({language=getIberfitLanguage()}={}){
  return `<section class="iberfit-card m26-guided-tour-settings" data-m26-guided-tour-settings aria-labelledby="m26-guided-tour-settings-title"><p class="m26-eyebrow">${escapeHtml(guidedOnboardingCopy('chrome.eyebrow',{language}))}</p><h2 id="m26-guided-tour-settings-title">${escapeHtml(guidedOnboardingCopy('chrome.reopenTitle',{language}))}</h2><p>${escapeHtml(guidedOnboardingCopy('chrome.reopenBody',{language}))}</p><div class="m26-inline-actions"><button type="button" class="m26-text-action" data-m26-guided-tour-open>${escapeHtml(guidedOnboardingCopy('chrome.reopen',{language}))}</button></div></section>`;
}

export function createGuidedTourController({
  root,
  identityProvider=()=>({}),
  storage=globalThis.localStorage,
  scope=globalThis,
}={}){
  if(!root?.addEventListener)throw new Error('M26_GUIDED_ONBOARDING_ROOT_REQUIRED');
  const repository=createGuidedOnboardingRepository({storage});
  const documentLike=root.ownerDocument||scope?.document||globalThis.document;
  let observer=null;
  let mounted=false;
  let scheduled=false;
  let open=false;
  let suppressed=false;
  let previousFocus=null;
  let activeTarget=null;
  let activeStepId=null;
  let dialog=null;
  let lastContextKey=null;

  function context(){
    const value=identityProvider?.()||{};
    const role=text(value.role,40).toLowerCase();
    const userId=text(value.userId,240);
    const tour=guidedOnboardingTrack(role);
    const key=guidedOnboardingScopeKey({userId,role});
    return tour&&key?Object.freeze({role,userId,tour,key}):null;
  }

  function activeArea(){
    return text(root.querySelector?.('[data-m26-area][aria-current="page"]')?.getAttribute?.('data-m26-area'),80);
  }

  function removeDialog({restoreFocus=true}={}){
    removeTarget(activeTarget);
    activeTarget=null;
    dialog?.removeEventListener?.('click',onDialogClick);
    dialog?.remove?.();
    dialog=null;
    open=false;
    if(restoreFocus){
      try{
        if(previousFocus?.isConnected!==false)previousFocus?.focus?.({preventScroll:true});
      }catch{}
    }
    previousFocus=null;
  }

  function ensureSettings(contextValue,area){
    const existing=root.querySelector?.('[data-m26-guided-tour-settings]');
    if(!contextValue||area!==contextValue.tour.settingsArea){
      existing?.remove?.();
      return;
    }
    const main=root.querySelector?.('#m26-main');
    if(!main)return;
    const language=safeLanguage();
    const markup=renderGuidedOnboardingSettings({language});
    if(existing){
      if(existing.getAttribute?.('data-m26-guided-tour-language')===language)return;
      existing.outerHTML=markup;
    }else{
      main.insertAdjacentHTML?.('beforeend',markup);
    }
    root.querySelector?.('[data-m26-guided-tour-settings]')?.setAttribute?.('data-m26-guided-tour-language',language);
  }

  function markLegacyLauncher(){
    const launcher=root.querySelector?.('[data-progressive-onboarding-launcher]');
    if(!launcher)return;
    launcher.setAttribute?.('data-m26-guided-tour-open','');
    launcher.setAttribute?.('aria-label',guidedOnboardingCopy('chrome.reopen'));
  }

  function availableSteps(contextValue){
    return resolveGuidedOnboardingSteps({role:contextValue.role,root});
  }

  function writeProgress(contextValue,patch={}){
    const current=repository.read(contextValue.key,contextValue.role);
    const next=normalizeGuidedOnboardingState({...current,...patch,role:contextValue.role},contextValue.role);
    repository.write(contextValue.key,next);
    return next;
  }

  function focusDialog(){
    const focusable=dialog?.querySelector?.('[data-m26-guided-tour-next]')||dialog;
    queueMicrotask(()=>{try{focusable?.focus?.({preventScroll:true});}catch{}});
  }

  function renderStep(contextValue,requestedStepId=activeStepId){
    if(!open)return false;
    const available=availableSteps(contextValue);
    if(!available.length){
      removeDialog();
      return false;
    }
    let index=available.findIndex(({step})=>step.id===requestedStepId);
    if(index<0)index=0;
    const item=available[index];
    activeStepId=item.step.id;
    removeTarget(activeTarget);
    activeTarget=item.target;
    activeTarget?.classList?.add?.('m26-guided-tour-target');
    activeTarget?.setAttribute?.('data-m26-guided-tour-target-active','true');
    scrollTarget(activeTarget,scope);
    writeProgress(contextValue,{status:'in-progress',activeStepId});
    const markup=renderGuidedOnboardingDialog({
      role:contextValue.role,
      step:item.step,
      index,
      total:available.length,
      language:safeLanguage(),
    });
    if(dialog){
      dialog.removeEventListener?.('click',onDialogClick);
      dialog.outerHTML=markup;
    }else{
      documentLike?.body?.insertAdjacentHTML?.('beforeend',markup);
    }
    dialog=documentLike?.querySelector?.('[data-m26-guided-tour]')||null;
    dialog?.addEventListener?.('click',onDialogClick);
    focusDialog();
    return true;
  }

  function openTour({restart=false}={}){
    const contextValue=context();
    if(!contextValue||!documentLike?.body)return false;
    ensureStyle(documentLike);
    if(!open){
      previousFocus=documentLike.activeElement||null;
      open=true;
    }
    suppressed=false;
    const current=repository.read(contextValue.key,contextValue.role);
    if(restart){
      activeStepId=availableSteps(contextValue)[0]?.step?.id||contextValue.tour.steps[0]?.id||null;
      writeProgress(contextValue,{status:'in-progress',activeStepId});
    }else{
      activeStepId=current.activeStepId||availableSteps(contextValue)[0]?.step?.id||contextValue.tour.steps[0]?.id||null;
    }
    return renderStep(contextValue,activeStepId);
  }

  function pause(){
    const contextValue=context();
    if(contextValue)writeProgress(contextValue,{status:'in-progress',activeStepId});
    suppressed=true;
    removeDialog();
  }

  function skip(){
    const contextValue=context();
    if(contextValue)writeProgress(contextValue,{
      status:'skipped',
      onboardingSkippedVersion:GUIDED_ONBOARDING_VERSION,
      activeStepId:null,
    });
    suppressed=true;
    removeDialog();
  }

  function complete(){
    const contextValue=context();
    if(contextValue)writeProgress(contextValue,{
      status:'completed',
      onboardingCompletedVersion:GUIDED_ONBOARDING_VERSION,
      activeStepId:null,
    });
    suppressed=true;
    removeDialog();
    try{
      root.dispatchEvent?.(new CustomEvent('m26:toast',{bubbles:true,detail:{message:guidedOnboardingCopy('chrome.completed')}}));
    }catch{}
  }

  function move(direction){
    const contextValue=context();
    if(!contextValue)return;
    const available=availableSteps(contextValue);
    if(!available.length){pause();return;}
    let index=available.findIndex(({step})=>step.id===activeStepId);
    if(index<0)index=0;
    if(direction<0){
      renderStep(contextValue,available[Math.max(0,index-1)].step.id);
      return;
    }
    if(index>=available.length-1){
      complete();
      return;
    }
    renderStep(contextValue,available[index+1].step.id);
  }

  function onDialogClick(event){
    if(event.target?.closest?.('[data-m26-guided-tour-close]')){event.preventDefault?.();pause();return;}
    if(event.target?.closest?.('[data-m26-guided-tour-skip]')){event.preventDefault?.();skip();return;}
    if(event.target?.closest?.('[data-m26-guided-tour-previous]')){event.preventDefault?.();move(-1);return;}
    if(event.target?.closest?.('[data-m26-guided-tour-next]')){event.preventDefault?.();move(1);}
  }

  function onRootClick(event){
    if(!event.target?.closest?.('[data-m26-guided-tour-open]'))return;
    queueMicrotask(()=>openTour({restart:true}));
  }

  function onKeyDown(event){
    if(!open||event.key!=='Escape')return;
    event.preventDefault?.();
    pause();
  }

  function refreshNow(){
    scheduled=false;
    if(!mounted)return;
    const contextValue=context();
    if(!contextValue){
      lastContextKey=null;
      removeDialog({restoreFocus:false});
      root.querySelector?.('[data-m26-guided-tour-settings]')?.remove?.();
      return;
    }
    if(lastContextKey&&lastContextKey!==contextValue.key){
      suppressed=false;
      activeStepId=null;
      removeDialog({restoreFocus:false});
    }
    lastContextKey=contextValue.key;
    const area=activeArea()||contextValue.tour.home;
    ensureSettings(contextValue,area);
    markLegacyLauncher();
    if(open){
      renderStep(contextValue,activeStepId);
      return;
    }
    const state=repository.read(contextValue.key,contextValue.role);
    if(!suppressed&&shouldAutoOpenGuidedOnboarding(state))openTour({restart:false});
  }

  function refresh(){
    if(scheduled||!mounted)return;
    scheduled=true;
    queueMicrotask(refreshNow);
  }

  return Object.freeze({
    mount(){
      if(mounted)return;
      mounted=true;
      root.addEventListener('click',onRootClick);
      documentLike?.addEventListener?.('keydown',onKeyDown);
      root.addEventListener?.('m26:shell-rendered',refresh);
      if(typeof scope?.MutationObserver==='function'){
        observer=new scope.MutationObserver(refresh);
        observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current']});
      }
      ensureStyle(documentLike);
      refresh();
    },
    destroy(){
      if(!mounted)return;
      mounted=false;
      scheduled=false;
      root.removeEventListener('click',onRootClick);
      root.removeEventListener?.('m26:shell-rendered',refresh);
      documentLike?.removeEventListener?.('keydown',onKeyDown);
      observer?.disconnect?.();
      observer=null;
      removeDialog({restoreFocus:false});
      root.querySelector?.('[data-m26-guided-tour-settings]')?.remove?.();
      root.querySelector?.('[data-progressive-onboarding-launcher]')?.removeAttribute?.('data-m26-guided-tour-open');
      documentLike?.querySelector?.('[data-m26-guided-tour-style]')?.remove?.();
      lastContextKey=null;
    },
    refresh,
    open:()=>openTour({restart:true}),
    getState(){
      const contextValue=context();
      return contextValue?repository.read(contextValue.key,contextValue.role):null;
    },
  });
}

export const __guidedOnboardingInternals=Object.freeze({
  ROLE_TOURS,
  COPY,
  COPY_LANGUAGES,
  STYLE_TEXT,
  text,
  hashIdentity,
  escapeHtml,
  prefersReducedMotion,
  findTarget,
});
