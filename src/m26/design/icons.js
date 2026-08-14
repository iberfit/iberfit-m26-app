/*
 * IBERFIT RC58.2 icon registry.
 * Selected icon geometry is derived from Lucide 1.27.0.
 * License: third_party/lucide-1.27.0-LICENSE.txt
 */

export const IBERFIT_LUCIDE_VERSION='1.27.0';

export const IBERFIT_LUCIDE_SOURCE_BLOBS=Object.freeze({
  house:'10e4097e290fdb2f1f919b264bf4e3095348de7c',
  users:'e31958f8795715f31b86d3c633652c20acb3a325',
  'calendar-days':'f05864a9c370bea2d3f297790af864abbbc2c249',
  dumbbell:'4aa46a279c5997cf36026bcdfec2dc441f6d2fd9',
  chart:'81653631e04e2dca1238eb0a26ba2fdfc73916d5',
  activity:'629b81c9fd020f3afec659daa5c9c7e5a1d07445',
  'message-circle':'d269b8b0f3651b6ff136036da05efe9e02214ae1',
  'shield-check':'da48f664e51be4ceb800dbe4f6c10c5e7cfa800e',
  settings:'4c6263af909841a3911f41a385021778eacba736',
  ellipsis:'68456c39be516d1d14aee329ca3b0056ba84d3c5',
  'log-out':'fe772e6692db987dd1a1c4f6670e8c2d49b20b94',
  'file-user':'dcc89a62c7743e50ce5af4891f491147f0140d52',
  'heart-pulse':'f1e4ec81f808208f9f5f999898aa007401c144b7',
  library:'bb6f673089b13c9206aecec3db821bd670a42d99',
  sparkles:'2d749398b6068eff83ddb0c165c0e14184f9fb6d',
  'notebook-pen':'b90c54bf82fd3a0c3992c3597230c2599bd33be6',
});

const ICON_NODES=Object.freeze({
  house:`<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />`,
  users:`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" />`,
  'calendar-days':`<path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /><path d="M8 18h.01" /><path d="M12 18h.01" /><path d="M16 18h.01" />`,
  dumbbell:`<path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" /><path d="m2.5 21.5 1.4-1.4" /><path d="m20.1 3.9 1.4-1.4" /><path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" /><path d="m9.6 14.4 4.8-4.8" />`,
  chart:`<path d="M5 21v-6" /><path d="M12 21V9" /><path d="M19 21V3" />`,
  activity:`<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />`,
  'message-circle':`<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />`,
  'shield-check':`<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" />`,
  settings:`<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" />`,
  ellipsis:`<circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />`,
  'log-out':`<path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />`,
  'file-user':`<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /><path d="M14 2v5a1 1 0 0 0 1 1h5" /><path d="M16 22a4 4 0 0 0-8 0" /><circle cx="12" cy="15" r="3" />`,
  'heart-pulse':`<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" /><path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />`,
  library:`<path d="m16 6 4 14" /><path d="M12 6v14" /><path d="M8 8v12" /><path d="M4 4v16" />`,
  sparkles:`<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /><path d="M20 2v4" /><path d="M22 4h-4" /><circle cx="4" cy="20" r="2" />`,
  'notebook-pen':`<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" /><path d="M2 6h4" /><path d="M2 10h4" /><path d="M2 14h4" /><path d="M2 18h4" /><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />`,
});

const AREA_ICONS=Object.freeze({
  acceso:'house',
  hoy:'house',
  clientes:'users',
  expediente:'file-user',
  iri:'heart-pulse',
  informes:'chart',
  planificacion:'calendar-days',
  agenda:'calendar-days',
  sesion:'dumbbell',
  progreso:'chart',
  actividad:'activity',
  notas:'notebook-pen',
  inteligencia:'sparkles',
  biblioteca:'library',
  verificacion:'shield-check',
  mensajes:'message-circle',
  'admin-inicio':'house',
  'admin-usuarios':'users',
  'admin-equipo':'users',
  'admin-clientes':'users',
  'admin-agenda':'calendar-days',
  'admin-operaciones':'activity',
  'admin-comunicacion':'message-circle',
  'admin-automatizaciones':'sparkles',
  'admin-analitica':'chart',
  'admin-auditoria':'shield-check',
  'admin-configuracion':'settings',
});

function escapeAttribute(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('"','&quot;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}

function sanitizeClassName(value){
  const tokens=String(value??'')
    .split(/\s+/u)
    .filter(Boolean)
    .filter((token)=>/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(token));
  return tokens.length?tokens.join(' '):'iberfit-icon';
}

export function areaIconName(area){
  return AREA_ICONS[String(area||'')]||null;
}

export function renderIberfitIcon(name,{className='iberfit-icon',label=null}={}){
  const nodes=ICON_NODES[String(name||'')];
  if(!nodes)return '';
  const accessibility=label
    ?`role="img" aria-label="${escapeAttribute(label)}"`
    :'aria-hidden="true" focusable="false"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${sanitizeClassName(className)}" ${accessibility}>${nodes}</svg>`;
}

export function iconRegistryAudit(){
  const unsafe=Object.entries(ICON_NODES).filter(([,nodes])=>/<script|foreignObject|on[a-z]+\s*=|(?:href|src)\s*=/i.test(nodes));
  return Object.freeze({
    ok:unsafe.length===0,
    version:IBERFIT_LUCIDE_VERSION,
    icons:Object.freeze(Object.keys(ICON_NODES)),
    mappedAreas:Object.freeze(Object.keys(AREA_ICONS)),
    unsafe:Object.freeze(unsafe.map(([name])=>name)),
  });
}