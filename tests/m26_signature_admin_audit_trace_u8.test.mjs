import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveAdminAuditTimeline} from '../src/m26/admin/audit-experience.js';
import {renderAdminRoute} from '../src/m26/admin/route-render.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const events=[
  {id:'a',eventType:'ADMIN_TAREA_RESOLVER',actorUserId:'u-1',actorApplication:'admin',entityType:'operational_task',entityId:'task-1',occurredAt:'2026-10-18T17:00:00Z',traceId:'trace-1',summary:'Incidencia revisada',revision:4},
  {id:'b',eventType:'USER_ROLE_GRANT',actorUserId:'missing-user',actorApplication:'admin',entityType:'user',entityId:'u-2',occurredAt:'2026-10-18T18:00:00Z',summary:'Cambio de acceso'},
  {id:'c',eventType:'CLIENT_UPDATED',entityType:'client',entityId:'client-1',occurredAt:'not-a-date',summary:'Registro sin fecha'},
];
const opts={
  users:[{id:'u-1',name:'Elena Fernández'},{id:'u-2',name:'David P.'}],
  clients:[{id:'client-1',name:'Cliente Prado'}],
  tasks:[{id:'task-1',title:'Verificación de acceso'}],
  timeZone:'America/Santiago',locale:'es-CL',
};
const timeline=()=>deriveAdminAuditTimeline({events,...opts});

test('audit timeline resolves names only from authorized records and retains events without alteration',()=>{
  const original=JSON.stringify(events);
  const t=timeline();
  assert.equal(t.summary.total,3);
  assert.equal(t.summary.unidentifiedActors,1);
  assert.equal(t.summary.unverifiedDates,1);
  assert.equal(t.summary.outcomesUnavailable,3);
  assert.deepEqual(t.events.map(v=>v.event.id),['b','a','c']);
  assert.equal(t.events[0].actorLabel,'Identidad no identificada');
  assert.equal(t.events[0].entityLabel,'Cuenta: David P.');
  assert.equal(t.events[1].actorLabel,'Elena Fernández');
  assert.equal(t.events[1].entityLabel,'Incidencia: Verificación de acceso');
  assert.equal(t.events[2].actorLabel,'Actor no indicado');
  assert.equal(t.events[2].entityLabel,'Cliente: Cliente Prado');
  assert.equal(t.events[2].dateLabel,'Fecha no verificable');
  assert.ok(t.events.every(v=>v.resultLabel==='Resultado no registrado'));
  assert.equal(JSON.stringify(events),original);
  assert.ok(Object.isFrozen(t)&&Object.isFrozen(t.events));
});

test('malformed ids, unauthorised names and invalid dates never create false identity or success',()=>{
  const t=deriveAdminAuditTimeline({events:[
    {id:'z',actorUserId:'opaque-actor',entityId:'opaque',entityType:'client',actorApplication:'unknown',occurredAt:'invalid',eventType:'OP'},
    {id:'null',occurredAt:'2026-10-18T23:59:00Z'},
  ],...opts});
  const unnamed=t.events.find(x=>x.event.id==='z');
  assert.equal(unnamed.actorLabel,'Identidad no identificada');
  assert.equal(unnamed.entityLabel,'Cliente sin nombre verificado');
  assert.equal(unnamed.applicationLabel,'Aplicación no identificada');
  assert.equal(unnamed.dateIso,'');
  assert.equal(unnamed.title,'Evento sin resumen');
  assert.equal(t.events.find(x=>x.event.id==='null').resultLabel,'Resultado no registrado');
});

test('audit route prioritises actor, entity and time while keeping exact trace ids subordinate',()=>{
  const html=renderAdminRoute({
    admin:{available:true},kind:'admin-auditoria',
    events,auditTimeline:timeline(),organization:{timezone:'America/Santiago'},
  });
  assert.match(html,/data-admin-surface="audit"/);
  assert.match(html,/<ol class="m26-admin-audit-timeline">/);
  assert.match(html,/Elena Fernández/);
  assert.match(html,/Incidencia: Verificación de acceso/);
  assert.match(html,/Resultado no registrado/);
  assert.match(html,/<time datetime="2026-10-18T18:00:00.000Z">/);
  assert.ok(html.indexOf('Cambio de acceso')<html.indexOf('Incidencia revisada'));
  assert.match(html,/<details class="m26-admin-audit-evidence">/);
  assert.match(html,/trace-1/);
  const start=html.indexOf('Incidencia revisada');
  const entry=html.slice(start,html.indexOf('</li>',start));
  assert.ok(entry.indexOf('Ver identificadores de trazabilidad')>0,'technical disclosure follows the human event heading');
  assert.doesNotMatch(html,/data-admin-form=/);
});

test('audit route escapes untrusted data in both visible labels and identifiers',()=>{
  const dirty=deriveAdminAuditTimeline({
    events:[{summary:'<img src=x onerror=alert(1)>',actorUserId:'<script>x</script>',entityId:'<b>bad</b>',entityType:'client',traceId:'<iframe>bad</iframe>',occurredAt:'not-real'}],
    users:[],clients:[],
  });
  const html=renderAdminRoute({admin:{available:true},kind:'admin-auditoria',events:dirty.events.map(x=>x.event),auditTimeline:dirty});
  assert.doesNotMatch(html,/<img src=x|<script>|<b>bad|<iframe>/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html,/&lt;iframe&gt;bad&lt;\/iframe&gt;/);
});

test('empty audits are honest and have no invented outcome',()=>{
  const html=renderAdminRoute({admin:{available:true},kind:'admin-auditoria',events:[]});
  assert.match(html,/No hay auditoría visible en los registros autorizados/);
  assert.doesNotMatch(html,/<ol class="m26-admin-audit-timeline">/);
  assert.doesNotMatch(html,/trace-1/);
});

test('audit timeline preserves responsive, keyboard, and translated message contracts',()=>{
  const css=readFileSync(new URL('../src/m26/admin/admin.css',import.meta.url),'utf8');
  const block=css.slice(css.indexOf('SIGNATURE 360 U8: human-first Admin audit'));
  assert.ok(block.length>0);
  assert.match(block,/@media\(max-width:760px\)/);
  assert.match(block,/@media\(max-width:390px\)/);
  assert.match(block,/@media\(forced-colors:active\)/);
  assert.match(block,/min-height:48px/);
  assert.match(block,/outline:3px solid var\(--iberfit-color-focus\)/);
  assert.doesNotMatch(block,/position:fixed/);
  for(const language of ['en','fr','pt']){
    assert.notEqual(iberfitSurfaceTranslate('Resultado no registrado',{language}),'Resultado no registrado');
    assert.notEqual(iberfitSurfaceTranslate('Identidad no identificada',{language}),'Identidad no identificada');
  }
});
