import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveAdminOperationsTriage,isOperationalTaskOpen} from '../src/m26/admin/operation-triage.js';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {deriveAdminCommandCenter} from '../src/m26/admin/command-center.js';

const now=new Date('2026-10-18T12:00:00.000Z');
const users=[{id:'admin-1',name:'María García'},{id:'admin-2',email:'responsable@iberfit.cl'}];
const tasks=[
  {id:'normal-1',title:'Rutina',status:'open',priority:'normal',createdAt:'2026-10-15T12:00:00Z'},
  {id:'critical-future',title:'Seguridad',status:'open',priority:'critical',assigneeUserId:'admin-1',dueAt:'2026-10-19',revision:4},
  {id:'high-due',title:'Validación',status:'pending',priority:'high',assigneeUserId:'admin-2',dueAt:'2026-10-18'},
  {id:'critical-expired',title:'Acceso bloqueado',status:'open',priority:'critical',dueAt:'2026-10-17',detail:'Revisar credenciales',revision:2},
  {id:'invalid-date',title:'Fecha ilegible',status:'in_progress',priority:'high',dueAt:'2026-02-30',assigneeUserId:'missing'},
  {id:'closed-1',title:'Incidencia resuelta',status:'resolved',priority:'critical',dueAt:'2026-10-17',resolutionNote:'Cerrado con evidencia',resolvedAt:'2026-10-18T10:00:00Z'},
  {id:'closed-2',title:'Incidencia cancelada',status:'cancelled',priority:'high'},
];
const triage=()=>deriveAdminOperationsTriage({tasks,users,now,timeZone:'America/Santiago'});

test('operational classification and priorities are deterministic, immutable and sourced from open tasks',()=>{
  const original=JSON.stringify(tasks);
  const result=triage();
  assert.deepEqual(result.open.map(x=>x.task.id),
    ['critical-expired','critical-future','high-due','invalid-date','normal-1']);
  assert.deepEqual(result.history.map(x=>x.task.id),['closed-1','closed-2']);
  assert.deepEqual(result.summary,{open:5,critical:2,high:2,overdue:1,unassigned:2,history:2});
  assert.equal(result.open[0].ownerLabel,'Sin responsable asignado');
  assert.equal(result.open[1].ownerLabel,'María García');
  assert.equal(result.open[2].ownerLabel,'responsable@iberfit.cl');
  assert.equal(result.open[3].ownerLabel,'Responsable sin nombre verificado');
  assert.equal(result.open[0].overdue,true);
  assert.equal(result.open[2].dueToday,true);
  assert.equal(result.open[3].overdue,false,'invalid calendar date must never imply urgency');
  assert.equal(result.open[3].dueLabel,null);
  assert.equal(JSON.stringify(tasks),original,'presentation cannot mutate source tasks');
  assert.equal(Object.isFrozen(result.summary),true);
  assert.equal(isOperationalTaskOpen({status:'resolved'}),false);
  assert.equal(isOperationalTaskOpen({status:'closed'}),false);
  assert.equal(isOperationalTaskOpen({status:'open'}),true);
});

test('timestamps respect organization timezone and date-only deadlines never move a calendar day',()=>{
  const result=deriveAdminOperationsTriage({
    tasks:[
      {id:'date-only',status:'open',priority:'high',dueAt:'2026-10-18'},
      {id:'instant',status:'open',priority:'high',dueAt:'2026-10-19T01:00:00Z'},
    ],
    now,timeZone:'America/Santiago',
  });
  assert.equal(result.summary.overdue,0);
  assert.ok(result.open.every(x=>x.dueToday),'local October 18 is due today for both');
  assert.equal(result.open.find(x=>x.task.id==='date-only').dueLabel,'18/10/2026');
});

test('Admin Operaciones preserves the existing reason/revision command and protects closed tasks from resolution',()=>{
  const html=renderAdminRoute({
    admin:{available:true},kind:'admin-operaciones',tasks,
    operationTriage:triage(),canManage:true,organization:{timezone:'America/Santiago'},
  });
  assert.match(html,/data-admin-surface="operations"/);
  assert.match(html,/Abiertas<\/span><strong>5<\/strong>/);
  assert.match(html,/Vencidas<\/span><strong>1<\/strong>/);
  assert.match(html,/data-admin-operation-status="open"/);
  assert.match(html,/data-admin-operation-status="closed"/);
  const first=html.indexOf('Acceso bloqueado'),second=html.indexOf('Seguridad'),normal=html.indexOf('Rutina');
  assert.ok(first>=0&&second>first&&normal>second,'first visible tasks follow severity and due date');
  assert.equal((html.match(/data-admin-form="task-resolve"/g)||[]).length,5);
  assert.match(html,/name="baseRevision" value="2"/);
  assert.match(html,/name="reason" minlength="3" required maxlength="500"/);
  assert.match(html,/data-admin-form="task-create"/);
  assert.match(html,/Historial de incidencias · 2/);
  assert.match(html,/Cerrado con evidencia/);
  const history=html.slice(html.indexOf('m26-admin-operation-history'));
  assert.doesNotMatch(history,/data-admin-form="task-resolve"/);
  assert.match(html,/Sin responsable asignado/);
  assert.match(html,/Fecha límite no verificable/);
});

test('read-only Admin sees the same truthful queue without create or resolve commands',()=>{
  const html=renderAdminRoute({
    admin:{available:true},kind:'admin-operaciones',tasks,
    operationTriage:triage(),canManage:false,
  });
  assert.match(html,/Seguridad/);
  assert.doesNotMatch(html,/data-admin-form="task-create"|data-admin-form="task-resolve"/);
  const empty=renderAdminRoute({
    admin:{available:true},kind:'admin-operaciones',tasks:[],canManage:false,
  });
  assert.match(empty,/Sin incidencias pendientes/);
  assert.doesNotMatch(empty,/Historial de incidencias/);
});

test('task detail, owner and resolution are escaped, and urgency never trusts priority markup',()=>{
  const dirty=deriveAdminOperationsTriage({
    tasks:[{id:'<img src=x>',title:'<script>alert(1)</script>',detail:'<b>not trusted</b>',status:'open',priority:'critical\" aria-label=\"evil'}],
    users:[],now,
  });
  const html=renderAdminRoute({
    admin:{available:true},kind:'admin-operaciones',tasks:dirty.open.map(x=>x.task),
    operationTriage:dirty,canManage:true,
  });
  assert.doesNotMatch(html,/<script>|<b>not trusted<\/b>|<img src=x>/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/data-priority="normal"/);
  assert.match(html,/name="taskId" value="&lt;img src=x&gt;"/);
});

test('Command Center preview displays only open operational tasks and retains its route link',()=>{
  const cmd=deriveAdminCommandCenter({
    clients:[],coaches:[],
    tasks:[{id:'closed',status:'cerrado',priority:'critical'},{id:'open',status:'open',priority:'high'}],
  });
  assert.equal(cmd.summary.openTasks,1);
  assert.equal(cmd.summary.criticalTasks,1);
  const home=renderAdminRoute({
    admin:{available:true},kind:'admin-inicio',summary:{},tasks:triage().open.map(x=>x.task),
    audit:[],commandCenter:deriveAdminCommandCenter({clients:[],coaches:[],tasks}),
  });
  assert.match(home,/data-m26-area="admin-operaciones">Ver incidencias<\/button>/u);
  assert.doesNotMatch(home,/Incidencia resuelta|Incidencia cancelada/u);
  const view=readFileSync(new URL('../src/m26/admin/view-model.js',import.meta.url),'utf8');
  assert.match(view,/tasks:Object\.freeze\(operations\.open\.slice\(0,12\)\.map\(\(item\)=>item\.task\)\)/);
  assert.match(view,/deriveAdminOperationsTriage/u);
  const css=readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
  const start=css.indexOf('SIGNATURE 360 U7 · Admin operations');
  const end=css.indexOf('/* SIGNATURE 360 U7 END */',start);
  assert.ok(start>=0&&end>start,'U7 section markers remain intact');
  const block=css.slice(start,end);
  assert.ok(block.length>0);
  assert.match(block,/@media\(max-width:760px\)/);
  assert.match(block,/@media\(max-width:390px\)/);
  assert.match(block, /@media\(forced-colors:active\)/);
  assert.match(block,/min-height:48px/);
  assert.match(block,/outline:3px solid var\(--iberfit-color-focus\)/);
  assert.doesNotMatch(block,/position:fixed|white-space:nowrap|overflow:hidden/u);
});
