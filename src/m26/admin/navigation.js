export const ADMIN_AREAS=Object.freeze({
  'admin-inicio':{key:'admin-inicio',label:'Inicio',title:'Centro de control',scope:'admin-global',roles:['admin']},
  'admin-usuarios':{key:'admin-usuarios',label:'Usuarios',title:'Usuarios y accesos',scope:'admin-global',roles:['admin']},
  'admin-equipo':{key:'admin-equipo',label:'Equipo',title:'Equipo y asignaciones',scope:'admin-global',roles:['admin']},
  'admin-clientes':{key:'admin-clientes',label:'CRM y clientes',title:'CRM y ciclo de vida',scope:'admin-global',roles:['admin']},
  'admin-expediente':{key:'admin-expediente',label:'Expediente técnico',title:'Expediente de persona',scope:'selected-client',roles:['admin']},
  'admin-iri':{key:'admin-iri',label:'Diagnóstico IRI',title:'Diagnóstico IRI · Admin',scope:'selected-client',roles:['admin']},
  'admin-informes':{key:'admin-informes',label:'Informes IRI',title:'Informes IRI · Admin',scope:'client-context',roles:['admin']},
  'admin-notas':{key:'admin-notas',label:'Notas internas',title:'Notas privadas · Admin',scope:'selected-client',roles:['admin']},
  'admin-agenda':{key:'admin-agenda',label:'Agenda global',title:'Agenda y capacidad',scope:'admin-global',roles:['admin']},
  'admin-operaciones':{key:'admin-operaciones',label:'Operaciones',title:'Centro operativo',scope:'admin-global',roles:['admin']},
  'admin-media-review':{key:'admin-media-review',label:'Media Review',title:'Revisión de Media Factory',scope:'admin-global',roles:['admin']},
  'admin-comunicacion':{key:'admin-comunicacion',label:'Comunicación',title:'Comunicación y plantillas',scope:'admin-global',roles:['admin']},
  'admin-automatizaciones':{key:'admin-automatizaciones',label:'Automatizaciones',title:'Reglas automáticas',scope:'admin-global',roles:['admin']},
  'admin-analitica':{key:'admin-analitica',label:'Analítica',title:'Analítica del servicio',scope:'admin-global',roles:['admin']},
  'admin-auditoria':{key:'admin-auditoria',label:'Auditoría',title:'Auditoría y trazabilidad',scope:'admin-global',roles:['admin']},
  'admin-configuracion':{key:'admin-configuracion',label:'Configuración',title:'Configuración de IBERFIT',scope:'admin-global',roles:['admin']},
});
export const ADMIN_CLIENT_CONTEXT_TARGETS=Object.freeze({
  'admin-expediente':'expediente',
  'admin-iri':'iri',
  'admin-informes':'informes',
  'admin-notas':'notas',
});
const ADMIN_CLIENT_CONTEXT_REVERSE=Object.freeze(
  Object.fromEntries(Object.entries(ADMIN_CLIENT_CONTEXT_TARGETS).map(([adminArea,baseArea])=>[baseArea,adminArea]))
);
export function adminClientContextBaseArea(area){
  return ADMIN_CLIENT_CONTEXT_TARGETS[String(area||'').trim()]||null;
}
export function adminClientContextArea(area){
  const value=String(area||'').trim();
  return ADMIN_CLIENT_CONTEXT_REVERSE[value]||value;
}
export function isAdminClientContextArea(area){
  return Boolean(adminClientContextBaseArea(area));
}
export const ADMIN_NAVIGATION=Object.freeze({
  primary:['admin-inicio','admin-usuarios','admin-equipo','admin-clientes','admin-agenda'],
  context:['admin-operaciones','admin-media-review','admin-comunicacion','admin-automatizaciones','biblioteca','admin-analitica'],
  tools:['admin-auditoria','admin-configuracion'],
  mobile:['admin-inicio','admin-usuarios','admin-agenda','admin-operaciones','admin-equipo'],
});
