import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {deriveAdminOperationsTriage} from '../src/m26/admin/operation-triage.js';

const home=({tasks=[],clients=[],audit=[]}={})=>renderAdminRoute({
  admin:true,kind:'admin-inicio',summary:{activeClients:2},
  organization:{timezone:'America/Santiago',locale:'es-CL'},
  operationTriage:deriveAdminOperationsTriage({tasks,now:'2026-10-23T12:00:00-03:00',timeZone:'America/Santiago'}),
  commandCenter:{summary:{activeClients:2,pausedClients:0,unassignedClients:1,iriPending:1,
    planningPending:0,schedulingPending:1,openTasks:tasks.length,criticalTasks:1},
    priorities:clients,coachLoad:[]},tasks,audit,
});

test('B4 orders verified urgent tasks before client action and KPIs',()=>{
  const html=home({
    tasks:[{id:'past',title:'Vencimiento',priority:'normal',status:'open',dueAt:'2026-10-22'},
      {id:'critical',title:'Incidencia crítica',priority:'critical',status:'open',assigneeUserId:'staff'},
      {id:'closed',title:'No pendiente',priority:'critical',status:'resolved'}],
    clients:[{kind:'warning',stageLabel:'Evaluación',clientName:'Cliente visible',
      action:{area:'admin-clientes',label:'Revisar',reason:'IRI pendiente'}}],
  });
  const critical=html.indexOf('Incidencia crítica'),past=html.indexOf('Vencimiento');
  assert.ok(critical>0&&past>critical&&html.indexOf('Cliente visible')>past);
  assert.ok(html.indexOf('m30-admin-kpis')>html.indexOf('Cliente visible'));
  assert.match(html,/Responsable sin nombre verificado/u);
  assert.match(html,/Vencida/u);
  assert.ok(!html.includes('No pendiente'));
  assert.match(html,/data-m26-area="admin-operaciones"/u);
});

test('B4 labels bounded previews and preserves route access',()=>{
  const tasks=Array.from({length:14},(_,i)=>({id:String(i),title:'Incidencia '+i,status:'open',priority:i<4?'critical':'normal'}));
  const clients=Array.from({length:10},(_,i)=>({kind:'warning',clientName:'Cliente '+i,stageLabel:'Seguimiento',
    action:{area:'admin-clientes',label:'Revisar',reason:'Pendiente'}}));
  const html=home({tasks,clients});
  assert.match(html,/Se muestran 3 de 4/u);
  assert.match(html,/Mostrando 12 de 14/u);
  assert.match(html,/Primeros 8 de 10/u);
  for(const x of ['Ver incidencias','Ver auditoría','Ver equipo','Capacidad de Coaches','Actividad administrativa reciente']){
    assert.ok(html.includes(x),x);
  }
});

test('B4 protects HTML from input injection and does not invent audit results',()=>{
  assert.ok(!home().includes('m26-admin-command-urgent-row'));
  const html=home({tasks:[{id:'x',priority:'critical',status:'open',title:'<img src=x onerror=alert(1)>'}],
    audit:[{summary:'Cambio autorizado',occurredAt:'2026-10-23T14:00:00Z'}]});
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/u);
  assert.ok(!html.includes('<img src=x'));
  assert.match(html,/<time datetime="2026-10-23T14:00:00.000Z">/u);
  assert.match(html,/Últimos registros visibles, sin presumir resultado/u);
});

test('B4 uses canonical Admin CSS, focus, compact mobile and forced-colors without overrides',()=>{
  const css=readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
  const start=css.indexOf('/* SIGNATURE 360 B4 ·');
  const end=css.indexOf('/* SIGNATURE 360 B4 END */',start);
  assert.ok(start>=0&&end>start,'B4 section markers remain intact');
  const b4=css.slice(start,end);
  assert.ok(b4.startsWith('/* SIGNATURE 360 B4 ·'));
  for(const term of ['.m30-admin-command-route .m30-admin-kpis','@media(max-width:1180px)',
    '@media(max-width:620px)','@media(max-width:390px)',':focus-visible','@media(forced-colors:active)']){
    assert.ok(b4.includes(term),term);
  }
  assert.ok(!b4.includes('!important'));
  assert.ok(!b4.includes('display:none'));
});
