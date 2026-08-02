export const ADMIN_AREAS=Object.freeze({
  'admin-inicio':{key:'admin-inicio',label:'Inicio',title:'Centro de control',scope:'admin-global',roles:['admin']},
  'admin-usuarios':{key:'admin-usuarios',label:'Usuarios',title:'Usuarios y accesos',scope:'admin-global',roles:['admin']},
  'admin-equipo':{key:'admin-equipo',label:'Equipo',title:'Equipo y asignaciones',scope:'admin-global',roles:['admin']},
  'admin-clientes':{key:'admin-clientes',label:'CRM y clientes',title:'CRM y ciclo de vida',scope:'admin-global',roles:['admin']},
  'admin-agenda':{key:'admin-agenda',label:'Agenda global',title:'Agenda y capacidad',scope:'admin-global',roles:['admin']},
  'admin-operaciones':{key:'admin-operaciones',label:'Operaciones',title:'Centro operativo',scope:'admin-global',roles:['admin']},
  'admin-comunicacion':{key:'admin-comunicacion',label:'Comunicación',title:'Comunicación y plantillas',scope:'admin-global',roles:['admin']},
  'admin-automatizaciones':{key:'admin-automatizaciones',label:'Automatizaciones',title:'Reglas automáticas',scope:'admin-global',roles:['admin']},
  'admin-analitica':{key:'admin-analitica',label:'Analítica',title:'Analítica del servicio',scope:'admin-global',roles:['admin']},
  'admin-auditoria':{key:'admin-auditoria',label:'Auditoría',title:'Auditoría y trazabilidad',scope:'admin-global',roles:['admin']},
  'admin-configuracion':{key:'admin-configuracion',label:'Configuración',title:'Configuración de IBERFIT',scope:'admin-global',roles:['admin']},
});
export const ADMIN_NAVIGATION=Object.freeze({primary:['admin-inicio','admin-usuarios','admin-equipo','admin-clientes','admin-agenda'],context:['admin-operaciones','admin-comunicacion','admin-automatizaciones','admin-analitica'],tools:['admin-auditoria','admin-configuracion'],mobile:['admin-inicio','admin-usuarios','admin-agenda','admin-operaciones','admin-equipo']});
