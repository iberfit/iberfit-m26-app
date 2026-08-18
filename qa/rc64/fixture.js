export const RC64_QUALITY_FIXTURE_SCHEMA='iberfit.quality-fixture.v1';

export const QUALITY_ROLES=Object.freeze(['client','coach','admin']);
export const QUALITY_STATES=Object.freeze([
  'normal',
  'loading',
  'empty',
  'error',
  'retry',
  'conflict',
  'offline',
]);

const ROLE_LABELS=Object.freeze({
  client:'Cliente',
  coach:'Coach',
  admin:'Admin',
});

function e(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function normalize(value,allowed,fallback){
  const candidate=String(value??'').trim().toLowerCase();
  return allowed.includes(candidate)?candidate:fallback;
}

function stateMarkup(state){
  switch(state){
    case 'loading':
      return '<div class="quality-spinner" aria-hidden="true"></div><h2>Cargando información</h2><p role="status" aria-live="polite">Estamos preparando la vista determinista de calidad.</p>';
    case 'empty':
      return '<h2>Sin registros todavía</h2><p>No hay elementos para mostrar en este escenario.</p><div class="quality-actions"><button type="button" class="iberfit-button" data-variant="primary" data-quality-action>Crear primer registro</button></div>';
    case 'error':
      return '<h2>No pudimos cargar esta vista</h2><p role="alert">La interfaz conserva un mensaje comprensible y una salida segura.</p><div class="quality-actions"><button type="button" class="iberfit-button" data-variant="primary" data-quality-action>Reintentar</button><button type="button" class="iberfit-button" data-variant="quiet" data-quality-action>Volver</button></div>';
    case 'retry':
      return '<h2>Listo para reintentar</h2><p role="status">La operación anterior no se confirmó. Ningún resultado pendiente se presenta como definitivo.</p><div class="quality-actions"><button type="button" class="iberfit-button" data-variant="primary" data-quality-action>Reintentar ahora</button></div>';
    case 'conflict':
      return '<h2>Hay cambios que revisar</h2><p role="alert">Conservamos ambas referencias hasta que una persona resuelva el conflicto.</p><div class="quality-actions"><button type="button" class="iberfit-button" data-variant="primary" data-quality-action>Revisar cambios</button><button type="button" class="iberfit-button" data-variant="quiet" data-quality-action>Más tarde</button></div>';
    case 'offline':
      return '<h2>Sin conexión</h2><p role="status" aria-live="polite">Puedes seguir consultando la información disponible. Las acciones que necesitan red permanecen claramente diferenciadas.</p><div class="quality-actions"><button type="button" class="iberfit-button" data-variant="quiet" data-quality-action>Volver a comprobar</button></div>';
    default:
      return '<h2>Estado normal</h2><p>La vista está operativa y lista para interacción.</p><div class="quality-actions"><button type="button" class="iberfit-button" data-variant="primary" data-quality-action>Continuar</button><button type="button" class="iberfit-button" data-variant="quiet" data-quality-action>Ver detalles</button></div>';
  }
}

export function renderQualityFixture({role='client',state='normal'}={}){
  const safeRole=normalize(role,QUALITY_ROLES,'client');
  const safeState=normalize(state,QUALITY_STATES,'normal');
  const nav=QUALITY_ROLES.map((item)=>`<button type="button" class="iberfit-button" data-variant="quiet" data-quality-action data-quality-role="${e(item)}"${item===safeRole?' aria-current="page"':''}>${e(ROLE_LABELS[item])}</button>`).join('');

  return `<div class="quality-shell" data-quality-fixture data-quality-role="${e(safeRole)}" data-quality-state="${e(safeState)}"><header class="quality-header"><p class="quality-eyebrow">IBERFIT Quality Platform · RC64.1</p><h1>${e(ROLE_LABELS[safeRole])} · escenario ${e(safeState)}</h1><p class="quality-meta">Fixture determinista sin identidad, salud ni backend.</p><nav class="quality-role-nav" aria-label="Roles de prueba">${nav}</nav></header><main id="quality-main" tabindex="-1"><div class="quality-grid"><section class="quality-card" aria-labelledby="quality-contract-title"><h2 id="quality-contract-title">Contrato visible</h2><ul class="quality-list"><li>Contenido estable por rol y estado.</li><li>Controles con objetivo táctil medible.</li><li>Sin dependencia de servicios remotos.</li><li>Preparado para teclado y lectores de pantalla.</li></ul></section><section class="quality-state" data-state="${e(safeState)}" aria-label="Estado de interfaz">${stateMarkup(safeState)}</section></div></main></div>`;
}

function mount(){
  const root=document.querySelector('#quality-root');
  if(!root)return;
  const params=new URLSearchParams(location.search);
  const role=normalize(params.get('role'),QUALITY_ROLES,'client');
  const state=normalize(params.get('state'),QUALITY_STATES,'normal');
  root.innerHTML=renderQualityFixture({role,state});
  root.dataset.qualityReady='true';

  root.addEventListener('click',(event)=>{
    const roleButton=event.target.closest?.('[data-quality-role]');
    if(!roleButton)return;
    const next=normalize(roleButton.dataset.qualityRole,QUALITY_ROLES,role);
    const url=new URL(location.href);
    url.searchParams.set('role',next);
    history.replaceState(null,'',url);
    root.innerHTML=renderQualityFixture({role:next,state});
    root.dataset.qualityReady='true';
  });
}

if(typeof document!=='undefined')mount();

export const __qualityFixtureInternals=Object.freeze({e,normalize,stateMarkup});