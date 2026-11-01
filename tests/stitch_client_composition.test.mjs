import test from 'node:test';
import assert from 'node:assert/strict';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';
const vm={role:'client',serviceKind:'training',clients:[{id:'synthetic',name:'Cliente <QA>',serviceActive:true}],appointments:[],upcoming:[],operations:{}};
test('session decision moves below greeting and keeps the real authorized start command',()=>{
  const html=renderHoyRoute({...vm,rc39:{sessionProjections:[{id:'session-qa',visible:true,canClientStart:true,session:{title:'Fuerza <QA>'}}]}});
  const zone=html.indexOf('class="m26-client-home-primary-zone"');
  assert.ok(html.indexOf('class="m26-client-home-status"')>zone);
  assert.match(html,/Fuerza &lt;QA&gt;/);
  assert.match(html,/data-workflow-action="start-published-session" data-entity-id="session-qa"/);
  assert.equal((html.match(/class="m26-today-action is-primary"/g)||[]).length,1);
});
test('read-only, paused and IRI-only states never gain session execution from visual adaptation',()=>{
  for(const state of [
    {...vm,rc39:{sessionProjections:[{id:'readonly',visible:true,canClientStart:false,session:{title:'Consulta'}}]}},
    {...vm,clients:[{...vm.clients[0],serviceActive:false}]},
    {...vm,serviceKind:'iri'},
  ])assert.doesNotMatch(renderHoyRoute(state),/data-workflow-action="start-published-session"/);
});

test('Stitch week preview never fabricates plans or session completion',async()=>{
  const {renderClientWeekRail}=await import('../src/m26/modules/route-render.js');
  const html=renderClientWeekRail([
    {date:'2026-10-30T21:00:00Z',statusRaw:'confirmada'},
    {date:'2026-10-31T18:00:00Z',statusRaw:'propuesta'},
    {date:'2026-11-01T12:00:00Z',statusRaw:'confirmed'},
    {date:'invalid',statusRaw:'confirmada'},
  ],new Date('2026-10-30T12:00:00Z'));
  assert.equal((html.match(/<li class="m26-client-week-day/g)||[]).length,7);
  assert.match(html,/data-day="2026-10-30" data-date-status="confirmed"/);
  assert.match(html,/data-day="2026-10-31" data-date-status="not-shown"/);
  assert.match(html,/data-day="2026-11-01" data-date-status="confirmed"/);
  assert.match(html,/data-m26-area="planificacion"/);
  assert.doesNotMatch(html,/4\s*\/\s*5|Sesiones cumplidas|David V\.|start-published-session/i);
  assert.equal((html.match(/aria-current="date"/g)||[]).length,1);
  assert.equal(renderClientWeekRail([],new Date('invalid')),'');
});
test('Stitch weekly calendar is visible only in Client training context and remains accessible',async()=>{
  const {renderClientWeekRail}=await import('../src/m26/modules/route-render.js');
  const doc=renderHoyRoute({...vm,upcoming:[{date:'2026-10-31T17:00:00Z',statusRaw:'confirmada',id:'synthetic'}]});
  assert.match(doc,/data-client-week-rail/);
  assert.ok(doc.indexOf('data-client-week-rail')>doc.indexOf('class="m26-client-home-primary-zone"'));
  assert.ok(doc.indexOf('data-client-week-rail')<doc.indexOf('data-client-home-compass'));
  assert.ok(doc.indexOf('data-client-week-rail')<doc.indexOf('class="m26-client-home-glance"'));
  assert.doesNotMatch(renderHoyRoute({...vm,serviceKind:'iri_only'}),/data-client-week-rail/);
  const fs=await import('node:fs');
  const css=fs.readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
  const start=css.indexOf('Stitch V2.3 · 7-day editorial rhythm');
  const end=css.indexOf('/* SIGNATURE B6 ·',start);
  assert.ok(start>0&&end>start);
  const rules=css.slice(start,end);
  assert.match(rules,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(rules,/max-width:370px/);
  assert.match(rules,/forced-colors:active/);
  assert.match(rules,/focus-visible/);
  assert.doesNotMatch(rules,/!important|position:fixed|pointer-events:none/);
  assert.match(renderClientWeekRail([{date:'2026-10-31',statusRaw:'confirmada'}],new Date('2026-11-01T12:00:00Z')),/data-day="2026-10-31" data-date-status="confirmed"/);
});

test('U104 Client weekly calendar tells the truth about empty/confirmed dates',async()=>{
 const {renderClientWeekRail}=await import('../src/m26/modules/route-render.js');
 const clock=new Date('2026-11-01T12:00:00Z');
 const empty=renderClientWeekRail([],clock);
 assert.match(empty,/data-week-confirmed-count="0"/);
 assert.match(empty,/Sin citas confirmadas esta semana/);
 assert.doesNotMatch(empty,/Citas confirmadas próximas/);
 assert.equal((empty.match(/<li class="m26-client-week-day/g)||[]).length,7);
 assert.match(empty,/aria-label="Ver planificación semanal"/);
 const withConfirmed=renderClientWeekRail([
  {date:'2026-10-30T21:00:00Z',statusRaw:'confirmada'},
  {date:'2026-11-01T13:00:00Z',statusRaw:'confirmed'},
  {date:'2026-10-31T14:00:00Z',statusRaw:'propuesta'},
  {date:'2026-11-09T13:00:00Z',statusRaw:'confirmed'},
 ],clock);
 assert.match(withConfirmed,/data-week-confirmed-count="2"/);
 assert.match(withConfirmed,/Citas confirmadas esta semana/);
 assert.equal((withConfirmed.match(/data-date-status="confirmed"/g)||[]).length,2);
 const futureOnly=renderClientWeekRail([{date:'2026-11-09T13:00:00Z',statusRaw:'confirmed'}],clock);
 assert.match(futureOnly,/data-week-confirmed-count="0"/);
 assert.match(futureOnly,/Sin citas confirmadas esta semana/);
 assert.doesNotMatch(withConfirmed,/4\s*\/\s*5|Sesiones cumplidas|start-published-session/i);
});
