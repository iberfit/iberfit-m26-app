import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderCompletedSessionHistory} from '../src/m26/rc39/completed-session-history.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
const css=readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8');

test('RC39 Client restores confirmed session history with useful facts and excludes unfinished executions',()=>{
  const model={kind:'sesion',role:'client',serviceActive:true,
    selectedClient:{modality:'hibrido'},rc39:{role:'client',sessionProjections:[]},
    executions:[
      {statusRaw:'completada',date:'2026-10-14',
        body:{status:'completada',completedAt:'2026-10-14T10:00:00Z',
          sourceSnapshot:{title:'Sesión fuerza y carrera'},
          results:{a:{reps:8},b:{distanceKm:4}},feedback:{sessionRpe:7}}},
      {statusRaw:'en_curso',body:{status:'en_curso',title:'No publicar aún'}},
    ]};
  const html=renderCompletedSessionHistory(model);
  assert.match(html,/Sesión fuerza y carrera/);
  assert.match(html,/2 registros/);
  assert.match(html,/Esfuerzo percibido 7\/10/);
  assert.doesNotMatch(html,/No publicar aún/);
  assert.equal((html.match(/data-m43-completed-session/g)||[]).length,1);
  assert.match(renderRc39Route(model),/data-m43-session-history/);
  assert.doesNotMatch(renderRc39Route({...model,role:'coach'}),/data-m43-session-history/);
});
test('RC39 history safe empty state plus mobile wrapping',()=>{
  assert.match(renderCompletedSessionHistory({executions:[]}),/Cuando completes una sesión/);
  assert.match(css,/\.m26-session-experience__capability\{\s*display:inline-flex;\s*flex:0 0 auto;/);
  assert.match(css,/\.m26-session-experience__capabilities\{flex-wrap:wrap;overflow:visible;/);
});

test('SIGNATURE history omits only a redundant empty panel, never completed records',()=>{
  const empty={kind:'sesion',role:'client',rc39:{role:'client',sessionProjections:[]},executions:[]};
  assert.equal(renderCompletedSessionHistory(empty,{hideEmpty:true}),'');
  assert.match(renderCompletedSessionHistory(empty),/Cuando completes una sesión/u,'other consumers retain the default empty description');
  assert.doesNotMatch(renderRc39Route(empty),/data-m43-session-history/u,'Client empty screen stays concise');
  const confirmed={...empty,executions:[{
    statusRaw:'completada',
    date:'2026-10-14',
    body:{status:'completada',sessionId:'old-1',completedAt:'2026-10-14T10:00:00Z',
      sourceSnapshot:{title:'Fuerza completada'},results:{set1:{reps:8}}},
  }]};
  const html=renderRc39Route(confirmed);
  assert.match(html,/data-m43-session-history/u);
  assert.match(html,/Fuerza completada/u);
  assert.equal((html.match(/data-m43-completed-session/gu)||[]).length,1);
  const incomplete={...empty,executions:[{statusRaw:'en_curso',body:{status:'en_curso',title:'NO CONFIRMADO'}}]};
  assert.doesNotMatch(renderRc39Route(incomplete),/data-m43-session-history|NO CONFIRMADO/u);
});
