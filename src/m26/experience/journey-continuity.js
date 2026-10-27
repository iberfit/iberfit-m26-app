import {clientHealthSummary} from '../modules/domain-selectors.js';
import {deriveClientExperience,experienceNextAction} from './client-experience.js';
import {resolveM26Route} from '../shell/route-guard.js';

/**
 * SIGNATURE B28: role-aware continuity of work.
 * This is a navigation affordance, not a workflow state machine or permission grant.
 * No displayed step claims that another step has been completed.
 */
export const JOURNEY_CONTINUITY_VERSION='iberfit.signature.journey.v1';

const FLOWS=Object.freeze({
  client:Object.freeze({
    areas:Object.freeze(['hoy','planificacion','sesion','progreso']),
    showOn:Object.freeze(['planificacion','progreso']),
    selected:false,
    kind:'journey',
  }),
  coach:Object.freeze({
    areas:Object.freeze(['expediente','iri','planificacion','sesion','progreso']),
    showOn:Object.freeze(['expediente','iri','planificacion','progreso']),
    selected:true,
    kind:'journey',
  }),
  adminPerson:Object.freeze({
    areas:Object.freeze(['admin-expediente','admin-iri','admin-informes','admin-notas']),
    showOn:Object.freeze(['admin-expediente','admin-iri','admin-informes','admin-notas']),
    selected:true,
    kind:'sections',
  }),
  adminOps:Object.freeze({
    areas:Object.freeze(['admin-clientes','admin-operaciones','admin-auditoria']),
    showOn:Object.freeze(['admin-clientes','admin-operaciones','admin-auditoria']),
    selected:false,
    kind:'sections',
  }),
});

const LABELS=Object.freeze({
  es:Object.freeze({
    coachStages:Object.freeze({planificacion:'Planificar',sesion:'Sesiones',progreso:'Revisar'}),
    client:'Tu recorrido',coach:'Espacio de la persona',adminPerson:'Expediente y control',adminOps:'Áreas de gestión',
    next:'Explorar siguiente etapa', current:'Sección actual', note:'Estas secciones orientan la navegación; no indican tareas completadas.',
    hoy:'Hoy',planificacion:'Mi plan',sesion:'Entrenar',progreso:'Evolución',
    expediente:'Resumen',iri:'Diagnóstico IRI',
    'admin-expediente':'Expediente','admin-iri':'Diagnóstico IRI','admin-informes':'Informes',
    'admin-notas':'Notas','admin-clientes':'Personas','admin-operaciones':'Operaciones','admin-auditoria':'Auditoría',
  }),
  en:Object.freeze({
    coachStages:Object.freeze({planificacion:'Plan',sesion:'Sessions',progreso:'Review'}),
    client:'Your journey',coach:'Person workspace',adminPerson:'Record and oversight',adminOps:'Management areas',
    next:'Explore the next stage',current:'Current section',note:'These sections guide navigation; they do not mark tasks as complete.',
    hoy:'Today',planificacion:'My plan',sesion:'Train',progreso:'Progress',
    expediente:'Overview',iri:'Initial IRI assessment',
    'admin-expediente':'Record','admin-iri':'Initial IRI assessment','admin-informes':'Reports',
    'admin-notas':'Notes','admin-clientes':'People','admin-operaciones':'Operations','admin-auditoria':'Audit',
  }),
  fr:Object.freeze({
    coachStages:Object.freeze({planificacion:'Planifier',sesion:'Séances',progreso:'Réviser'}),
    client:'Votre parcours',coach:'Espace de la personne',adminPerson:'Dossier et contrôle',adminOps:'Gestion',
    next:'Explorer l’étape suivante',current:'Section actuelle',note:'Ces rubriques guident la navigation ; elles ne confirment pas la réalisation des tâches.',
    hoy:'Aujourd’hui',planificacion:'Mon programme',sesion:'S’entraîner',progreso:'Évolution',
    expediente:'Résumé',iri:'Bilan IRI initial',
    'admin-expediente':'Dossier','admin-iri':'Bilan IRI initial','admin-informes':'Rapports',
    'admin-notas':'Notes','admin-clientes':'Personnes','admin-operaciones':'Opérations','admin-auditoria':'Audit',
  }),
  pt:Object.freeze({
    coachStages:Object.freeze({planificacion:'Planear',sesion:'Sessões',progreso:'Rever'}),
    client:'O seu percurso',coach:'Espaço da pessoa',adminPerson:'Ficha e controlo',adminOps:'Áreas de gestão',
    next:'Explorar a próxima etapa',current:'Secção atual',note:'Estas secções orientam a navegação; não assinalam tarefas concluídas.',
    hoy:'Hoje',planificacion:'O meu plano',sesion:'Treinar',progreso:'Evolução',
    expediente:'Resumo',iri:'Avaliação IRI inicial',
    'admin-expediente':'Ficha','admin-iri':'Avaliação IRI inicial','admin-informes':'Relatórios',
    'admin-notas':'Notas','admin-clientes':'Pessoas','admin-operaciones':'Operações','admin-auditoria':'Auditoria',
  }),
});


const AREA_GUIDANCE=Object.freeze({
  client:Object.freeze({
    planificacion:Object.freeze({es:['Comprueba qué ha preparado tu Coach y cuándo corresponde cada sesión.','Para entrenar, entra en Sesiones y revisa cuáles están habilitadas para ti.'],en:['Review your coach’s plan and the timing of each session.','To train, open Sessions and check which workouts are available to you.'],fr:['Consultez le programme de votre coach et le calendrier des séances.','Pour vous entraîner, ouvrez Séances et vérifiez celles qui vous sont proposées.'],pt:['Veja o plano do seu Coach e quando está prevista cada sessão.','Para treinar, abra Sessões e verifique quais estão disponíveis.']}),
    progreso:Object.freeze({es:['Consulta la evolución que puede justificarse con registros reales.','La evaluación IRI inicial es tu punto de partida, no una medición de progreso.'],en:['Review progress supported by actual recorded results.','Your initial IRI assessment is a starting point, not a progress measurement.'],fr:['Consultez une évolution fondée sur les résultats réellement enregistrés.','Le bilan IRI initial est votre point de départ, pas une mesure de progression.'],pt:['Consulte a evolução sustentada por resultados efetivamente registados.','A avaliação IRI inicial é o ponto de partida, não uma medida de progresso.']}),
  }),
  coach:Object.freeze({
    expediente:Object.freeze({es:['Comprueba el contexto de la persona antes de decidir el trabajo.','Accede al Diagnóstico IRI para revisar el punto de partida; el seguimiento se consulta aparte.'],en:['Review the person’s context before making training decisions.','Open the initial IRI assessment for the baseline; ongoing follow-up is separate.'],fr:['Examinez le contexte de la personne avant de décider du travail.','Ouvrez le bilan IRI initial pour la référence ; le suivi est distinct.'],pt:['Consulte o contexto da pessoa antes de decidir o treino.','Abra a avaliação IRI inicial para a referência; o acompanhamento é separado.']}),
    iri:Object.freeze({es:['Documenta la evaluación inicial, sus condiciones y la evidencia disponible.','El IRI es el diagnóstico de partida: no lo conviertas en una evolución ni bloquees el plan si es diferible.'],en:['Document the baseline assessment, its conditions and supporting evidence.','IRI is the starting diagnosis: do not treat it as progress or block planning when it can be deferred.'],fr:['Documentez le bilan initial, ses conditions et les preuves disponibles.','Le bilan IRI est le point de départ : ne le confondez pas avec le suivi et ne bloquez pas le plan s’il peut être reporté.'],pt:['Documente a avaliação inicial, as condições e a evidência disponível.','O IRI é o diagnóstico de partida: não o confunda com a evolução nem bloqueie o plano quando é adiável.']}),
    planificacion:Object.freeze({es:['Organiza ejercicios, series, cargas y variantes según el contexto del cliente.','Revisa la prescripción antes de publicarla; planificado no significa realizado.'],en:['Organize exercises, sets, loads and alternatives for this client.','Review the prescription before publishing; planned does not mean performed.'],fr:['Organisez exercices, séries, charges et variantes pour cette personne.','Vérifiez la prescription avant de publier ; prévu ne veut pas dire réalisé.'],pt:['Organize exercícios, séries, cargas e variantes para esta pessoa.','Reveja a prescrição antes de publicar; planeado não significa realizado.']}),
    progreso:Object.freeze({es:['Compara resultados y adherencia solo cuando los datos sean equivalentes.','Decide ajustes, progresiones o regresiones con criterio; el diagnóstico inicial se mantiene separado.'],en:['Compare outcomes and adherence only when data is comparable.','Use your judgement for progression or regression; keep the initial diagnosis separate.'],fr:['Comparez les résultats et l’adhérence uniquement si les données sont comparables.','Décidez des progressions ou régressions ; gardez le bilan initial distinct.'],pt:['Compare os resultados e a adesão apenas quando os dados forem comparáveis.','Decida progressões ou regressões com critério; mantenha a avaliação inicial separada.']}),
  }),
  admin:Object.freeze({
    'admin-clientes':Object.freeze({es:['Localiza a la persona y revisa el estado de su relación con IBERFIT.','Para intervenir en un expediente, selecciona primero el contexto correcto.'],en:['Find a person and review their relationship with IBERFIT.','Select the correct record before making changes.'],fr:['Retrouvez une personne et examinez son parcours avec IBERFIT.','Sélectionnez le bon dossier avant toute intervention.'],pt:['Encontre uma pessoa e consulte o seu percurso com a IBERFIT.','Selecione a ficha correta antes de intervir.']}),
    'admin-operaciones':Object.freeze({es:['Prioriza incidencias y tareas que requieran intervención.','Confirma el resultado antes de considerar una operación resuelta.'],en:['Prioritize incidents and tasks that need action.','Verify the outcome before marking an operation as resolved.'],fr:['Priorisez les incidents et les tâches nécessitant une intervention.','Vérifiez le résultat avant de considérer l’opération comme résolue.'],pt:['Priorize incidentes e tarefas que exijam intervenção.','Verifique o resultado antes de considerar uma operação resolvida.']}),
    'admin-auditoria':Object.freeze({es:['Examina los eventos y su trazabilidad antes de actuar.','Mantén separados revisión, permisos y modificaciones de datos.'],en:['Review events and their audit trail before acting.','Keep review, permissions and data changes separate.'],fr:['Examinez les événements et leur traçabilité avant d’agir.','Séparez contrôle, autorisations et modifications de données.'],pt:['Analise os eventos e a rastreabilidade antes de atuar.','Separe revisão, permissões e alterações de dados.']}),
    'admin-expediente':Object.freeze({es:['Comprueba la identidad y el contexto de la persona seleccionada.','Mantén separados su diagnóstico IRI inicial y los datos longitudinales.'],en:['Verify the identity and context of the selected person.','Keep the initial IRI diagnosis separate from longitudinal data.'],fr:['Vérifiez l’identité et le contexte de la personne sélectionnée.','Distinguez le bilan IRI initial des données longitudinales.'],pt:['Confirme a identidade e o contexto da pessoa selecionada.','Mantenha o diagnóstico IRI inicial separado dos dados longitudinais.']}),
    'admin-iri':Object.freeze({es:['Revisa evidencia, protocolo y trazabilidad del diagnóstico inicial.','La evolución posterior pertenece al seguimiento y a sus informes.'],en:['Review evidence, protocol and traceability of the baseline diagnosis.','Later progress belongs to follow-up and its reports.'],fr:['Vérifiez les preuves, le protocole et la traçabilité du bilan initial.','L’évolution ultérieure relève du suivi et de ses rapports.'],pt:['Reveja evidência, protocolo e rastreabilidade do diagnóstico inicial.','A evolução posterior pertence ao acompanhamento e aos relatórios.']}),
    'admin-informes':Object.freeze({es:['Consulta los informes disponibles con su fecha y finalidad.','No deduzcas progreso de una evaluación inicial aislada.'],en:['Review available reports with their date and purpose.','Do not infer progress from a standalone baseline assessment.'],fr:['Consultez les rapports avec leur date et leur finalité.','N’inférez pas de progression d’un seul bilan initial.'],pt:['Consulte relatórios com a respetiva data e finalidade.','Não infira progresso de uma avaliação inicial isolada.']}),
    'admin-notas':Object.freeze({es:['Consulta las notas internas dentro del expediente correcto.','Comprueba el destinatario y los permisos antes de incorporar información sensible.'],en:['Review internal notes within the correct record.','Check the recipient and permissions before adding sensitive information.'],fr:['Consultez les notes internes dans le bon dossier.','Vérifiez destinataire et autorisations avant d’ajouter des informations sensibles.'],pt:['Consulte as notas internas na ficha correta.','Verifique o destinatário e as permissões antes de incluir dados sensíveis.']}),
  }),
});
const GUIDE_UI=Object.freeze({
  es:Object.freeze({label:'¿Qué hago aquí?',tour:'Ver guía interactiva',related:'Abrir sección relacionada'}),
  en:Object.freeze({label:'What can I do here?',tour:'Open interactive guide',related:'Open related section'}),
  fr:Object.freeze({label:'Que faire ici ?',tour:'Ouvrir le guide interactif',related:'Ouvrir la rubrique liée'}),
  pt:Object.freeze({label:'O que faço aqui?',tour:'Abrir guia interativo',related:'Abrir secção relacionada'}),
});

export function journeyHelpFor(vm){
  const language=String(vm?.language||'es').split('-')[0].toLowerCase();
  const lang=Object.hasOwn(GUIDE_UI,language)?language:'es';
  const role=String(vm?.identity?.role||'');
  const area=String(vm?.activeArea||'');
  const copy=AREA_GUIDANCE[role]?.[area]?.[lang];
  if(!copy)return null;
  return Object.freeze({label:GUIDE_UI[lang].label,tour:GUIDE_UI[lang].tour,
    related:GUIDE_UI[lang].related,
    items:Object.freeze(copy.map(item=>String(item))),
    tourAttribute:role==='client'?'data-m26-client-context-guide-open':'data-m26-guided-tour-open'});
}


/* SIGNATURE B29. Advisory navigation only; no implicit mutations. */
const ACTION_NAMES=Object.freeze({
 es:{heading:'Según tu situación actual',complete_profile:'Completar expediente',prepare_plan:'Preparar planificación',schedule_appointment:'Organizar próxima cita',review_follow_up:'Revisar seguimiento',review_iri:'Revisar Diagnóstico IRI',view_next_appointment:'Ver próxima cita',open_autonomous_workout:'Ver entrenamiento disponible',review_plan:'Revisar mi plan',daily_checkin:'Registrar cómo estoy hoy',sync_attention:'Revisar cambios sin confirmar',sync_attention_admin:'Revisar incidencias operativas'},
 en:{heading:'Based on your current situation',complete_profile:'Complete the record',prepare_plan:'Prepare the plan',schedule_appointment:'Arrange next appointment',review_follow_up:'Review follow-up',review_iri:'Review initial IRI assessment',view_next_appointment:'View next appointment',open_autonomous_workout:'View available workout',review_plan:'Review my plan',daily_checkin:'Record how I feel today',sync_attention:'Review unconfirmed changes',sync_attention_admin:'Review operational incidents'},
 fr:{heading:'Selon votre situation actuelle',complete_profile:'Compléter le dossier',prepare_plan:'Préparer le programme',schedule_appointment:'Organiser le prochain rendez-vous',review_follow_up:'Vérifier le suivi',review_iri:'Consulter le bilan IRI initial',view_next_appointment:'Voir le prochain rendez-vous',open_autonomous_workout:'Voir la séance disponible',review_plan:'Consulter mon programme',daily_checkin:'Noter mon état du jour',sync_attention:'Vérifier les changements non confirmés',sync_attention_admin:'Examiner les incidents opérationnels'},
 pt:{heading:'Segundo a situação atual',complete_profile:'Completar a ficha',prepare_plan:'Preparar o plano',schedule_appointment:'Organizar a próxima sessão',review_follow_up:'Rever o acompanhamento',review_iri:'Rever a avaliação IRI inicial',view_next_appointment:'Ver a próxima marcação',open_autonomous_workout:'Ver treino disponível',review_plan:'Rever o meu plano',daily_checkin:'Registar como estou hoje',sync_attention:'Rever alterações não confirmadas',sync_attention_admin:'Rever incidentes operacionais'}
});
const ACTION_KEYS=Object.freeze({
 client:new Set(['view_next_appointment','open_autonomous_workout','review_plan','daily_checkin']),
 coach:new Set(['complete_profile','prepare_plan','schedule_appointment','review_follow_up','review_iri','sync_attention']),admin:new Set(['sync_attention_admin'])
});
const CONTEXT_PAGES=Object.freeze({client:new Set(['planificacion','progreso']),coach:new Set(['expediente','iri','planificacion','progreso']),admin:new Set(['admin-clientes','admin-auditoria'])});
function visibleRouteSet(vm){
 return new Set([...vm?.navigation?.primary||[],...vm?.navigation?.context||[],...vm?.navigation?.tools||[]].map(x=>String(x?.key||'')));
}
export function projectSafeWorkAction({vm,state,action,experience}={}){
 const role=String(vm?.identity?.role||''),area=String(action?.area||''),key=String(action?.key||'');
 if(vm?.mode!=='authenticated'||state?.hydration?.status!=='ready')return null;
 if(String(state?.identity?.role||'')!==role)return null;
 if(!CONTEXT_PAGES[role]?.has(vm?.activeArea)||!ACTION_KEYS[role]?.has(key))return null;
 if(!visibleRouteSet(vm).has(area)||area===vm.activeArea)return null;
 if(role==='admin'){
  if(key!=='sync_attention_admin'||area!=='admin-operaciones'||
     !((state?.conflicts?.length||0)+(state?.rejectedOperations?.length||0)))return null;
  const lang=String(vm?.language||'es').split('-')[0].toLowerCase();
  const local=ACTION_NAMES[lang]||ACTION_NAMES.es;
  return Object.freeze({key,area,personId:null,label:local[key],heading:local.heading,source:'operations'});
 }
 const clientId=role==='client'?String(state?.identity?.clientId||''):String(state?.selectedClientId||'');
 if(!clientId||String(vm?.selectedClient?.id||'')!==clientId)return null;
 if(role==='client'&&String(vm?.identity?.clientId||'')!==clientId)return null;
 if(!state?.collections?.clients?.some?.(x=>String(x?.id||'')===clientId))return null;
 if(area==='sesion'&&experience?.trainingServiceStatus!=='active')return null;
 const language=String(vm?.language||'es').split('-')[0].toLowerCase();
 const local=ACTION_NAMES[language]||ACTION_NAMES.es;
 return Object.freeze({key,area,personId:clientId,label:local[key],heading:local.heading,source:key==='sync_attention'?'operations':'health-summary'});
}
export function deriveRoleWorkContinuation(vm,state,{now=new Date()}={}){
 if(vm?.mode!=='authenticated'||state?.hydration?.status!=='ready')return null;
 const role=String(vm?.identity?.role||'');
 if(String(state?.identity?.role||'')!==role)return null;
 if(!CONTEXT_PAGES[role]?.has(vm?.activeArea))return null;
 if(role==='admin'){
  const action=projectSafeWorkAction({vm,state,action:{key:'sync_attention_admin',area:'admin-operaciones'}});
  return action&&resolveM26Route(state,action.area).allowed?action:null;
 }
 const clientId=role==='client'?String(state?.identity?.clientId||''):String(state?.selectedClientId||'');
 if(!clientId||clientId!==String(vm?.selectedClient?.id||''))return null;
 if(role==='coach'&&((state?.conflicts?.length||0)+(state?.rejectedOperations?.length||0))>0){
  const recovery=projectSafeWorkAction({vm,state,action:{key:'sync_attention',area:'verificacion'}});
  if(recovery&&resolveM26Route(state,recovery.area).allowed)return recovery;
 }
 if(!state?.collections?.clients?.some?.(x=>String(x?.id||'')===clientId))return null;
 // Invalid or partial read-model data must never take down the authenticated shell.
 // A missing recommendation is preferable to inventing a task or blocking navigation.
 try{
  const summary=clientHealthSummary(state,clientId,now);
  if(!summary||String(summary?.client?.id||'')!==clientId)return null;
  const experience=deriveClientExperience(summary);
  const action=experienceNextAction(experience,{role});
  const proposed=projectSafeWorkAction({vm,state,action,experience});
  if(!proposed)return null;
  const decision=resolveM26Route(state,proposed.area);
  return decision.allowed&&decision.area===proposed.area?proposed:null;
 }catch{
  return null;
 }
}

function safeText(value){
  return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function visibleAreas(vm){
  const nav=vm?.navigation||{};
  return new Set([...nav.primary||[],...nav.context||[],...nav.tools||[]].map(item=>String(item?.key||'')));
}
function copyFor(language){return LABELS[String(language||'es').split('-')[0].toLowerCase()]||LABELS.es;}
function flowFor(vm){
  const role=String(vm?.identity?.role||'');
  const area=String(vm?.activeArea||'');
  if(role==='admin')return FLOWS.adminPerson.showOn.includes(area)?['adminPerson',FLOWS.adminPerson]:['adminOps',FLOWS.adminOps];
  return [role,FLOWS[role]];
}

export function deriveJourneyContinuity(vm){
  if(vm?.mode!=='authenticated')return null;
  const [key,flow]=flowFor(vm);
  const activeArea=String(vm?.activeArea||'');
  if(!flow||!flow.showOn.includes(activeArea))return null;
  if(flow.selected&&!vm?.selectedClient?.id)return null;
  if(key==='client'&&!vm?.selectedClient?.id)return null;
  const visible=visibleAreas(vm);
  if(!visible.has(activeArea))return null;
  const c=copyFor(vm.language);
  const steps=flow.areas.filter(area=>visible.has(area)).map(area=>Object.freeze({area,label:(key==='coach'?c.coachStages?.[area]:null)||c[area]||area,active:area===activeArea}));
  if(steps.length<2)return null;
  const index=steps.findIndex(step=>step.active);
  if(index<0)return null;
  const next=flow.kind==='journey'?steps[index+1]||null:null;
  return Object.freeze({
    role:String(vm.identity.role),kind:flow.kind,title:c[key],
    current:c.current,nextCopy:c.next,note:c.note,
    person:flow.selected?String(vm.selectedClient.name||'').trim().slice(0,120):'',
    steps:Object.freeze(steps),next,
  });
}

export function renderJourneyContinuity(vm){
  const model=deriveJourneyContinuity(vm);
  if(!model)return '';
  const steps=model.steps.map(step=>'<button type="button" class="m26-journey-step'+(step.active?' is-current':'')+'" data-m26-area="'+safeText(step.area)+'"'+(step.active?' aria-current="step"':'')+'><span>'+safeText(step.label)+'</span></button>').join('');
  // Client has the existing Hoy/Plan/Progress action and four visible journey
  // destinations. A second primary CTA adds cognitive load on narrow screens.
  const useNativeClientAction=model.role==='client';
  const suggestion=!useNativeClientAction&&vm?.workContinuation&&vm.workContinuation.area!==vm.activeArea?vm.workContinuation:null;
  const nextTarget=useNativeClientAction?null:(suggestion||model.next);
  const nextText=suggestion?.label||model.next?.label;
  const nextHeading=suggestion?.heading||model.nextCopy;
  const provenance=suggestion?' data-m26-work-continuation="'+safeText(suggestion.source)+'"':'';
  const next=nextTarget?'<button type="button" class="m26-journey-next'+(suggestion?' is-evidence-led':'')+'" data-m26-area="'+safeText(nextTarget.area)+'"'+provenance+' aria-label="'+safeText(nextHeading+': '+nextText)+'"><span>'+safeText(nextHeading)+'</span><strong>'+safeText(nextText)+'</strong><span aria-hidden="true">→</span></button>':'';
  const help=journeyHelpFor(vm);
  const helpMarkup=help?'<details class="m26-journey-help"><summary>'+safeText(help.label)+'</summary><div class="m26-journey-help-content">'+help.items.map(item=>'<p>'+safeText(item)+'</p>').join('')+'<button type="button" class="m26-journey-tour" '+help.tourAttribute+'>'+safeText(help.tour)+'</button></div></details>':'';
  const person=model.person?'<span class="m26-journey-person">'+safeText(model.person)+'</span>':'';
  return '<section class="m26-journey" data-m26-journey="'+safeText(model.role)+'" aria-label="'+safeText(model.title)+'" aria-describedby="m26-journey-explanation"><div class="m26-journey-heading"><p class="m26-eyebrow">'+safeText(model.title)+'</p>'+person+'</div><nav class="m26-journey-steps" aria-label="'+safeText(model.title)+'">'+steps+'</nav>'+next+helpMarkup+'<span id="m26-journey-explanation" class="m26-journey-note">'+safeText(model.note)+'</span></section>';
}

export const __journeyContinuityInternals=Object.freeze({safeText,copyFor,visibleAreas});
