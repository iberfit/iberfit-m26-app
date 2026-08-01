import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const checks=[];
function check(name,fn){
  try{fn();checks.push({name,ok:true});}
  catch(error){checks.push({name,ok:false,detail:String(error?.message||error)});}
}
const required=[
  'src/m26/rc39/session-policy.js',
  'src/m26/rc39/calendar.js',
  'src/m26/rc39/multi-role.js',
  'src/m26/rc39/transport.js',
  'src/m26/rc39/view-model.js',
  'src/m26/rc39/route-render.js',
  'src/m26/rc39/controller.js',
  'src/m26/rc39/shell-enhancer.js',
  'src/m26/rc39/rc39.css',
  'backend/RC39_CARLOS_MULTIROLE.sql',
  'docs/RC39_INTEGRATED_CLIENT_COACH_MULTIROLE.md',
  'docs/RC39_QA_MATRIX.md',
  'tests/m26_rc39_integrated_client_coach_multirole.test.mjs',
];
for(const path of required)check(`Existe ${path}`,()=>assert.equal(existsSync(new URL(`../${path}`,import.meta.url)),true));

check('Planificación híbrida distingue resumen y contenido completo',()=>{
  const source=read('src/m26/rc39/session-policy.js');
  assert.match(source,/summary_only/);
  assert.match(source,/client_autonomous/);
  assert.match(source,/coach_led/);
  assert.match(source,/openHours=48/);
  assert.match(source,/closeMinutes=120/);
});
check('Calendario conserva UID estable y alarmas',()=>{
  const source=read('src/m26/rc39/calendar.js');
  assert.match(source,/appointment-\$\{id\}@iberfit\.cl/);
  assert.match(source,/TRIGGER:-PT24H/);
  assert.match(source,/TRIGGER:-PT1H/);
});
check('Cliente no recibe navegación móvil duplicada',()=>{
  assert.match(read('src/m26/rc39/rc39.css'),/\.m26-shell\[data-m26-role="client"\] \.m26-mobile-nav\{display:none!important\}/);
});
check('Carlos solo puede elegir roles autorizados por backend',()=>{
  const source=read('src/m26/rc39/multi-role.js');
  assert.match(source,/M26_ROLE_SWITCH_FORBIDDEN/);
  assert.match(source,/authorizedRoles/);
  const sql=read('backend/RC39_CARLOS_MULTIROLE.sql');
  assert.match(sql,/iberfit\.cl@gmail\.com/);
  assert.match(sql,/user_application_roles/);
  assert.match(sql,/iberfit_authorized_application_roles_v13/);
});
check('Solicitud de cambio es aditiva, autenticada y dentro de 48 h',()=>{
  const sql=read('backend/RC39_CARLOS_MULTIROLE.sql');
  assert.match(sql,/security definer/);
  assert.match(sql,/appointment_change_requests/);
  assert.match(sql,/interval '48 hours'/);
  assert.match(sql,/interval '2 hours'/);
  assert.match(sql,/revoke all .* from public,anon/is);
  assert.doesNotMatch(sql,/drop\s+(?:table|function)|truncate|delete\s+from/i);
});
check('Integración de aplicación RC39 presente',()=>{
  const app=read('src/m26/app/application.js');
  assert.match(app,/createRc39Controller/);
  assert.match(app,/createRc39Transport/);
  assert.match(app,/actorCanExecuteSession/);
  assert.match(app,/sessionRequiresConfirmedAppointment/);
});
check('Hoy canónico permanece como fuente única para Coach y Admin',()=>{
  const rc39Renderer=read('src/m26/rc39/route-render.js');
  const canonicalRenderer=read('src/m26/modules/route-render.js');
  assert.doesNotMatch(rc39Renderer,/vm\.kind===['"]hoy['"]/);
  assert.match(canonicalRenderer,/Prioridades de hoy/);
  assert.match(canonicalRenderer,/Ningún cambio se muestra como confirmado/);
  assert.match(canonicalRenderer,/Sesiones confirmadas hoy/);
});
check('Identidad Cliente mantiene contrato mínimo RC28',()=>{
  const projection=read('src/m26/security/role-projection.js');
  assert.match(projection,/if\(role!==['"]client['"]\)/);
});
check('CSS RC39 está cargado',()=>{
  assert.match(read('public/m26/index.html'),/\/src\/m26\/rc39\/rc39\.css/);
});
check('Producción no se despliega desde este release',()=>{
  const docs=read('docs/RC39_INTEGRATED_CLIENT_COACH_MULTIROLE.md');
  assert.match(docs,/no despliega/i);
});

const failed=checks.filter((item)=>!item.ok);
const report={
  release:'IBERFIT_M26_RC39_INTEGRATED_CLIENT_COACH_MULTIROLE',
  generatedAt:new Date().toISOString(),
  total:checks.length,
  passed:checks.length-failed.length,
  failed:failed.length,
  checks,
  ok:failed.length===0,
  productionModified:false,
  productionDeployed:false,
  operationalSheetModified:false,
  backendMigrationAutomatic:false,
};
console.log(JSON.stringify(report,null,2));
if(failed.length)process.exitCode=1;
