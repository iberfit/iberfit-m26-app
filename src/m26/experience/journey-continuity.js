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
  const next=model.next?'<button type="button" class="m26-journey-next" data-m26-area="'+safeText(model.next.area)+'" aria-label="'+safeText(model.nextCopy+': '+model.next.label)+'"><span>'+safeText(model.nextCopy)+'</span><strong>'+safeText(model.next.label)+'</strong><span aria-hidden="true">→</span></button>':'';
  const person=model.person?'<span class="m26-journey-person">'+safeText(model.person)+'</span>':'';
  return '<section class="m26-journey" data-m26-journey="'+safeText(model.role)+'" aria-label="'+safeText(model.title)+'" aria-describedby="m26-journey-explanation"><div class="m26-journey-heading"><p class="m26-eyebrow">'+safeText(model.title)+'</p>'+person+'</div><nav class="m26-journey-steps" aria-label="'+safeText(model.title)+'">'+steps+'</nav>'+next+'<span id="m26-journey-explanation" class="m26-journey-note">'+safeText(model.note)+'</span></section>';
}

export const __journeyContinuityInternals=Object.freeze({safeText,copyFor,visibleAreas});
